const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

// "When a price list says THIS, it means THAT product" — learned from a match the user
// confirmed or corrected in the review step, so the same supplier's next list (which uses the
// same odd names every time) matches instantly with no review. Scoped to a supplier when one
// was chosen; supplierId null means "any list". Looked up before fuzzy matching, supplier-
// specific first — see priceUpdate.service.js#analyze.
const PriceListAliasSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    // priceMatcher.aliasKey(name): spelling/spec-notation-insensitive, so "A15 4GB/128GB" and
    // "a15 4+128" are the same alias.
    aliasKey: { type: String, required: true },
    aliasText: { type: String, required: true, trim: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    // Snapshot for the "Saved matches" list; the live name is read from the product.
    productName: { type: String, trim: true },
    hits: { type: Number, default: 1 },
    lastUsedAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

PriceListAliasSchema.plugin(toJSON);

PriceListAliasSchema.index({ organizationId: 1, branchId: 1, supplierId: 1, aliasKey: 1 }, { unique: true });

const PriceListAlias = mongoose.model('PriceListAlias', PriceListAliasSchema);

module.exports = PriceListAlias;
