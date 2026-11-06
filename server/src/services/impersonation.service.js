/**
 * "Login as user" for platform support (system_admin only).
 *
 * Instead of ever knowing a customer's password, the admin gets a short-lived ACCESS token
 * for that user (no refresh token, so it cannot be extended), stamped with the session id.
 * `checkSession` runs on every authenticated request; ending or expiring the session
 * revokes the token at once. Password / email changes are refused inside a session.
 */
const httpStatus = require('http-status');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../config/config');
const { tokenTypes } = require('../config/tokens');
const { User, Organization, ImpersonationSession } = require('../models');
const ApiError = require('../utils/ApiError');

const DEFAULT_MINUTES = 60;
const MAX_MINUTES = 240;

const startSession = async ({ admin, targetUserId, minutes, reason, ip, userAgent }) => {
  if (!mongoose.isValidObjectId(targetUserId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid user id');
  if (String(admin._id || admin.id) === String(targetUserId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You are already signed in as yourself');
  }
  const target = await User.findById(targetUserId).populate('role');
  if (!target) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  if (target.systemRole === 'system_admin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Platform admin accounts cannot be opened this way');
  }
  if (target.isActive === false) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This user is deactivated — activate the account first');
  }
  const org = target.organizationId ? await Organization.findById(target.organizationId).select('name').lean() : null;

  const mins = Math.min(Math.max(parseInt(minutes, 10) || DEFAULT_MINUTES, 5), MAX_MINUTES);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + mins * 60 * 1000);
  const session = await ImpersonationSession.create({
    adminId: admin._id || admin.id,
    adminName: admin.name || '',
    targetUserId: target._id,
    targetName: target.name || '',
    targetEmail: target.email || '',
    organizationId: target.organizationId || null,
    organizationName: org?.name || '',
    reason: (reason || '').trim(),
    startedAt: now,
    expiresAt,
    ip: ip || '',
    userAgent: String(userAgent || '').slice(0, 300),
  });

  const token = jwt.sign(
    {
      sub: String(target._id),
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      type: tokenTypes.ACCESS,
      imp: { sid: String(session._id), by: String(admin._id || admin.id) },
    },
    config.jwt.secret
  );

  return {
    user: target,
    tokens: { access: { token, expires: expiresAt } },
    session: {
      id: String(session._id),
      expiresAt,
      targetName: session.targetName,
      organizationName: session.organizationName,
      adminName: session.adminName,
    },
  };
};

/**
 * Validate the `imp` claim of an access token. Returns the session (lean) when it is still
 * open for this user, otherwise null. Lazily stamps sessions that ran out as expired.
 */
const checkSession = async (imp, userId) => {
  if (!imp || !imp.sid || !mongoose.isValidObjectId(imp.sid)) return null;
  const session = await ImpersonationSession.findById(imp.sid).lean();
  if (!session || String(session.targetUserId) !== String(userId) || session.endedAt) return null;
  if (session.expiresAt <= new Date()) {
    await ImpersonationSession.updateOne(
      { _id: session._id, endedAt: null },
      { $set: { endedAt: session.expiresAt, endedBy: 'expired' } }
    );
    return null;
  }
  return session;
};

const endSession = async (sessionId, endedBy = 'admin') => {
  if (!mongoose.isValidObjectId(sessionId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session id');
  const session = await ImpersonationSession.findOneAndUpdate(
    { _id: sessionId, endedAt: null },
    { $set: { endedAt: new Date(), endedBy } },
    { new: true }
  );
  return { ended: !!session };
};

/** Fire-and-forget: count changes made inside the session. */
const noteActivity = (sessionId, isWrite) => {
  const update = { $set: { lastActivityAt: new Date() } };
  if (isWrite) update.$inc = { writeCount: 1 };
  ImpersonationSession.updateOne({ _id: sessionId }, update).catch(() => {});
};

const listSessions = async ({ organizationId, targetUserId, limit = 50 } = {}) => {
  const filter = {};
  if (organizationId && mongoose.isValidObjectId(organizationId)) filter.organizationId = organizationId;
  if (targetUserId && mongoose.isValidObjectId(targetUserId)) filter.targetUserId = targetUserId;
  const now = new Date();
  const rows = await ImpersonationSession.find(filter)
    .sort({ startedAt: -1 })
    .limit(Math.min(parseInt(limit, 10) || 50, 200))
    .lean();
  return rows.map((s) => ({
    id: String(s._id),
    adminName: s.adminName,
    targetUserId: String(s.targetUserId),
    targetName: s.targetName,
    targetEmail: s.targetEmail,
    organizationId: s.organizationId ? String(s.organizationId) : null,
    organizationName: s.organizationName,
    reason: s.reason,
    startedAt: s.startedAt,
    expiresAt: s.expiresAt,
    endedAt: s.endedAt || (s.expiresAt <= now ? s.expiresAt : null),
    endedBy: s.endedBy || (s.expiresAt <= now ? 'expired' : null),
    active: !s.endedAt && s.expiresAt > now,
    writeCount: s.writeCount || 0,
    ip: s.ip,
  }));
};

// ── What support may not do while inside someone's account ──────────────────────────
const BLOCKED_PATH = /\/(me\/password|change-password|reset-password|forgot-password|send-verification-email)(\/|\?|$)/;

/** Returns a reason string when the request must be refused during a support session. */
const blockedReason = (req) => {
  const url = req.originalUrl || req.url || '';
  if (BLOCKED_PATH.test(url)) return 'Passwords cannot be changed during a support session.';
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (req.method !== 'GET' && Object.prototype.hasOwnProperty.call(body, 'password')) {
    return 'Passwords cannot be set during a support session.';
  }
  if (/\/v1\/chat(\/|\?|$)/.test(url) && req.method !== 'GET') {
    return "Team chat messages cannot be sent in the customer's name during a support session.";
  }
  if (/\/users\/me(\/|\?|$)/.test(url) && req.method !== 'GET' && Object.prototype.hasOwnProperty.call(body, 'email')) {
    return 'The login email cannot be changed during a support session.';
  }
  return null;
};

module.exports = { startSession, checkSession, endSession, noteActivity, listSessions, blockedReason, MAX_MINUTES };
