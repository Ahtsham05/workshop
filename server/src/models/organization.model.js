const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');
const { BUSINESS_TYPES, normalizeBusinessType } = require('../config/businessTypes');
const { TAX_SYSTEMS } = require('../config/countries');
const { NATIVE_LANGUAGE_SETTINGS } = require('../config/nativeLanguages');
const { isValidTimeZone } = require('../utils/businessTimezone');

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
    // IANA time zone the business runs on ('America/New_York', 'Asia/Karachi', …): where
    // "today" starts and ends for every date filter, report, cash book day and the header clock.
    // null = not chosen → the country's zone when it has only one, else Asia/Karachi
    // (resolveOrganizationTimeZone in middlewares/businessTimeZone.js). DST handled by the zone.
    timeZone: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (value) => value == null || value === '' || isValidTimeZone(value),
        message: 'Unknown time zone',
      },
    },
    // Last change of the EFFECTIVE zone: for 24 h the old zone's "today" is still accepted by
    // the future-date guards, so a colleague's tab that hasn't picked the change up yet can save.
    timeZoneChange: {
      from: { type: String, default: null },
      at: { type: Date, default: null },
    },
    // The second language every `nameUrdu` field holds and native-language prints use:
    // 'auto' follows countryCode (Pakistan → Urdu, UAE → Arabic, …), 'none' turns it off.
    // See config/nativeLanguages.js.
    nativeLanguage: {
      type: String,
      enum: NATIVE_LANGUAGE_SETTINGS,
      default: 'auto',
    },
    // Repair module: which product categories hold repair spare parts — the repair job's
    // "Part from stock" picker lists only these (matched by category name, so it works in
    // every branch). Empty = not set up yet.
    repairSettings: {
      partCategories: { type: [String], default: [] },
    },
    // Customer credit control — see services/creditControl.service.js (DEFAULT_SETTINGS
    // there is what an org that never opened Settings → Credit Control gets).
    creditControl: {
      enabled: { type: Boolean, default: true },
      // block: a sale over the limit is refused unless someone allowed to override approves
      // it with a reason. warn: the cashier is warned and can carry on (logged).
      mode: { type: String, enum: ['block', 'warn'], default: 'block' },
      // Pending (goods handed over, not billed yet) invoices count as money owed.
      includePendingInvoices: { type: Boolean, default: true },
      // > 0: also stop new credit while an invoice is overdue by more than this many days.
      overdueBlockDays: { type: Number, default: 0, min: 0 },
      // Limit given to new customers when the form leaves it empty (0 = no limit).
      defaultCreditLimit: { type: Number, default: 0, min: 0 },
      // Utilisation % at which a customer shows as "near limit".
      nearLimitPercent: { type: Number, default: 80, min: 1, max: 100 },
    },
    // Ledger alerts — invoice due dates + overdue colour bands (Settings → Due Dates &
    // Ledger Colours). Free-form here; services/ledgerAlerts.service.js normalizeSettings
    // validates it and its DEFAULT_SETTINGS is what an org that never saved it gets.
    ledgerAlerts: { type: mongoose.Schema.Types.Mixed, default: undefined },
    // Settings → Menu & Pages: page URL (as in the sidebar, e.g. '/hr/payroll' or
    // '/reports?tab=sales') → shown (true) / hidden (false). Only choices that differ from
    // the business-type defaults are stored — see config/businessTypes.js.
    menuVisibility: { type: mongoose.Schema.Types.Mixed, default: undefined },
    // Settings → Menu & Pages arrangement: custom names, group/page order, pages moved
    // between sub-menus, pages hidden from the sidebar but still working. Shape owned by
    // client/src/lib/menu-layout.ts (validated in validations/organization.validation.js).
    menuLayout: { type: mongoose.Schema.Types.Mixed, default: undefined },
    // Ledger discount rules (Settings → Ledger Discounts): on/off, limits, reasons, print.
    // Free-form here; services/ledgerDiscount.service.js normalizeSettings owns the shape.
    ledgerDiscounts: { type: mongoose.Schema.Types.Mixed, default: undefined },
    // Multi-warehouse (Settings → Warehouses): on/off + options. Free-form here;
    // services/warehouse.service.js normalizeSettings owns the shape.
    warehouseSettings: { type: mongoose.Schema.Types.Mixed, default: undefined },
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
    // Entitlement source of truth for BOTH payment paths (Polar webhooks and manual approval
    // write the same fields). Never read these directly to make an access decision — go
    // through services/entitlement.service.js, which also resolves time-based transitions
    // (period end → grace → read-only) that the scheduler may not have persisted yet.
    subscription: {
      // Plan.key of the current plan (the brief's "planId"). Legacy values single/multi are
      // aliased to starter/growth by the entitlement service until migrated.
      planType: { type: String, trim: true, default: 'trial' },
      // 'pending' and legacy 'active'-while-isTrial are pre-billing-v2 values, normalized by
      // the entitlement service and rewritten by scripts/billing/migrateSubscriptions.js.
      status: {
        type: String,
        enum: ['trialing', 'active', 'pastDue', 'gracePeriod', 'canceled', 'expired', 'pending'],
        default: 'trialing',
      },
      paymentSource: { type: String, enum: ['polar', 'manual', null], default: null },
      currentPeriodStart: { type: Date, default: null },
      currentPeriodEnd: { type: Date, default: null },
      graceEndsAt: { type: Date, default: null },
      statusChangedAt: { type: Date, default: null },
      // Scheduled downgrade: the plan switches to pendingPlanType at pendingPlanEffectiveAt.
      pendingPlanType: { type: String, trim: true, default: null },
      pendingPlanEffectiveAt: { type: Date, default: null },
      cancelAtPeriodEnd: { type: Boolean, default: false },
      polar: {
        customerId: { type: String, default: null },
        subscriptionId: { type: String, default: null },
        productId: { type: String, default: null },
        status: { type: String, default: null },
        // Timestamp of the newest subscription state applied — older (out-of-order) webhook
        // deliveries are ignored rather than overwriting fresher state.
        lastSyncedAt: { type: Date, default: null },
      },
      // Which renewal reminders (days-before) were already sent for which period end.
      reminders: {
        periodEnd: { type: Date, default: null },
        sentDays: { type: [Number], default: [] },
      },
      // ── Legacy mirrors, kept in sync for older clients / shipped desktop builds ──
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
