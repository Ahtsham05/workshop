const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');
const { BUSINESS_TYPES, normalizeBusinessType } = require('../config/businessTypes');
const { TAX_SYSTEMS } = require('../config/countries');

// One section (Invoice/Purchase/Quotation) of the documentNumbering config below.
// `dateSegment` and `resetPeriod` must stay consistent — see documentNumbering.service.js's
// assertNumberingConsistency, which both the update-org validation and this schema-level
// default rely on staying in sync with.
const buildNumberingSectionSchema = (defaults) => new mongoose.Schema({
  prefix: { type: String, trim: true, default: defaults.prefix },
  separator: { type: String, trim: true, default: '-' },
  dateSegment: { type: String, enum: ['none', 'yearly', 'monthly'], default: defaults.dateSegment },
  resetPeriod: { type: String, enum: ['never', 'yearly', 'monthly'], default: defaults.resetPeriod },
  padding: { type: Number, min: 1, max: 10, default: 6 },
  // Floor used only the first time a counter bucket is ever seeded (see
  // documentNumbering.service.js#ensureCounterSeeded) — not a live "current number".
  startingNumber: { type: Number, min: 1, default: 1 },
  // 'organization' (default): one sequence shared by every branch, numbers stay continuous
  // org-wide. 'branch': each branch gets its own independent sequence (e.g. Branch A and
  // Branch B can both legitimately reach INV-001000 at the same time) — see
  // documentNumbering.service.js's bucketKeyFor.
  scope: { type: String, enum: ['organization', 'branch'], default: 'organization' },
}, { _id: false });

const organizationSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameUrdu: {
      type: String,
      trim: true,
      default: '',
    },
    businessType: {
      type: String,
      enum: BUSINESS_TYPES,
      default: 'retail',
      set: normalizeBusinessType,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    // ISO 3166-1 alpha-2 code, added alongside the pre-existing free-text `country` above
    // rather than repurposing it — `country` may hold hand-typed values (e.g. "Pakistan")
    // from before this field existed, and this keeps that display value intact rather than
    // requiring a data migration. New/updated orgs going through the country picker set
    // both fields together (see localization.service.js#getCountryDefaults).
    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    taxNumber: {
      type: String,
      trim: true,
    },
    // Localization / Currency / Tax settings — all optional/defaulted so existing
    // organizations keep working unchanged until they configure these explicitly (e.g. via
    // the new Business Profile / Localization settings pages).
    baseCurrency: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    // Additional currencies this org can bill/pay in beyond baseCurrency.
    enabledCurrencies: {
      type: [String],
      default: [],
    },
    taxSystem: {
      type: String,
      enum: TAX_SYSTEMS,
      default: 'NONE',
    },
    // Whether product/line prices are entered tax-inclusive by default.
    taxInclusivePricingDefault: {
      type: Boolean,
      default: false,
    },
    defaultTaxCategoryId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'TaxCategory',
      default: null,
    },
    // BCP-47-ish locale tag driving Intl.NumberFormat/date formatting on the client.
    locale: {
      type: String,
      trim: true,
      default: 'en-US',
    },
    dateFormat: {
      type: String,
      enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
      default: 'DD/MM/YYYY',
    },
    // Per-organization customizable Invoice/Purchase/Quotation number format — see
    // documentNumbering.service.js for the atomic per-org counter that mints numbers from
    // this config. Subdocument defaults keep every org (existing and new) resolving a fully
    // populated config with zero migration: invoice/quotation reproduce today's actual
    // INV-/QUO-YYYYMM-000001 output exactly; purchase gets a new PUR- prefix (previously
    // hardcoded to the confusing INV- prefix despite being a purchase).
    documentNumbering: {
      type: new mongoose.Schema({
        invoice: {
          type: buildNumberingSectionSchema({ prefix: 'INV', dateSegment: 'monthly', resetPeriod: 'monthly' }),
          default: () => ({}),
        },
        purchase: {
          type: buildNumberingSectionSchema({ prefix: 'PUR', dateSegment: 'none', resetPeriod: 'never' }),
          default: () => ({}),
        },
        quotation: {
          type: buildNumberingSectionSchema({ prefix: 'QUO', dateSegment: 'monthly', resetPeriod: 'monthly' }),
          default: () => ({}),
        },
      }, { _id: false }),
      default: () => ({}),
    },
    website: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    logo: {
      url: { type: String },
      publicId: { type: String },
    },
    owner: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
    },
    subscription: {
      planType: { type: String, enum: ['trial', 'single', 'multi', 'starter', 'growth', 'business', 'enterprise'], default: 'trial' },
      status: { type: String, enum: ['active', 'expired', 'pending'], default: 'pending' },
      startDate: { type: Date },
      endDate: { type: Date },
      isTrial: { type: Boolean, default: true },
      limits: {
        maxBranches: { type: Number, default: 1 },
        maxUsers: { type: Number, default: 2 },
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    keepTimestampsInJSON: true,
  }
);

organizationSchema.plugin(toJSON);
organizationSchema.plugin(paginate);

/**
 * @typedef Organization
 */
const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;
