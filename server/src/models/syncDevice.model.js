const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const SyncDeviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      index: true,
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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    deviceName: { type: String, default: 'Desktop POS' },
    platform: { type: String },
    lastSeenAt: { type: Date, default: Date.now },
    lastPullAt: { type: Date },
    lastPushAt: { type: Date },
  },
  { timestamps: true },
);

SyncDeviceSchema.index({ organizationId: 1, branchId: 1, deviceId: 1 }, { unique: true });

SyncDeviceSchema.plugin(toJSON);

const SyncDevice = mongoose.model('SyncDevice', SyncDeviceSchema);

module.exports = SyncDevice;
