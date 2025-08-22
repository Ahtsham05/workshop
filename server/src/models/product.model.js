const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
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
ProductSchema.plugin(toJSON);
ProductSchema.plugin(paginate);

const Product = mongoose.model('Product', ProductSchema);

module.exports = Product;
