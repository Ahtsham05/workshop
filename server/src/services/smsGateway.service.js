const crypto = require('crypto');
const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { SmsDevice, SmsGatewayMessage } = require('../models');
const { normalizePhone } = require('../utils/whatsappPhone');
const { resolveContactNamesByPhone } = require('../utils/resolveContactName');
const logger = require('../config/logger');

// In-memory socket registry: deviceId → socket
const connectedSockets = new Map();

// $match in an aggregation pipeline does no schema-aware casting (unlike .find()/
// .countDocuments()), so an organizationId/branchId that arrives as a header string
// rather than an ObjectId instance would silently match zero documents.
const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id));

const SUCCESS_STATUSES = ['sent', 'delivered'];
const PENDING_STATUSES = ['pending', 'dispatched'];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function registerDevice({ organizationId, branchId, deviceName, simSlot, phoneNumber }) {
  const deviceId = crypto.randomUUID();
  const token = generateToken();
  const device = await SmsDevice.create({
    organizationId,
    branchId,
    deviceId,
    deviceName: deviceName || 'Android Device',
    token,
    simSlot: simSlot ?? 0,
    phoneNumber: phoneNumber || '',
  });
  return device;
}

async function listDevices({ organizationId, branchId }) {
  const query = { organizationId };
  if (branchId) query.branchId = branchId;
  return SmsDevice.find(query).sort({ createdAt: -1 }).lean();
}

async function deleteDevice({ deviceId, organizationId }) {
  const device = await SmsDevice.findOne({ deviceId, organizationId });
  if (!device) throw new ApiError(httpStatus.NOT_FOUND, 'Device not found');
  await SmsDevice.deleteOne({ _id: device._id });
}

// SmsDevice.isOnline alone isn't reliable — it's only flipped false on a clean socket
// disconnect, so a server restart (which wipes the in-memory `connectedSockets` registry
// but not the DB) leaves stale "online" devices with nothing actually listening. Requiring
// a live socket too means a send either genuinely dispatches or fails immediately with a
// clear reason — it can never land in 'pending' with nothing behind it.
async function getConnectedDevice(organizationId, branchId) {
  const query = { organizationId, isOnline: true };
  if (branchId) query.branchId = branchId;
  const candidates = await SmsDevice.find(query).lean();
  return candidates.find((d) => connectedSockets.has(d.deviceId)) || null;
}

const NO_DEVICE_ERROR =
  'No SMS gateway device is currently connected. Open the SMS Gateway app on your phone to reconnect, then try again.';

async function sendSms({ organizationId, branchId, to, message, source, refId }) {
  const device = await getConnectedDevice(organizationId, branchId);
  if (!device) {
    await SmsGatewayMessage.create({
      organizationId,
      branchId,
      to,
      message,
      status: 'failed',
      error: NO_DEVICE_ERROR,
      source: source || 'manual',
      refId: refId || null,
    });
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, NO_DEVICE_ERROR);
  }

  const msg = await SmsGatewayMessage.create({
    organizationId,
    branchId,
    deviceId: device.deviceId,
    to,
    message,
    status: 'pending',
    source: source || 'manual',
    refId: refId || null,
  });

  const socket = connectedSockets.get(device.deviceId);
  socket.emit('sms:send', {
    messageId: msg._id.toString(),
    to: msg.to,
    message: msg.message,
    simSlot: device.simSlot,
  });
  await SmsGatewayMessage.updateOne({ _id: msg._id }, { status: 'dispatched', dispatchedAt: new Date() });
  msg.status = 'dispatched';

  return msg;
}

async function sendBulkSms({ organizationId, branchId, recipients, message, source, refId }) {
  const results = [];
  for (const recipient of recipients) {
    try {
      const msg = await sendSms({ organizationId, branchId, to: recipient.to, message: message.replace('{name}', recipient.name || ''), source, refId });
      results.push({ to: recipient.to, status: msg.status });
    } catch (err) {
      results.push({ to: recipient.to, status: 'failed', error: err.message });
    }
  }
  return results;
}

// Re-sends a message in place (same document, new device/status) rather than creating a
// second row. Allowed for 'failed' (the normal case) as well as 'pending'/'dispatched' —
// those statuses can get stuck with nothing behind them (see getConnectedDevice above),
// and the user needs a manual way to retry or clear them rather than being stuck forever.
async function resendSms({ organizationId, branchId, messageId }) {
  const query = { _id: messageId, organizationId };
  if (branchId) query.branchId = branchId;
  const message = await SmsGatewayMessage.findOne(query);
  if (!message) throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  if (!['failed', 'pending', 'dispatched'].includes(message.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only failed or pending messages can be resent');
  }

  const device = await getConnectedDevice(organizationId, message.branchId);
  if (!device) {
    message.status = 'failed';
    message.error = NO_DEVICE_ERROR;
    await message.save();
    return { success: false, message };
  }

  message.deviceId = device.deviceId;
  message.status = 'pending';
  message.error = null;
  await message.save();

  const socket = connectedSockets.get(device.deviceId);
  socket.emit('sms:send', {
    messageId: message._id.toString(),
    to: message.to,
    message: message.message,
    simSlot: device.simSlot,
  });
  message.status = 'dispatched';
  message.dispatchedAt = new Date();
  await message.save();

  return { success: true, message };
}

async function updateMessageStatus({ messageId, status, error }) {
  const update = { status };
  if (status === 'sent') update.sentAt = new Date();
  if (status === 'delivered') update.deliveredAt = new Date();
  if (error) update.error = error;
  await SmsGatewayMessage.updateOne({ _id: messageId }, update);
}

// Filterable, paginated log of every SMS sent (or attempted) for this org/branch, plus a
// status-group summary computed over the same filters minus `status` itself — so the
// filter tabs can show live counts without a second round trip per tab.
async function getMessages({ organizationId, branchId, page = 1, limit = 20, status, source, search }) {
  const baseMatch = { organizationId: toObjectId(organizationId) };
  if (branchId) baseMatch.branchId = toObjectId(branchId);
  if (source) baseMatch.source = source;
  if (search) baseMatch.to = { $regex: escapeRegExp(search), $options: 'i' };

  const match = { ...baseMatch };
  if (status === 'success') match.status = { $in: SUCCESS_STATUSES };
  else if (status === 'pending') match.status = { $in: PENDING_STATUSES };
  else if (status && status !== 'all') match.status = status;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

  const [results, totalResults, counts] = await Promise.all([
    SmsGatewayMessage.find(match)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    SmsGatewayMessage.countDocuments(match),
    SmsGatewayMessage.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          success: { $sum: { $cond: [{ $in: ['$status', SUCCESS_STATUSES] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $in: ['$status', PENDING_STATUSES] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const { total = 0, success = 0, failed = 0, pending = 0 } = counts[0] || {};

  const nameMap = await resolveContactNamesByPhone(organizationId, branchId, results.map((r) => r.to));
  const withNames = results.map((r) => ({
    ...r,
    contactName: nameMap.get(normalizePhone(r.to)?.slice(-10)),
  }));

  return {
    results: withNames,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.max(1, Math.ceil(totalResults / limitNum)),
    totalResults,
    summary: { total, success, failed, pending },
  };
}

// Deleting is restricted to failed/pending/dispatched — a log-cleanup action, not a way
// to edit history of messages that actually went through (sent/delivered).
async function deleteSms({ organizationId, branchId, messageId }) {
  const query = { _id: messageId, organizationId };
  if (branchId) query.branchId = branchId;
  const message = await SmsGatewayMessage.findOne(query);
  if (!message) throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  if (!['failed', 'pending', 'dispatched'].includes(message.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only failed or pending messages can be deleted');
  }
  await SmsGatewayMessage.deleteOne({ _id: message._id });
}

// Socket registry helpers used by socket handler
function registerSocket(deviceId, socket) {
  connectedSockets.set(deviceId, socket);
}

function unregisterSocket(deviceId) {
  connectedSockets.delete(deviceId);
}

async function authenticateDevice(token) {
  const device = await SmsDevice.findOne({ token });
  if (!device) throw new Error('Invalid device token');
  return device;
}

async function markDeviceOnline(deviceId, socketId) {
  await SmsDevice.updateOne({ deviceId }, { isOnline: true, socketId, lastSeen: new Date() });
}

async function markDeviceOffline(deviceId) {
  await SmsDevice.updateOne({ deviceId }, { isOnline: false, socketId: null, lastSeen: new Date() });
}

async function updateDeviceStats(deviceId) {
  const today = new Date().toISOString().slice(0, 10);
  const device = await SmsDevice.findOne({ deviceId });
  if (!device) return;
  if (device.lastResetDate !== today) {
    await SmsDevice.updateOne({ deviceId }, { smsSentToday: 1, smsSentTotal: device.smsSentTotal + 1, lastResetDate: today });
  } else {
    await SmsDevice.updateOne({ deviceId }, { $inc: { smsSentToday: 1, smsSentTotal: 1 } });
  }
}

module.exports = {
  registerDevice,
  listDevices,
  deleteDevice,
  sendSms,
  sendBulkSms,
  resendSms,
  deleteSms,
  updateMessageStatus,
  getMessages,
  registerSocket,
  unregisterSocket,
  authenticateDevice,
  markDeviceOnline,
  markDeviceOffline,
  updateDeviceStats,
};
