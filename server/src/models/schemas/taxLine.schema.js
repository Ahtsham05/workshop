const mongoose = require('mongoose');

// Shared tax-snapshot sub-schema embedded on both Invoice and Purchase (header-level
// `taxLines[]`). Written once by taxCalculator.service.js at save time and never
// recalculated afterwards — see CLAUDE.md localization spec section 20 ("never
// recalculate old invoices using current tax rates"). A factory (not a shared schema
// instance) because Mongoose sub-documents must not be reused across parent schemas.
const buildTaxLineSchema = () =>
  new mongoose.Schema(
    {
      taxCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxCategory' },
      taxCategoryName: { type: String },
      taxableAmount: { type: Number, default: 0, min: 0 },
      taxAmount: { type: Number, default: 0, min: 0 },
      components: [
        {
          taxRateId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxRate' },
          name: { type: String },
          ratePercent: { type: Number },
          isCompound: { type: Boolean, default: false },
          amount: { type: Number, default: 0 },
        },
      ],
    },
    { _id: false }
  );

module.exports = { buildTaxLineSchema };
