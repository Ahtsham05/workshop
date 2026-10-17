const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const branchSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Organization',
      required: true,
    },
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
    location: {
      address: { type: String, trim: true },
      /** Urdu street / area line for receipts when printing in Urdu */
      addressUrdu: { type: String, trim: true, default: '' },
      city: { type: String, trim: true },
      country: { type: String, trim: true },
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    manager: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /**
     * Colour identity for this branch. The app tints its background, cards and sidebar
     * with it so staff can tell at a glance which branch they are posting to — main vs
     * sub-branch mix-ups are the expensive kind. Empty = no tint (app default colours).
     */
    appearance: {
      colorKey: {
        type: String,
        enum: ['', 'slate', 'blue', 'indigo', 'violet', 'teal', 'emerald', 'amber', 'orange', 'rose'],
        default: '',
      },
    },
    /** Shown at bottom of thermal/HTML receipts & invoices for this branch */
    invoiceNote: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    /** Default paper size / layout used for invoices/receipts/statements printed from this branch */
    printSettings: {
      paperSize: {
        type: String,
        enum: ['thermal80', 'thermal58', 'a4', 'a5', 'a4-half-left', 'a4-half-right'],
        default: 'thermal80',
      },
      /** A4/A5 invoice layout/design template */
      template: {
        type: String,
        enum: ['standard', 'compact', 'modern', 'classic', 'bold', 'ledger', 'banking', 'corporate', 'statement', 'executive', 'challan', 'minimal'],
        default: 'standard',
      },
      /** Print orientation for the A5 paper size (ignored for other sizes) */
      printOrientation: {
        type: String,
        enum: ['portrait', 'landscape'],
        default: 'portrait',
      },
      /** User-chosen A4/A5 sheet colours (#rrggbb). null = keep the template's own colour. */
      colors: {
        pageBg: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
        headerBg: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
        headerText: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
        accent: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
        tableHeaderBg: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
        tableHeaderText: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
        footerBg: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
        footerText: { type: String, default: null, match: /^#[0-9a-fA-F]{6}$/ },
      },
      /**
       * Invoice designer settings (fonts, per-sheet sizes, layout, show/hide, wording) —
       * shape owned by client/src/lib/print-design.ts, which whitelists/clamps every value
       * before it reaches CSS and escapes the wording. Size-capped in branch.service.
       */
      design: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    /**
     * Optional per-branch tax overrides. Currency stays strictly org-level (see
     * Organization.baseCurrency) to avoid fragmenting consolidated GL/reporting, which
     * posts one ledger per organization, not per branch/currency — only jurisdiction and
     * default tax category can be overridden per branch (e.g. a branch operating in a
     * different US state than the org's default).
     */
    taxOverride: {
      taxJurisdictionId: {
        type: mongoose.SchemaTypes.ObjectId,
        ref: 'TaxJurisdiction',
        default: null,
      },
      defaultTaxCategoryId: {
        type: mongoose.SchemaTypes.ObjectId,
        ref: 'TaxCategory',
        default: null,
      },
    },
    /**
     * Fee-collection bank accounts shown to parents/students in the portal when
     * paying fees online. Each account is what a parent transfers fees to and
     * then uploads the payment proof against.
     */
    bankAccounts: [
      new mongoose.Schema(
        {
          bankName: { type: String, trim: true },
          accountTitle: { type: String, trim: true },
          accountNumber: { type: String, trim: true },
          iban: { type: String, trim: true },
          instructions: { type: String, trim: true },
          isActive: { type: Boolean, default: true },
        },
        { _id: true }
      ),
    ],
  },
  {
    timestamps: true,
  }
);

branchSchema.plugin(toJSON);
branchSchema.plugin(paginate);

/**
 * @typedef Branch
 */
const Branch = mongoose.model('Branch', branchSchema);

module.exports = Branch;
