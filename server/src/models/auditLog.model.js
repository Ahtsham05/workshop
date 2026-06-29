const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/** One changed field, e.g. { field: 'price', oldValue: 100, newValue: 120 }. */
const changeSchema = mongoose.Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

/**
 * Immutable trail of who did what to which record. Written by auditLog.service's
 * recordAuditLog — never updated or deleted by the app itself.
 */
const auditLogSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    // Denormalized so the log stays readable even if the user is later deleted/renamed.
    userName: { type: String, trim: true },
    userEmail: { type: String, trim: true },
    action: {
      type: String,
      required: true,
      enum: ['create', 'update', 'delete', 'stock_adjust', 'permission_change', 'status_change'],
      index: true,
    },
    // The business entity this event happened to, e.g. "Product", "Invoice".
    module: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    // Denormalized label (product name, invoice number, etc.) for display without a join.
    entityName: { type: String, trim: true },
    changes: { type: [changeSchema], default: [] },
    // Free-form extra context (e.g. invoice total, reason for stock adjustment).
    metadata: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String, trim: true },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

auditLogSchema.plugin(toJSON);
auditLogSchema.plugin(paginate);

auditLogSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, module: 1, entityId: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
