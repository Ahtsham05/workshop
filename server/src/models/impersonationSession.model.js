const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * Platform-support "Login as user" session. Every support login is recorded here — who
 * opened it, for whom, why, from where, and when it ended. The short-lived access token
 * handed out carries this session's id, and every request re-checks that the session is
 * still open, so ending it (or letting it expire) cuts the token off immediately.
 */
const impersonationSessionSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    adminName: { type: String, default: '' },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetName: { type: String, default: '' },
    targetEmail: { type: String, default: '' },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    organizationName: { type: String, default: '' },
    reason: { type: String, trim: true, maxlength: 300, default: '' },
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    endedBy: { type: String, enum: ['admin', 'expired', 'admin_panel', null], default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    // Changes made inside the session (non-GET requests) — a quick "did support touch anything?"
    writeCount: { type: Number, default: 0 },
    lastActivityAt: { type: Date, default: null },
  },
  { timestamps: true }
);

impersonationSessionSchema.plugin(toJSON);

module.exports = mongoose.model('ImpersonationSession', impersonationSessionSchema);
