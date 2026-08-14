const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');

// Part of the Master Product Catalog migration — see
// docs/architecture/master-product-migration.md. One canonical record per real variant
// (size/color/etc combination) of a `hasVariants` MasterProduct — what
// `ProductVariant.masterVariantId` links to across branches. Same identity-vs-branch
// split as MasterProduct: sku/attributes/unit/tracking flags are the template;
// defaultPrice/defaultCost are only suggested starting values for a branch importing
// this variant for the first time.
const MasterProductVariantSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    masterProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MasterProduct',
        required: true,
        index: true,
    },
    sku: { type: String, trim: true },
    attributes: { type: Map, of: String, default: {} }, // { Size: "Large", Color: "Black" }
    unit: {
        type: String,
        default: DEFAULT_UNIT,
        enum: Object.values(UNITS),
    },
    trackBatch: { type: Boolean, default: false },
    trackExpiry: { type: Boolean, default: false },
    trackSerial: { type: Boolean, default: false },
    image: {
        url: { type: String },
        publicId: { type: String },
    },
    defaultPrice: { type: Number },
    defaultCost: { type: Number },
}, {
    timestamps: true,
});

MasterProductVariantSchema.plugin(toJSON);
MasterProductVariantSchema.plugin(paginate);

MasterProductVariantSchema.index({ organizationId: 1, masterProductId: 1 });

const MasterProductVariant = mongoose.model('MasterProductVariant', MasterProductVariantSchema);

module.exports = MasterProductVariant;
