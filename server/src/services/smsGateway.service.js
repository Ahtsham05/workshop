const crypto = require('crypto');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { SmsDevice, SmsGatewayMessage } = require('../models');
const logger = require('../config/logger');

// In-memory socket registry: deviceId → socket
const connectedSockets = new Map();

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

async function sendSms({ organizationId, branchId, to, message, source, refId }) {
  const query = { organizationId, isOnline: true };
  if (branchId) query.branchId = branchId;

  const device = await SmsDevice.findOne(query).lean();
  if (!device) {
    const msg = await SmsGatewayMessage.create({
      organizationId,
      branchId,
      to,
      message,
      status: 'failed',
      error: 'No online device found',
      source: source || 'manual',
      refId: refId || null,
    });
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'No SMS gateway device is currently online');
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
  if (socket) {
    socket.emit('sms:send', {
      messageId: msg._id.toString(),
      to: msg.to,
      message: msg.message,
      simSlot: device.simSlot,
    });
    await SmsGatewayMessage.updateOne({ _id: msg._id }, { status: 'dispatched', dispatchedAt: new Date() });
    msg.status = 'dispatched';
  }

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

async function updateMessageStatus({ messageId, status, error }) {
  const update = { status };
  if (status === 'sent') update.sentAt = new Date();
  if (status === 'delivered') update.deliveredAt = new Date();
  if (error) update.error = error;
  await SmsGatewayMessage.updateOne({ _id: messageId }, update);
}

async function getMessages({ organizationId, branchId, page, limit, status }) {
  const query = { organizationId };
  if (branchId) query.branchId = branchId;
  if (status) query.status = status;
  const skip = (page - 1) * limit;
  const [results, total] = await Promise.all([
    SmsGatewayMessage.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    SmsGatewayMessage.countDocuments(query),
  ]);
  return { results, total, page, totalPages: Math.ceil(total / limit) };
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
  updateMessageStatus,
  getMessages,
  registerSocket,
  unregisterSocket,
  authenticateDevice,
  markDeviceOnline,
  markDeviceOffline,
  updateDeviceStats,
};
