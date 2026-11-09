const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * Stored stock at one position: (warehouse, location|null, product, variant|null).
 * The default warehouse's top level is never stored here — it is derived as the branch
 * total minus every row of this collection (see models/warehouse.model.js).
 * Only ever changed with $inc by warehouse.service.js#applyMoves.
 */
const warehouseStockSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation', default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    quantity: { type: Number, default: 0 },
  },
  { timestamps: true }
);

warehouseStockSchema.plugin(toJSON);

warehouseStockSchema.index({ warehouseId: 1, locationId: 1, productId: 1, variantId: 1 }, { unique: true });
warehouseStockSchema.index({ organizationId: 1, branchId: 1, productId: 1 });

const WarehouseStock = mongoose.model('WarehouseStock', warehouseStockSchema);

module.exports = WarehouseStock;
