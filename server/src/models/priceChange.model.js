const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

// One price/cost change to one product (or variant): the before/after line of a
// PriceUpdateBatch, and — because it's stamped with the product — the product's price
// history timeline. `oldCost`/`oldPrice` are always the values READ FROM THE DATABASE at apply
// time, never what the screen showed, so Undo restores exactly what was really there.
const PriceChangeSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceUpdateBatch', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    // Set when the change targets a real variant (Product.hasVariants); null for a simple product.
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    // Snapshots so history survives renames/deletes.
    productName: { type: String, trim: true },
    variantLabel: { type: String, trim: true },
    barcode: { type: String, trim: true },
    sku: { type: String, trim: true },

    oldCost: { type: Number, default: null },
    newCost: { type: Number, default: null },
    oldPrice: { type: Number, default: null },
    newPrice: { type: Number, default: null },
    costChanged: { type: Boolean, default: false },
    priceChanged: { type: Boolean, default: false },

    // The line of the supplier's list this came from, and how it was matched to the product.
    sourceLine: { type: String, trim: true, maxlength: 500 },
    matchMethod: { type: String, enum: ['code', 'exact', 'name', 'alias', 'manual'], default: 'name' },
    matchScore: { type: Number },

    // pending  – written before the product update, so a crash can't lose the audit line
    // applied  – product now holds newCost/newPrice
    // unchanged/stale/failed – nothing was written (kept so the result screen can explain it)
    // reverted – undone by a rollback; revert_conflict – rollback skipped it (changed since)
    status: {
      type: String,
      enum: ['pending', 'applied', 'unchanged', 'stale', 'failed', 'reverted', 'revert_conflict'],
      default: 'pending',
    },
    message: { type: String, trim: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    revertedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    revertedAt: { type: Date },
  },
  { timestamps: true }
);

PriceChangeSchema.plugin(toJSON);

PriceChangeSchema.index({ batchId: 1, status: 1 });
// Product history timeline (newest first) — variantId is part of the key because a variant
// product's variants each have their own price history.
PriceChangeSchema.index({ organizationId: 1, branchId: 1, productId: 1, variantId: 1, changedAt: -1 });

const PriceChange = mongoose.model('PriceChange', PriceChangeSchema);

module.exports = PriceChange;
