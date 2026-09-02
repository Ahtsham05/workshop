const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

// A tax classification (Standard, Reduced, Zero Rated, Exempt, Out of Scope, Reverse
// Charge, ...) that Products/ProductVariants point to via taxCategoryId. TaxRate records
// attach to a category (see taxRate.model.js) rather than embedding a rate directly here,
// so the same category's effective rate can change over time without touching every
// product that references it. Org-scoped only (not branch-scoped) — tax policy is a
// business-wide setting, matching where taxSystem/baseCurrency live on Organization.
const TaxCategorySchema = new mongoose.Schema(
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
    code: { type: String, trim: true, uppercase: true },
    description: { type: String, trim: true },
    // The one category new products/invoice lines fall back to when nothing more specific
    // is set — service layer enforces only one isDefault: true per organization.
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

TaxCategorySchema.plugin(toJSON);
TaxCategorySchema.plugin(paginate);

TaxCategorySchema.index({ organizationId: 1, status: 1 });
TaxCategorySchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);

const TaxCategory = mongoose.model('TaxCategory', TaxCategorySchema);

module.exports = TaxCategory;
