const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

// The stock ledger row — one document per (organizationId, branchId, variantId).
// During migration this mirrors legacy Product.stockQuantity via dual-write; see
// docs/architecture/universal-product-migration.md for the phased rollout.
const InventorySchema = new mongoose.Schema({
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
    variantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductVariant',
        required: true,
        index: true,
    },
    quantity: { type: Number, required: true, default: 0 },
    reservedQuantity: { type: Number, default: 0 },
    averageCost: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    reorderQty: { type: Number, default: 0 },
}, {
    timestamps: true
});

InventorySchema.plugin(toJSON);
InventorySchema.plugin(paginate);

InventorySchema.index({ organizationId: 1, branchId: 1, variantId: 1 }, { unique: true });

const Inventory = mongoose.model('Inventory', InventorySchema);

module.exports = Inventory;
