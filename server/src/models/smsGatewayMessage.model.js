const mongoose = require('mongoose');
const { Schema } = mongoose;

const smsGatewayMessageSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization' },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    deviceId: { type: String, default: null },
    to: { type: String, required: true },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'dispatched', 'sent', 'delivered', 'failed'],
      default: 'pending',
    },
    error: { type: String, default: null },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    source: { type: String, default: 'manual' }, // manual | invoice | fee_alert | bulk
    refId: { type: String, default: null },
  },
  { timestamps: true },
);

smsGatewayMessageSchema.index({ organizationId: 1, createdAt: -1 });
smsGatewayMessageSchema.index({ status: 1 });
smsGatewayMessageSchema.index({ deviceId: 1 });

module.exports = mongoose.model('SmsGatewayMessage', smsGatewayMessageSchema);
