const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * A warehouse (stock-holding site) inside a branch. A branch can have any number of them.
 *
 * Stock model (services/warehouse.service.js):
 *  - The branch's stock total stays where it always was (Product.stockQuantity, or
 *    Inventory.quantity for a real variant). Every existing flow keeps writing it unchanged.
 *  - Stock held in a non-default warehouse (or in a bin of any warehouse) is stored in
 *    WarehouseStock.
 *  - The branch's DEFAULT warehouse, at its top level, holds the remainder:
 *        branch total − everything stored in WarehouseStock.
 *    So a sale, purchase, adjustment or transfer that never mentions a warehouse lands in
 *    the default warehouse automatically, and turning the module off never breaks stock.
 */
const WAREHOUSE_TYPES = ['main', 'store', 'showroom', 'production', 'transit', 'returns', 'damaged', 'other'];

const warehouseSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Short code printed on transfers and location paths (WH, WH2, SHOP …).
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 12 },
    type: { type: String, enum: WAREHOUSE_TYPES, default: 'store' },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    address: { type: String, trim: true, maxlength: 500, default: '' },
    city: { type: String, trim: true, maxlength: 120, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    // Which documents may pick this warehouse.
    allowSales: { type: Boolean, default: true },
    allowReceipts: { type: Boolean, default: true },
    color: { type: String, trim: true, default: 'blue' },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

warehouseSchema.plugin(toJSON);
warehouseSchema.plugin(paginate);

warehouseSchema.index({ organizationId: 1, branchId: 1, code: 1 }, { unique: true });
warehouseSchema.index({ organizationId: 1, branchId: 1, isDefault: 1 });

const Warehouse = mongoose.model('Warehouse', warehouseSchema);

module.exports = Warehouse;
module.exports.WAREHOUSE_TYPES = WAREHOUSE_TYPES;
