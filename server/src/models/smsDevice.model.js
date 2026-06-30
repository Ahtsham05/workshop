const mongoose = require('mongoose');
const { Schema } = mongoose;

const smsDeviceSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization' },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    deviceId: { type: String, required: true, unique: true },
    deviceName: { type: String, default: 'Android Device' },
    token: { type: String, required: true, unique: true },
    socketId: { type: String, default: null },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: null },
    simSlot: { type: Number, default: 0 },
    phoneNumber: { type: String, default: '' },
    appVersion: { type: String, default: '' },
    smsSentToday: { type: Number, default: 0 },
    smsSentTotal: { type: Number, default: 0 },
    lastResetDate: { type: String, default: '' },
  },
  { timestamps: true },
);

smsDeviceSchema.index({ organizationId: 1 });
smsDeviceSchema.index({ token: 1 });

module.exports = mongoose.model('SmsDevice', smsDeviceSchema);
