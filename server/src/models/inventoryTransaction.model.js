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
        enum: [
            'purchase', 'sale', 'return_in', 'return_out', 'transfer_in', 'transfer_out', 'adjustment', 'expiry_writeoff', 'damage', 'theft',
            // Manufacturing (services/manufacturing/stock.service.js). Each one names the
            // bucket it moves (see stockBucket below):
            'production_issue', // available − : components issued to a production order
            'wip_in', //          wip       + : …and the same units arriving in WIP
            'wip_return', //      wip       − : unused WIP sent back…
            'production_return', // available + : …into stock
            'wip_consume', //     wip       − : backflushed into reported output
            'wip_scrap', //       wip       − : issued material scrapped on the floor
            'qc_in', //           qc        + : output waiting for quality inspection
            'qc_out', //          qc        − : inspected
            'production_receipt', // available + : good output into finished stock
            'rework_in', //       rework    + : rejected output sent to rework
            'rework_out', //      rework    − : rework resolved (good → stock, rest → scrap)
            'production_scrap', // available − : finished stock written off as scrap
        ],
        required: true,
    },
    // Which balance the row moves. 'available' is ordinary sellable stock (what
    // Product.stockQuantity / Inventory.quantity hold); the others are manufacturing holding
    // areas whose balances exist only in this ledger, per production order. Every row written
    // before manufacturing existed is implicitly 'available'.
    stockBucket: { type: String, enum: ['available', 'wip', 'qc', 'rework'], default: 'available' },
    quantityDelta: { type: Number, required: true }, // signed
    balanceAfter: { type: Number, required: true },
    unitCost: { type: Number },
    refType: { type: String }, // 'Purchase' | 'Invoice' | 'InventoryTransfer' | ...
    refId: { type: mongoose.Schema.Types.ObjectId },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // ── Optional traceability (written by manufacturing; absent on older rows) ──────────
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    unit: { type: String },
    // Stock is held per branch, so the branch IS the warehouse; `location` is the bin/area
    // label inside it (raw-material store, production floor, FG store).
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    location: { type: String },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    imeiIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Imei' }], default: undefined },
    serialNumbers: { type: [String], default: undefined },
    productionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionOrder' },
}, {
    timestamps: true,
    keepTimestampsInJSON: true,
});

InventoryTransactionSchema.plugin(toJSON);
InventoryTransactionSchema.plugin(paginate);

InventoryTransactionSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ inventoryId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ refType: 1, refId: 1 });
InventoryTransactionSchema.index({ productionOrderId: 1, createdAt: 1 }, { partialFilterExpression: { productionOrderId: { $exists: true } } });
InventoryTransactionSchema.index({ organizationId: 1, branchId: 1, productId: 1, createdAt: -1 });

const InventoryTransaction = mongoose.model('InventoryTransaction', InventoryTransactionSchema);

module.exports = InventoryTransaction;
