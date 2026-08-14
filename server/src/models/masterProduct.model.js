const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');
const { BUSINESS_TYPES } = require('../config/businessTypes');

// Part of the Master Product Catalog migration — see
// docs/architecture/master-product-migration.md. One canonical record per physical
// item PER ORGANIZATION (not per branch) — the shared identity that per-branch
// `Product` documents link to via `Product.masterProductId`. Purely a template: name,
// barcode, category, brand, image, tracking flags. Price/cost/stock stay branch-specific
// on `Product` — `defaultPrice`/`defaultCost` here are only suggested starting values
// for a branch importing this product for the first time, never authoritative.
const MasterProductSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    name: { type: String, required: true, trim: true },
    nameUrdu: { type: String, trim: true },
    description: { type: String },
    // Sparse-unique but scoped to organizationId (see compound index below) — deliberately
    // NOT reusing Product.barcode's global-unique index, so this stays purely additive and
    // never touches a live index. This is also more correct for multi-tenant isolation
    // going forward: two different orgs can now legitimately share a barcode value.
    barcode: { type: String, trim: true },
    unit: {
        type: String,
        default: DEFAULT_UNIT,
        enum: Object.values(UNITS),
    },
    unitConversions: [
        {
            fromUnit: { type: String, required: true, enum: Object.values(UNITS) },
            toUnit: { type: String, required: true, enum: Object.values(UNITS) },
            factor: { type: Number, required: true, min: 0.000001 },
            businessTypes: [{ type: String, enum: BUSINESS_TYPES }],
            isActive: { type: Boolean, default: true },
        },
    ],
    trackImei: { type: Boolean, default: false },
    trackSerial: { type: Boolean, default: false },
    // Only meaningful for a non-hasVariants master (mirrors the source product's hidden
    // default ProductVariant, where trackBatch/trackExpiry actually live — see
    // product.service.js#syncDefaultVariantTracking). For a hasVariants master, batch
    // tracking is per real variant instead — see MasterProductVariant.trackBatch/trackExpiry.
    trackBatch: { type: Boolean, default: false },
    trackExpiry: { type: Boolean, default: false },
    warrantyMonths: { type: Number, default: 0 },
    category: { type: String },
    categories: [{
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
        name: { type: String, required: true },
        image: { url: { type: String }, publicId: { type: String } },
    }],
    subCategories: [{
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'SubCategory' },
        name: { type: String, required: true },
        image: { url: { type: String }, publicId: { type: String } },
    }],
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
    image: {
        url: { type: String },
        publicId: { type: String },
    },
    // Suggested starting price/cost for a branch importing this product for the first
    // time — never authoritative, always editable per branch at import time.
    defaultPrice: { type: Number },
    defaultCost: { type: Number },
    // True once at least one MasterProductVariant exists for this master product.
    hasVariants: { type: Boolean, default: false },
}, {
    timestamps: true,
});

// Convert empty-string barcode to a genuinely *absent* field (not null) so it doesn't
// collide with other docs under the sparse unique index — same rule as Product.barcode.
MasterProductSchema.pre('save', function (next) {
    if (this.barcode === '' || this.barcode === null) {
        this.barcode = undefined;
    }
    next();
});
MasterProductSchema.pre(['updateOne', 'findOneAndUpdate'], function (next) {
    const update = this.getUpdate();
    if (update.barcode === '' || update.barcode === null) {
        delete update.barcode;
        update.$unset = { ...(update.$unset || {}), barcode: '' };
    }
    next();
});

MasterProductSchema.plugin(toJSON);
MasterProductSchema.plugin(paginate);

// NOT `sparse: true` here — sparse on a COMPOUND index only excludes a document when
// ALL indexed fields are missing, not just one. Since organizationId is always present,
// a sparse compound index would still index every barcode-less product as
// {organizationId, barcode: null} and falsely collide with every other barcode-less
// product in the same org (hit in production: 18/19 products in one org linked fine,
// the 19th — also barcode-less — got an E11000 dup key on {organizationId, barcode:
// null}). A partial index scoped to "barcode genuinely exists as a string" is the
// correct way to make an optional field unique-when-present in a compound index.
MasterProductSchema.index(
    { organizationId: 1, barcode: 1 },
    { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } },
);
MasterProductSchema.index({ organizationId: 1, name: 1 });

const MasterProduct = mongoose.model('MasterProduct', MasterProductSchema);

module.exports = MasterProduct;
