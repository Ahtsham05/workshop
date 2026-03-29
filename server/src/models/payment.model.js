const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const paymentSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Organization',
      required: true,
    },
    userId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
    },
    planType: {
      type: String,
      enum: ['single', 'multi'],
      required: true,
    },
    months: {
      type: Number,
      required: true,
      min: 1,
    },
    amount: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['bank_transfer'],
      default: 'bank_transfer',
    },
    transactionId: {
      type: String,
      trim: true,
    },
    screenshotUrl: {
      type: String,
    },
    screenshotPublicId: {
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

paymentSchema.plugin(toJSON);
paymentSchema.plugin(paginate);

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
