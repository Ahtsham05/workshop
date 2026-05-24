const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const denominationCountSchema = new mongoose.Schema(
  {
    value: { type: Number, required: true, min: 0.01 },
    kind: { type: String, enum: ['note', 'coin'], required: true },
    quantity: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const cashRegisterSnapshotSchema = new mongoose.Schema(
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
    expectedCashAmount: {
      type: Number,
      default: 0,
    },
    variance: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true, keepTimestampsInJSON: true },
);

cashRegisterSnapshotSchema.plugin(toJSON);
cashRegisterSnapshotSchema.plugin(paginate);

const CashRegisterSnapshot = mongoose.model('CashRegisterSnapshot', cashRegisterSnapshotSchema);

module.exports = CashRegisterSnapshot;
