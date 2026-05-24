const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const denominationCountSchema = new mongoose.Schema(
  {
    value: { type: Number, required: true, min: 0.01 },
    kind: { type: String, enum: ['note', 'coin'], required: true },
    quantity: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const cashRegisterStateSchema = new mongoose.Schema(
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
    counts: {
      type: [denominationCountSchema],
      default: [],
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
    lastCountedAt: {
      type: Date,
    },
    lastCountedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true, keepTimestampsInJSON: true },
);

cashRegisterStateSchema.plugin(toJSON);

cashRegisterStateSchema.index({ organizationId: 1, branchId: 1 }, { unique: true });

const CashRegisterState = mongoose.model('CashRegisterState', cashRegisterStateSchema);

module.exports = CashRegisterState;
