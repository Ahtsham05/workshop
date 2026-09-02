const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');

// The actual sellable/priced/stocked unit. Every legacy Product gets exactly one
// isDefault variant during migration (see docs/architecture/universal-product-migration.md)
// so existing flat-product flows never need to know variants exist.
const ProductVariantSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
        index: true,
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    isDefault: { type: Boolean, default: false }, // true = auto-generated legacy variant
    // No `default: null` here — the partial unique index below only indexes documents
    // where the field genuinely exists as a string, not where it's explicitly null, so
    // defaulting to null would make every sku/barcode-less variant collide on the index.
    // Uniqueness is enforced per (organizationId, branchId) — see the compound indexes
    // at the bottom of this file, same pattern as product.model.js.
    sku: { type: String, trim: true },
    barcode: { type: String, trim: true },
    attributes: { type: Map, of: String, default: {} }, // { Size: "Large", Color: "Black" }
    price: { type: Number, required: true },
    cost: { type: Number, required: true },
    // Same as Product.taxCategoryId — null falls back to the parent Product's category,
    // then the organization default, at calculation time.
    taxCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxCategory', default: null },
    unit: {
        type: String,
        default: DEFAULT_UNIT,
        enum: Object.values(UNITS)
    },
    trackBatch: { type: Boolean, default: false },
    trackExpiry: { type: Boolean, default: false },
    trackSerial: { type: Boolean, default: false }, // generalized successor to product.trackImei
    image: {
        url: { type: String },
        publicId: { type: String }
    },
    isActive: { type: Boolean, default: true },
    // Master Product Catalog migration (see docs/architecture/master-product-migration.md):
    // nullable link to the org-level shared MasterProductVariant this branch's real
    // variant represents. Unset for any variant not yet backfilled.
    masterVariantId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterProductVariant', index: true, default: null },
}, {
    timestamps: true
});

// Convert empty-string sku/barcode to a genuinely *absent* field (not null) so it
// doesn't collide with other docs under the partial unique index — see the index
// declarations below for why a plain sparse index isn't the right tool here.
ProductVariantSchema.pre('save', function (next) {
    if (this.barcode === '' || this.barcode === null) {
        this.barcode = undefined;
    }
    if (this.sku === '' || this.sku === null) {
        this.sku = undefined;
    }
    next();
});
ProductVariantSchema.pre(['updateOne', 'findOneAndUpdate'], function (next) {
    const update = this.getUpdate();
    if (update.barcode === '' || update.barcode === null) {
        delete update.barcode;
        update.$unset = { ...(update.$unset || {}), barcode: '' };
    }
    if (update.sku === '' || update.sku === null) {
        delete update.sku;
        update.$unset = { ...(update.$unset || {}), sku: '' };
    }
    next();
});

ProductVariantSchema.plugin(toJSON);
ProductVariantSchema.plugin(paginate);

ProductVariantSchema.index({ organizationId: 1, branchId: 1, productId: 1 });

// SKU and barcode are each unique per (organizationId, branchId), same scoping and same
// partial-index reasoning as product.model.js — NOT `sparse: true` on a compound index,
// see that file's comment for the production incident this avoids.
ProductVariantSchema.index(
    { organizationId: 1, branchId: 1, sku: 1 },
    { unique: true, partialFilterExpression: { sku: { $type: 'string' } } },
);
ProductVariantSchema.index(
    { organizationId: 1, branchId: 1, barcode: 1 },
    { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } },
);

const ProductVariant = mongoose.model('ProductVariant', ProductVariantSchema);

module.exports = ProductVariant;
