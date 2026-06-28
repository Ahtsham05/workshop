const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { BUSINESS_TYPES } = require('../config/businessTypes');

// Org-level dynamic attribute definitions (Size, Color, Diameter, ...). Actual values
// per variant live on ProductVariant.attributes — this collection only defines what
// attributes exist and which values are allowed, so nothing is hardcoded in the schema.
const ProductAttributeSchema = new mongoose.Schema({
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
    name: { type: String, required: true, trim: true }, // e.g. "Size", "Color", "Diameter"
    values: [{ type: String, trim: true }], // allowed values, org can extend over time
    businessTypes: [{ type: String, enum: BUSINESS_TYPES }], // which business types surface this attribute
    isActive: { type: Boolean, default: true },
}, {
    timestamps: true
});

ProductAttributeSchema.plugin(toJSON);
ProductAttributeSchema.plugin(paginate);

ProductAttributeSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const ProductAttribute = mongoose.model('ProductAttribute', ProductAttributeSchema);

module.exports = ProductAttribute;
