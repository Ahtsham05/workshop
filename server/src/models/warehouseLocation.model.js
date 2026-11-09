const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * A storage location inside a warehouse: zone → aisle → rack → shelf → bin, any depth.
 * `path` is the full readable name ("A / R1 / S2") kept in sync by warehouse.service.js
 * whenever a location or one of its parents is renamed or moved.
 */
const LOCATION_TYPES = ['zone', 'aisle', 'rack', 'shelf', 'bin'];

const warehouseLocationSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation', default: null },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: LOCATION_TYPES, default: 'bin' },
    path: { type: String, trim: true, default: '' },
    barcode: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

warehouseLocationSchema.plugin(toJSON);
warehouseLocationSchema.plugin(paginate);

warehouseLocationSchema.index({ warehouseId: 1, parentId: 1, name: 1 });

const WarehouseLocation = mongoose.model('WarehouseLocation', warehouseLocationSchema);

module.exports = WarehouseLocation;
module.exports.LOCATION_TYPES = LOCATION_TYPES;
