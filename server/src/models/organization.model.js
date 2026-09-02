const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');
const { BUSINESS_TYPES, normalizeBusinessType } = require('../config/businessTypes');
const { TAX_SYSTEMS } = require('../config/countries');

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
