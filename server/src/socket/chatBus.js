const crypto = require('crypto');
const os = require('os');
const mongoose = require('mongoose');
const logger = require('../config/logger');
const ChatEvent = require('../models/chatEvent.model');

/**
 * Delivers live chat events to sockets held by ANY server process sharing this database.
 *
 * `publish()` emits to this process's sockets straight away and records the event in
 * ChatEvent; `startRelay()` tails that collection (a change stream on Atlas / any replica
 * set, a cheap _id-cursor poll on a standalone mongod) and replays other processes'
 * events to this process's sockets. A process with no socket server at all (a serverless
 * REST invocation) still publishes, so the process that does hold the sockets delivers.
 */

const ORIGIN = `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;
const POLL_MS = 1500;

let io = null;
let relayStarted = false;

const toPlain = (value) => JSON.parse(JSON.stringify(value ?? {}));

function emitLocal(rooms, event, payload, exceptSocketId) {
  if (!io || !rooms.length) return;
  let target = io.to(rooms);
  if (exceptSocketId) target = target.except(exceptSocketId);
  target.emit(event, payload);
}

/**
 * @param {string[]} rooms  e.g. ['user:<id>', 'branch:<id>', 'org:<id>']
 * @param {string} event    socket event name
 * @param {object} payload
 * @param {{ exceptSocketId?: string, localOnly?: boolean }} [options]
 */
function publish(rooms, event, payload, options = {}) {
  const uniqueRooms = [...new Set((rooms || []).filter(Boolean))];
  if (!uniqueRooms.length) return;
  const plain = toPlain(payload);
  emitLocal(uniqueRooms, event, plain, options.exceptSocketId);
  if (options.localOnly) return;
  if (mongoose.connection.readyState !== 1) return;
  ChatEvent.create({ origin: ORIGIN, event, rooms: uniqueRooms, payload: plain }).catch((err) => {
    logger.warn(`[chat] relay write failed: ${err.message}`);
  });
}

function replay(doc) {
  if (!doc || doc.origin === ORIGIN) return;
  emitLocal(doc.rooms || [], doc.event, doc.payload || {});
  relayListeners.forEach((listener) => {
    try {
      listener(doc);
    } catch (err) {
      logger.warn(`[chat] relay listener failed: ${err.message}`);
    }
  });
}

/** Lets the socket layer observe other processes' events (presence bookkeeping). */
const relayListeners = new Set();
const onRelay = (listener) => {
  relayListeners.add(listener);
  return () => relayListeners.delete(listener);
};

function startPolling() {
  let lastId = new mongoose.Types.ObjectId();
  const tick = async () => {
    if (mongoose.connection.readyState !== 1) return;
    try {
      const docs = await ChatEvent.find({ _id: { $gt: lastId }, origin: { $ne: ORIGIN } })
        .sort({ _id: 1 })
        .limit(500)
        .lean();
      docs.forEach((doc) => {
        lastId = doc._id;
        replay(doc);
      });
    } catch (err) {
      logger.warn(`[chat] relay poll failed: ${err.message}`);
    }
  };
  const timer = setInterval(tick, POLL_MS);
  if (timer.unref) timer.unref();
  logger.info('[chat] relay: polling');
}

function startRelay(ioInstance) {
  io = ioInstance;
  if (relayStarted) return;
  relayStarted = true;
  try {
    const stream = ChatEvent.watch([{ $match: { operationType: 'insert', 'fullDocument.origin': { $ne: ORIGIN } } }]);
    let switched = false;
    const fallback = (err) => {
      if (switched) return;
      switched = true;
      logger.info(`[chat] change stream unavailable (${err && err.message}), using polling`);
      // Mongoose's ChangeStream.close() returns undefined on some versions — never assume a promise
      // (a throw here would crash the process on a standalone mongod, e.g. the desktop database).
      try {
        const closing = stream.close();
        if (closing && typeof closing.catch === 'function') closing.catch(() => {});
      } catch {
        /* already closed */
      }
      startPolling();
    };
    stream.on('change', (change) => replay(change.fullDocument));
    stream.on('error', fallback);
    stream.on('close', () => fallback(new Error('change stream closed')));
    logger.info('[chat] relay: change stream');
  } catch (err) {
    logger.info(`[chat] change stream failed to open (${err.message}), using polling`);
    startPolling();
  }
}

module.exports = { publish, startRelay, onRelay, ORIGIN };
