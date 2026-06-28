const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

// Immutable ledger of every stock move, any reason — lets you reconstruct "what was the
// stock on date X" and audit discrepancies, which a single mutable counter cannot.
const InventoryTransactionSchema = new mongoose.Schema({
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
    inventoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: true,
        index: true,
    },
    variantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductVariant',
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: ['purchase', 'sale', 'return_in', 'return_out', 'transfer_in', 'transfer_out', 'adjustment', 'expiry_writeoff'],
        required: true,
    },
    quantityDelta: { type: Number, required: true }, // signed
    balanceAfter: { type: Number, required: true },
    unitCost: { type: Number },
    refType: { type: String }, // 'Purchase' | 'Invoice' | 'InventoryTransfer' | ...
    refId: { type: mongoose.Schema.Types.ObjectId },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
    timestamps: true
});

InventoryTransactionSchema.plugin(toJSON);
InventoryTransactionSchema.plugin(paginate);

InventoryTransactionSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ inventoryId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ refType: 1, refId: 1 });

const InventoryTransaction = mongoose.model('InventoryTransaction', InventoryTransactionSchema);

module.exports = InventoryTransaction;
