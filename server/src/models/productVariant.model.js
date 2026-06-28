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
    sku: { type: String, trim: true },
    // No `default: null` here — Mongo's sparse index only skips documents where the
    // field is truly *missing*, not where it's explicitly null, so defaulting to null
    // would make every barcode-less variant collide on the unique index.
    barcode: { type: String, trim: true, sparse: true, unique: true },
    attributes: { type: Map, of: String, default: {} }, // { Size: "Large", Color: "Black" }
    price: { type: Number, required: true },
    cost: { type: Number, required: true },
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
}, {
    timestamps: true
});

// Convert empty-string barcode to a genuinely *absent* field (not null) so it doesn't
// collide with other docs under the sparse unique index — sparse only excludes missing
// fields, not explicit nulls.
ProductVariantSchema.pre('save', function (next) {
    if (this.barcode === '' || this.barcode === null) {
        this.barcode = undefined;
    }
    next();
});
ProductVariantSchema.pre(['updateOne', 'findOneAndUpdate'], function (next) {
    const update = this.getUpdate();
    if (update.barcode === '' || update.barcode === null) {
        delete update.barcode;
        update.$unset = { ...(update.$unset || {}), barcode: '' };
    }
    next();
});

ProductVariantSchema.plugin(toJSON);
ProductVariantSchema.plugin(paginate);

ProductVariantSchema.index({ organizationId: 1, branchId: 1, productId: 1 });
ProductVariantSchema.index({ organizationId: 1, branchId: 1, sku: 1 }, { sparse: true });

const ProductVariant = mongoose.model('ProductVariant', ProductVariantSchema);

module.exports = ProductVariant;
