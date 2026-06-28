const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

// Lot/expiry tracking for pharmacy/grocery-style inventory. Zero rows, zero query cost
// for tenants that never need batch tracking — purely additive to Inventory.
const BatchSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    inventoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: true,
        index: true,
    },
    batchNumber: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true },
    costPerUnit: { type: Number, required: true },
    // Intended retail price for units from this batch — lets Sale Invoice switch the
    // line's sale price (not just cost) when the seller picks a specific batch.
    sellingPrice: { type: Number },
    manufactureDate: { type: Date },
    expiryDate: { type: Date, index: true }, // FEFO queries, expiry alert jobs
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    status: {
        type: String,
        enum: ['active', 'depleted', 'expired', 'written_off'],
        default: 'active',
    },
}, {
    timestamps: true
});

BatchSchema.plugin(toJSON);
BatchSchema.plugin(paginate);

BatchSchema.index({ organizationId: 1, inventoryId: 1, batchNumber: 1 }, { unique: true });
BatchSchema.index({ organizationId: 1, expiryDate: 1 });

const Batch = mongoose.model('Batch', BatchSchema);

module.exports = Batch;
