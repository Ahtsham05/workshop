const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * Min / max for one product in one warehouse (Odoo's "reordering rule"). When the quantity
 * there falls to `minQty` or below, replenishment suggests bringing it up to `maxQty`: first
 * by a transfer from `sourceWarehouseId` (default: the branch's default warehouse), and
 * whatever that warehouse can't cover as "to buy". See warehouse.service.js#getReplenishment.
 */
const warehouseReorderRuleSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    minQty: { type: Number, required: true, min: 0 },
    maxQty: { type: Number, required: true, min: 0 },
    sourceWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

warehouseReorderRuleSchema.plugin(toJSON);

warehouseReorderRuleSchema.index({ warehouseId: 1, productId: 1, variantId: 1 }, { unique: true });
warehouseReorderRuleSchema.index({ organizationId: 1, branchId: 1, isActive: 1 });

const WarehouseReorderRule = mongoose.model('WarehouseReorderRule', warehouseReorderRuleSchema);

module.exports = WarehouseReorderRule;
