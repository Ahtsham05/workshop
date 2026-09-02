const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

// A dated tax rate attached to a TaxCategory (and optionally a TaxJurisdiction for
// US-style stacked state/county/city components). TaxCalculatorService resolves the
// applicable set of TaxRate rows for a category as of a given date — effectiveFrom/
// effectiveTo let a rate change (e.g. VAT going from 17% to 18%) without ever mutating
// or deleting the old row, so historical invoices that already snapshotted a rate are
// never affected by a later change (see CLAUDE.md spec sections 11 and 20).
const TaxRateSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    taxCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxCategory',
      required: true,
      index: true,
    },
    // null = applies org/country-wide; set = only applies when the transaction's resolved
    // jurisdiction set includes this one (US state/county/city stacking).
    taxJurisdictionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxJurisdiction',
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    rateType: { type: String, enum: ['PERCENTAGE', 'FIXED'], default: 'PERCENTAGE' },
    rate: { type: Number, required: true, min: 0 },
    // When true, this rate is computed on top of the amount *after* lower-priority,
    // non-compound rates have already been applied (rare; mainly a US jurisdiction need).
    isCompound: { type: Boolean, default: false },
    priority: { type: Number, default: 0 },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    effectiveTo: { type: Date, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

TaxRateSchema.plugin(toJSON);
TaxRateSchema.plugin(paginate);

TaxRateSchema.index({ organizationId: 1, taxCategoryId: 1, effectiveFrom: -1 });
TaxRateSchema.index({ organizationId: 1, taxJurisdictionId: 1 });

const TaxRate = mongoose.model('TaxRate', TaxRateSchema);

module.exports = TaxRate;
