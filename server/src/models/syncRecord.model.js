const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const SyncRecordSchema = new mongoose.Schema(
  {
    clientId: {
      type: String,
      required: true,
    },
    deviceId: {
      type: String,
      required: true,
    },
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
    entity: {
      type: String,
      required: true,
    },
    operation: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['synced', 'failed'],
      required: true,
    },
    serverId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    errorMessage: { type: String },
    payloadHash: { type: String },
  },
  { timestamps: true },
);

SyncRecordSchema.index({ organizationId: 1, branchId: 1, deviceId: 1, clientId: 1 }, { unique: true });

SyncRecordSchema.plugin(toJSON);

const SyncRecord = mongoose.model('SyncRecord', SyncRecordSchema);

module.exports = SyncRecord;
