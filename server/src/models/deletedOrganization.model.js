const mongoose = require('mongoose');

/**
 * Platform-level audit row written every time an organization is permanently deleted
 * (single delete from the admin console, bulk "expired trials" clean-up, or the CLI script).
 *
 * The field is deliberately `orgId`, NOT `organizationId`: the purge engine deletes every
 * collection that carries an `organizationId` path, and this log must survive the purge.
 */
const deletedOrganizationSchema = mongoose.Schema(
  {
    orgId: { type: mongoose.SchemaTypes.ObjectId, required: true, index: true },
    name: { type: String, default: '' },
    businessType: { type: String, default: '' },
    ownerEmail: { type: String, default: '' },
    ownerName: { type: String, default: '' },
    phone: { type: String, default: '' },
    orgCreatedAt: { type: Date, default: null },
    subscription: {
      planKey: { type: String, default: '' },
      status: { type: String, default: '' },
      bucket: { type: String, default: '' },
      periodEnd: { type: Date, default: null },
    },
    reason: { type: String, enum: ['trial_expired_cleanup', 'manual', 'script'], default: 'manual' },
    deletedBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', default: null },
    deletedByEmail: { type: String, default: '' },
    // collection name -> number of documents removed
    counts: { type: Map, of: Number, default: {} },
    totalDocuments: { type: Number, default: 0 },
    usersDeleted: { type: Number, default: 0 },
    usersDetached: { type: Number, default: 0 },
    backupFile: { type: String, default: '' },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'deletedAt', updatedAt: false } }
);

deletedOrganizationSchema.index({ deletedAt: -1 });

const DeletedOrganization = mongoose.model('DeletedOrganization', deletedOrganizationSchema);

module.exports = DeletedOrganization;
