const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const SyncConflictSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    clientId: {
      type: String,
      required: true,
    },
    entityType: {
      type: String,
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    operation: {
      type: String,
      required: true,
    },
    localData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    serverData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    localVersion: {
      type: Number,
      required: true,
    },
    serverVersion: {
      type: Number,
      required: true,
    },
    defaultStrategy: {
      type: String,
      enum: ['server_wins', 'local_wins', 'manual_review'],
      default: 'manual_review',
    },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open',
    },
    resolution: {
      type: String,
      enum: ['server_wins', 'local_wins', 'manual_review'],
    },
    resolvedAt: {
      type: Date,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

SyncConflictSchema.index(
  { organizationId: 1, branchId: 1, deviceId: 1, clientId: 1 },
  { unique: true },
);
SyncConflictSchema.index({ organizationId: 1, branchId: 1, status: 1 });

SyncConflictSchema.plugin(toJSON);

const SyncConflict = mongoose.model('SyncConflict', SyncConflictSchema);

module.exports = SyncConflict;
