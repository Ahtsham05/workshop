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

// `isOnline` is overwritten with the computed liveness (heartbeat freshness) rather than
// the raw column, so the Settings device list and the SMS Messaging status badge are always
// answering the same question. The raw column on its own would show a phone as Online long
// after its process died without a clean disconnect.
async function listDevices({ organizationId, branchId }) {
  const query = { organizationId };
  if (branchId) query.branchId = branchId;
  const devices = await SmsDevice.find(query).sort({ createdAt: -1 }).lean();
  return devices.map((d) => ({ ...d, isOnline: isDeviceLive(d) }));
}

async function deleteDevice({ deviceId, organizationId }) {
  const device = await SmsDevice.findOne({ deviceId, organizationId });
  if (!device) throw new ApiError(httpStatus.NOT_FOUND, 'Device not found');
  await SmsDevice.deleteOne({ _id: device._id });
}

// `connectedSockets` only knows about phones attached to THIS node process. Once the same
// database is served by more than one process — a local dev server plus the deployed one,
// or two instances behind a load balancer — a device is regularly connected to a sibling
// process, and asking "is its socket in my Map?" wrongly answers no. Liveness therefore
// comes from the heartbeat the app sends every 30s (SocketService.ts), which every process
// can see because it lands in the shared `lastSeen` column.
//
// `isOnline` alone is still not enough: it is only flipped false on a *clean* disconnect,
// so a killed process leaves it true forever. Requiring a recent heartbeat as well means a
// device that died without saying goodbye ages out on its own.
const DEVICE_STALE_MS = 90 * 1000; // two missed 30s heartbeats

function isDeviceLive(device) {
  if (!device?.isOnline || !device.lastSeen) return false;
  return Date.now() - new Date(device.lastSeen).getTime() < DEVICE_STALE_MS;
}

/**
 * Picks the device a send should go to. Prefers one whose socket this process holds, since
 * that dispatches instantly; otherwise returns a device that is live on a sibling process,
 * whose pending messages that process's drainer will pick up within a couple of seconds.
 */
async function getConnectedDevice(organizationId, branchId) {
  const query = { organizationId, isOnline: true };
  if (branchId) query.branchId = branchId;
  const candidates = (await SmsDevice.find(query).lean()).filter(isDeviceLive);
  return candidates.find((d) => connectedSockets.has(d.deviceId)) || candidates[0] || null;
}

const NO_DEVICE_ERROR =
  'No SMS gateway device is currently connected. Open the SMS Gateway app on your phone to reconnect, then try again.';

/**
 * Hands one message to the phone if its socket lives in this process, and reports whether
 * it managed to. A false return is not a failure — the row stays 'pending' and the process
 * that actually holds the socket claims it on its next drain tick.
 */
function emitToDevice(device, msg) {
  const socket = connectedSockets.get(device.deviceId);
  if (!socket) return false;
  socket.emit('sms:send', {
    messageId: msg._id.toString(),
    to: msg.to,
    message: msg.message,
    simSlot: device.simSlot,
  });
  return true;
}

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

  if (emitToDevice(device, msg)) {
    // Scoped to 'pending' so a phone that ACKs 'sent' before this write lands does not get
    // its real delivery status stomped back to 'dispatched'.
    await SmsGatewayMessage.updateOne(
      { _id: msg._id, status: 'pending' },
      { status: 'dispatched', dispatchedAt: new Date() },
    );
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

// Connection status for the school SMS messaging screen. Mirrors the shape the WhatsApp
// screen gets from /whatsapp/status so both pages can render the same "connected / not
// connected" header. `connected` deliberately reuses getConnectedDevice's live-socket rule
// rather than SmsDevice.isOnline, so the badge can never claim ready while nothing is
// actually listening.
async function getGatewayStatus({ organizationId, branchId }) {
  const device = await getConnectedDevice(organizationId, branchId);
  const query = { organizationId };
  if (branchId) query.branchId = branchId;
  const totalDevices = await SmsDevice.countDocuments(query);
  if (!device) {
    return { connected: false, totalDevices, state: totalDevices ? 'OFFLINE' : 'NO_DEVICE' };
  }
  return {
    connected: true,
    state: 'READY',
    totalDevices,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    phoneNumber: device.phoneNumber || '',
    simSlot: device.simSlot,
    smsSentToday: device.smsSentToday || 0,
    smsSentTotal: device.smsSentTotal || 0,
    lastSeen: device.lastSeen || null,
  };
}

// Bulk send where every recipient carries its own already-rendered text (fee alerts differ
// per parent). Unlike sendBulkSms, this resolves the device once and writes the whole batch
// with two DB round trips instead of two per recipient — a 500-parent broadcast was 1000
// sequential writes before, which is what made large school broadcasts time out.
//
// No connected device is a whole-batch failure, not 500 individual ones: bailing out before
// any insert keeps the SMS Log clean instead of burying it under one failed row per student.
async function sendBulkPersonalized({ organizationId, branchId, recipients, source, refId }) {
  const valid = [];
  const failed = [];
  for (const r of recipients) {
    const to = String(r.phone ?? '').trim();
    const message = String(r.message ?? '').trim();
    if (!to) {
      failed.push({ phone: r.phone || '', name: r.name, reason: 'No phone number on record' });
    } else if (!message) {
      failed.push({ phone: to, name: r.name, reason: 'Message is empty' });
    } else {
      valid.push({ to, name: r.name, message });
    }
  }

  if (!valid.length) {
    return { total: recipients.length, sent: 0, failed };
  }

  const device = await getConnectedDevice(organizationId, branchId);
  if (!device) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, NO_DEVICE_ERROR);
  }
  const created = await SmsGatewayMessage.insertMany(
    valid.map((r) => ({
      organizationId,
      branchId,
      deviceId: device.deviceId,
      to: r.to,
      message: r.message,
      status: 'pending',
      source: source || 'bulk',
      refId: refId || null,
    })),
  );

  const emitted = created.filter((msg) => emitToDevice(device, msg));

  // Scoped to `status: 'pending'` because the phone can ACK 'sent' over the socket before
  // this write lands — without the guard the batch update would stomp a real delivery
  // status back to 'dispatched'. Anything not emitted here belongs to a sibling process
  // and stays 'pending' for its drainer to claim.
  if (emitted.length) {
    await SmsGatewayMessage.updateMany(
      { _id: { $in: emitted.map((m) => m._id) }, status: 'pending' },
      { status: 'dispatched', dispatchedAt: new Date() },
    );
  }

  return {
    total: recipients.length,
    sent: valid.length,
    failed,
    deviceName: device.deviceName,
  };
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

  if (emitToDevice(device, message)) {
    message.status = 'dispatched';
    message.dispatchedAt = new Date();
    await message.save();
  }

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

/**
 * Claims and sends messages left 'pending' for phones whose socket this process holds.
 *
 * This is what makes sending work when more than one process serves the same database: the
 * process that accepted the HTTP request may not be the one the phone is attached to, so it
 * writes the row and moves on, and whichever process owns the socket picks it up here.
 * `findOneAndUpdate` on `status: 'pending'` is the claim — only one process can win a given
 * row, so a message can never go out twice.
 *
 * Only recent rows are drained; anything older has missed its moment (a fee reminder should
 * not surprise a parent an hour late) and is left for an explicit resend from the SMS Log.
 */
const DRAIN_MAX_AGE_MS = 60 * 60 * 1000;
const DRAIN_BATCH = 50;

async function drainPendingForLocalDevices() {
  const deviceIds = Array.from(connectedSockets.keys());
  if (!deviceIds.length) return 0;

  const devices = await SmsDevice.find({ deviceId: { $in: deviceIds } }).lean();
  const deviceById = new Map(devices.map((d) => [d.deviceId, d]));

  const pending = await SmsGatewayMessage.find({
    deviceId: { $in: deviceIds },
    status: 'pending',
    createdAt: { $gte: new Date(Date.now() - DRAIN_MAX_AGE_MS) },
  })
    .sort({ createdAt: 1 })
    .limit(DRAIN_BATCH)
    .lean();

  let dispatched = 0;
  for (const row of pending) {
    const device = deviceById.get(row.deviceId);
    if (!device || !connectedSockets.has(row.deviceId)) continue;

    const claimed = await SmsGatewayMessage.findOneAndUpdate(
      { _id: row._id, status: 'pending' },
      { status: 'dispatched', dispatchedAt: new Date() },
      { new: true },
    );
    if (!claimed) continue; // another process got there first

    if (!emitToDevice(device, claimed)) {
      // Socket vanished between the claim and the emit — put it back so the next tick
      // (here or on whichever process the phone reconnects to) can retry it.
      await SmsGatewayMessage.updateOne({ _id: claimed._id, status: 'dispatched' }, { status: 'pending' });
      continue;
    }
    dispatched += 1;
  }
  return dispatched;
}

let drainTimer = null;

function startPendingSmsDrainer({ intervalMs = 3000 } = {}) {
  if (drainTimer) return drainTimer;
  drainTimer = setInterval(() => {
    drainPendingForLocalDevices().catch((err) => logger.warn(`SMS drain failed: ${err.message}`));
  }, intervalMs);
  if (typeof drainTimer.unref === 'function') drainTimer.unref();
  return drainTimer;
}

function stopPendingSmsDrainer() {
  if (drainTimer) clearInterval(drainTimer);
  drainTimer = null;
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
  sendBulkPersonalized,
  getGatewayStatus,
  isDeviceLive,
  drainPendingForLocalDevices,
  startPendingSmsDrainer,
  stopPendingSmsDrainer,
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
