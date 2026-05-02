const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const restaurantFloorSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

restaurantFloorSchema.plugin(toJSON);
restaurantFloorSchema.plugin(paginate);

restaurantFloorSchema.index({ branchId: 1, name: 1 }, { unique: true });

/**
 * @typedef RestaurantFloor
 */
const RestaurantFloor = mongoose.model('RestaurantFloor', restaurantFloorSchema);

module.exports = RestaurantFloor;
