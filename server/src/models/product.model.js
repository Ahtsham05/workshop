const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const syncVersionPlugin = require('./plugins/syncVersion.plugin');
const { DEFAULT_UNIT, UNITS } = require('../config/units');
const { BUSINESS_TYPES } = require('../config/businessTypes');

const ProductSchema = new mongoose.Schema({
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
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    name: { type: String, required: true },
    nameUrdu: { type: String },
    description: { type: String },
    barcode: { 
        type: String, 
        sparse: true, 
        unique: true,
        default: null
    },
    price: { type: Number, required: true },
    cost: { type: Number, required: true },
    stockQuantity: { type: Number, required: true },
    unit: { 
        type: String, 
        default: DEFAULT_UNIT,
        enum: Object.values(UNITS)
    },
    unitConversions: [
        {
            fromUnit: {
                type: String,
                required: true,
                enum: Object.values(UNITS),
            },
            toUnit: {
                type: String,
                required: true,
                enum: Object.values(UNITS),
            },
            factor: {
                type: Number,
                required: true,
                min: 0.000001,
            },
            businessTypes: [
                {
                    type: String,
                    enum: BUSINESS_TYPES,
                },
            ],
            isActive: {
                type: Boolean,
                default: true,
            },
        },
    ],
    trackImei: { type: Boolean, default: false }, // Track IMEI/serial number per unit (e.g. mobile phones)
    warrantyMonths: { type: Number, default: 0 }, // Warranty length applied to IMEI units sold for this product
    sku: { type: String },  // SKU for inventory management
    category: { type: String }, // Keep for backward compatibility
    categories: [{ // New multi-category support
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
        name: { type: String, required: true },
        image: {
            url: { type: String },
            publicId: { type: String }
        }
    }],
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' }, // Reference to supplier
    /**
     * Dates (one per calendar day, deduped) on which this product was found at zero stock.
     * Pruned to a trailing 90-day window by the daily purchase-suggestions job — feeds the
     * dynamic safety-stock formula in services/purchaseSuggestions.service.js. Starts empty;
     * builds up real history going forward rather than guessing at past stockouts.
     */
    stockoutHistory: [{ type: Date }],
    image: {
        url: { type: String }, // Cloudinary URL
        publicId: { type: String } // Cloudinary public ID for deletion
    },
},{
    timestamps: true
});

// Pre-save middleware to handle empty barcode values
ProductSchema.pre('save', function(next) {
    // Convert empty string barcode to null to work with sparse unique index
    if (this.barcode === '') {
        this.barcode = null;
    }
    next();
});

// Pre-update middleware to handle empty barcode values
ProductSchema.pre(['updateOne', 'findOneAndUpdate'], function(next) {
    const update = this.getUpdate();
    if (update.barcode === '') {
        update.barcode = null;
    }
    next();
});

// add plugin that converts mongoose to json
ProductSchema.plugin(syncVersionPlugin);
ProductSchema.plugin(toJSON);
ProductSchema.plugin(paginate);

ProductSchema.index({ organizationId: 1, branchId: 1 });
ProductSchema.index({ organizationId: 1, branchId: 1, name: 1 }, { unique: false });

const Product = mongoose.model('Product', ProductSchema);

module.exports = Product;
