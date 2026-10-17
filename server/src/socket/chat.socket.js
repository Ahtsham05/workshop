const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const logger = require('../config/logger');
const { tokenTypes } = require('../config/tokens');
const { User } = require('../models');
const ChatConversation = require('../models/chatConversation.model');
const chatService = require('../services/chat.service');
const chatBus = require('./chatBus');

/**
 * Live layer for team chat. Sockets RECEIVE pushes (new message, edit, delivery/read
 * receipt, typing, presence) and send only ephemeral signals (typing, "delivered" acks);
 * everything else goes through the REST API. Every signal is access-checked in the service.
 * A socket joins:
 *   user:<id>             direct + group threads, own read sync
 *   org:<orgId>           the "All branches" channel
 *   branch:<branchId>     each branch channel the person works in
 *   orgadmins:<orgId>     super admins (see every branch channel)
 */

/* ── Presence ────────────────────────────────────────────────────────────── */
// userId → Map<origin, lastConfirmedAt>. A person is online while any process vouches
// for them; each process re-announces its own people every SYNC_MS, and a vouch that is
// not refreshed within STALE_MS (that process died) lapses on its own.
const SYNC_MS = 60 * 1000;
const STALE_MS = 150 * 1000;
const presence = new Map();
const localSockets = new Map(); // userId → number of sockets on this process
const userOrg = new Map(); // userId → orgId, for announcing

function vouch(userId, origin, online) {
  const entry = presence.get(userId) || new Map();
  if (online) entry.set(origin, Date.now());
  else entry.delete(origin);
  if (entry.size) presence.set(userId, entry);
  else presence.delete(userId);
}

function isOnline(userId) {
  const entry = presence.get(String(userId));
  if (!entry) return false;
  const now = Date.now();
  for (const [origin, at] of entry) {
    if (origin === chatBus.ORIGIN || now - at < STALE_MS) return true;
  }
  return false;
}

function onlineIds() {
  const ids = new Set();
  presence.forEach((_entry, userId) => {
    if (isOnline(userId)) ids.add(userId);
  });
  return ids;
}

function announce(userId, online, lastSeenAt = null) {
  const orgId = userOrg.get(userId);
  if (!orgId) return;
  chatBus.publish([`org:${orgId}`], 'chat:presence', { userId, online, lastSeenAt, origin: chatBus.ORIGIN });
}

/**
 * "Last seen": stamped on connect, refreshed every SYNC_MS while connected (so a crashed
 * process still leaves a time at most a minute old) and finally on disconnect.
 */
function stampLastSeen(userIds, at = new Date()) {
  if (!userIds.length) return;
  User.updateMany({ _id: { $in: userIds } }, { $set: { lastSeenAt: at } }).catch((err) =>
    logger.warn(`[chat] last seen update failed: ${err.message}`)
  );
}

/* ── Typing permission cache ─────────────────────────────────────────────── */
const accessCache = new Map(); // `${socketId}:${conversationId}` → { rooms, at }
const ACCESS_TTL = 60 * 1000;

async function roomsIfAllowed(socket, conversationId) {
  const key = `${socket.id}:${conversationId}`;
  const cached = accessCache.get(key);
  if (cached && Date.now() - cached.at < ACCESS_TTL) return cached.rooms;
  let rooms = null;
  try {
    const conversation = await ChatConversation.findById(conversationId).lean();
    if (conversation && (await chatService.canAccess(socket.data.user, conversation, socket.data.branchIds))) {
      rooms = chatService.audienceRooms(conversation);
    }
  } catch {
    rooms = null;
  }
  accessCache.set(key, { rooms, at: Date.now() });
  return rooms;
}

async function authenticate(token) {
  const payload = jwt.verify(token, config.jwt.secret);
  if (payload.type !== tokenTypes.ACCESS) throw new Error('Invalid token type');
  const user = await User.findById(payload.sub);
  if (!user || user.isActive === false) throw new Error('Not a staff account');
  await chatService.assertChatUser(user);
  return user;
}

function initChatSocket(httpServer, corsOptions) {
  const io = new Server(httpServer, {
    path: '/socket/chat',
    cors: corsOptions,
    transports: ['websocket', 'polling'],
    // Another socket.io server (the SMS gateway) shares this HTTP server on its own path.
    destroyUpgrade: false,
  });

  chatBus.startRelay(io);

  // Other processes' presence announcements.
  chatBus.onRelay((doc) => {
    if (doc.event === 'chat:presence' && doc.payload?.userId) vouch(String(doc.payload.userId), doc.origin, !!doc.payload.online);
    if (doc.event === 'chat:presence-sync' && Array.isArray(doc.payload?.userIds)) {
      doc.payload.userIds.forEach((id) => vouch(String(id), doc.origin, true));
    }
  });

  const syncTimer = setInterval(() => {
    stampLastSeen([...localSockets.entries()].filter(([, count]) => count > 0).map(([userId]) => userId));
    // Re-announce who is connected here, grouped per organization.
    const byOrg = new Map();
    localSockets.forEach((count, userId) => {
      if (count <= 0) return;
      const orgId = userOrg.get(userId);
      if (!orgId) return;
      byOrg.set(orgId, [...(byOrg.get(orgId) || []), userId]);
    });
    byOrg.forEach((userIds, orgId) => {
      // Only other processes need this (localOnly would make it a no-op), and clients ignore it.
      chatBus.publish([`orgsync:${orgId}`], 'chat:presence-sync', { userIds });
    });
  }, SYNC_MS);
  if (syncTimer.unref) syncTimer.unref();

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));
      const user = await authenticate(token);
      socket.data.user = user;
      socket.data.branchIds = await chatService.getUserBranchIds(user);
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { user, branchIds } = socket.data;
    const userId = String(user._id);
    const orgId = String(user.organizationId);

    socket.join(`user:${userId}`);
    socket.join(`org:${orgId}`);
    branchIds.forEach((branchId) => socket.join(`branch:${branchId}`));
    if (chatService.isAdmin(user)) socket.join(`orgadmins:${orgId}`);

    userOrg.set(userId, orgId);
    const count = (localSockets.get(userId) || 0) + 1;
    localSockets.set(userId, count);
    vouch(userId, chatBus.ORIGIN, true);
    if (count === 1) {
      announce(userId, true);
      stampLastSeen([userId]);
    }

    socket.emit('chat:ready', { userId, online: [...onlineIds()] });

    socket.on('chat:typing', async (payload) => {
      const conversationId = payload && String(payload.conversationId || '');
      if (!/^[0-9a-fA-F]{24}$/.test(conversationId)) return;
      const rooms = await roomsIfAllowed(socket, conversationId);
      if (!rooms) return;
      chatBus.publish(
        rooms,
        'chat:typing',
        { conversationId, userId, name: user.name || user.email, stopped: !!payload.stopped },
        { exceptSocketId: socket.id }
      );
    });

    // Delivery ack: this device just received a pushed message (the grey double tick).
    socket.on('chat:delivered', async (payload) => {
      const conversationId = payload && String(payload.conversationId || '');
      if (!/^[0-9a-fA-F]{24}$/.test(conversationId)) return;
      try {
        await chatService.markDelivered(user, conversationId, payload.at);
      } catch {
        /* no access any more, or a transient DB error — the next list load re-marks it */
      }
    });

    socket.on('disconnect', () => {
      for (const key of accessCache.keys()) if (key.startsWith(`${socket.id}:`)) accessCache.delete(key);
      const left = (localSockets.get(userId) || 1) - 1;
      if (left > 0) {
        localSockets.set(userId, left);
        return;
      }
      localSockets.delete(userId);
      vouch(userId, chatBus.ORIGIN, false);
      const seenAt = new Date();
      stampLastSeen([userId], seenAt);
      if (!isOnline(userId)) announce(userId, false, seenAt);
    });
  });

  logger.info('Chat Socket.io initialized');
  return io;
}

module.exports = { initChatSocket, onlineIds, isOnline };
