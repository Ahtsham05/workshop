const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Stores recurring demand-multiplier windows (Ramadan, Eid, Back to School, Winter, Summer, ...)
 * scoped to either specific products or whole categories. Dates are stored as
 * month/day (no year) since these seasons recur every year on roughly the same
 * calendar window — lunar seasons (Ramadan/Eid) need their date range updated yearly.
 */
const SeasonalFactorSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true }, // e.g. "Ramadan", "Eid", "Back to School"
    description: { type: String, trim: true },

    // Scope: applies to specific products OR whole categories. Empty arrays = applies to all products.
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    categoryNames: [{ type: String, trim: true }],

    /** Demand multiplier applied to dailyDemand while the window is active. 1.4 = "sells 40% more". */
    multiplier: { type: Number, required: true, min: 0 },

    // Calendar window (month is 1-12, day is 1-31), no year — recurs annually.
    startMonth: { type: Number, required: true, min: 1, max: 12 },
    startDay: { type: Number, required: true, min: 1, max: 31 },
    endMonth: { type: Number, required: true, min: 1, max: 12 },
    endDay: { type: Number, required: true, min: 1, max: 31 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

SeasonalFactorSchema.index({ organizationId: 1, isActive: 1 });

SeasonalFactorSchema.plugin(toJSON);
SeasonalFactorSchema.plugin(paginate);

/**
 * Whether `date` falls inside this factor's recurring month/day window.
 * Handles windows that wrap across the year boundary (e.g. Dec 15 -> Jan 5).
 */
SeasonalFactorSchema.methods.isActiveOn = function isActiveOn(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const asNumber = (m, d) => m * 100 + d;
  const current = asNumber(month, day);
  const start = asNumber(this.startMonth, this.startDay);
  const end = asNumber(this.endMonth, this.endDay);

  if (start <= end) {
    return current >= start && current <= end;
  }
  // window wraps the year boundary
  return current >= start || current <= end;
};

const SeasonalFactor = mongoose.model('SeasonalFactor', SeasonalFactorSchema);

module.exports = SeasonalFactor;
