const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');
const { TARGET_PERIOD_TYPES, TARGET_MEASURES } = require('../config/manufacturing');

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A production target: "make these quantities of these products in this period". It is a
 * plan only — it never moves stock. Progress is measured live from the documents that do
 * (services/manufacturing/targets.service.js):
 *
 *   measure 'production'  finished goods received (ProductionReceipt) + packs packed
 *                         (posted PackingVoucher lines) inside the period
 *   measure 'stock'       stock on hand now must reach the target by the end date
 *
 * The period is a pair of business calendar days (Asia/Karachi), both inclusive, stored as
 * "YYYY-MM-DD" so a target never shifts a day with the server's timezone.
 */
const TargetLineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, trim: true },
    sku: { type: String, trim: true, default: '' },
    unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
    targetQuantity: { type: Number, required: true, min: 0.000001 },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const ProductionTargetSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    targetNumber: { type: String, required: true, trim: true },
    title: { type: String, trim: true, default: '' },
    periodType: { type: String, enum: TARGET_PERIOD_TYPES, default: 'month' },
    startDay: { type: String, required: true, match: CALENDAR_DAY },
    endDay: { type: String, required: true, match: CALENDAR_DAY },
    measure: { type: String, enum: TARGET_MEASURES, default: 'production' },
    // A running target is flagged "at risk" once what was made falls below this share of
    // what should have been made by now (target × days gone ÷ days in the period).
    alertAtPercent: { type: Number, min: 1, max: 100, default: 90 },
    lines: { type: [TargetLineSchema], default: [] },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

ProductionTargetSchema.plugin(toJSON);
ProductionTargetSchema.plugin(paginate);

ProductionTargetSchema.index({ organizationId: 1, targetNumber: 1 }, { unique: true });
ProductionTargetSchema.index({ organizationId: 1, branchId: 1, endDay: -1 });

const ProductionTarget = mongoose.model('ProductionTarget', ProductionTargetSchema);

module.exports = ProductionTarget;
