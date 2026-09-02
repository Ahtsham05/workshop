const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

// Structural-only representation of a tax jurisdiction (country/state/county/city), used
// so a US-style admin can hand-model stacked components (state + county + city rate) on
// TaxRate.taxJurisdictionId. There is deliberately NO address-to-jurisdiction auto-resolution
// or live rate lookup here — an admin picks the jurisdiction explicitly when creating a
// TaxRate; see CLAUDE.md localization spec section 14 ("do not manually hard-code thousands
// of US tax rates... build an internal tax engine abstraction").
const TaxJurisdictionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    level: {
      type: String,
      enum: ['COUNTRY', 'STATE', 'COUNTY', 'CITY', 'DISTRICT', 'CUSTOM'],
      required: true,
    },
    countryCode: { type: String, trim: true, uppercase: true },
    code: { type: String, trim: true }, // e.g. state/county abbreviation
    // Optional rollup for reporting (e.g. a City jurisdiction pointing up to its County).
    parentJurisdictionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxJurisdiction',
      default: null,
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

TaxJurisdictionSchema.plugin(toJSON);
TaxJurisdictionSchema.plugin(paginate);

TaxJurisdictionSchema.index({ organizationId: 1, countryCode: 1, level: 1 });

const TaxJurisdiction = mongoose.model('TaxJurisdiction', TaxJurisdictionSchema);

module.exports = TaxJurisdiction;
