const crypto = require('crypto');
const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const restaurantTableSchema = mongoose.Schema(
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
    floorId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'RestaurantFloor',
      required: true,
      index: true,
    },
    label: { type: String, required: true, trim: true },
    capacity: { type: Number, default: 4, min: 1 },
    qrToken: { type: String, unique: true, sparse: true },
    status: {
      type: String,
      enum: ['available', 'occupied', 'reserved', 'cleaning'],
      default: 'available',
    },
  },
  { timestamps: true }
);

restaurantTableSchema.plugin(toJSON);
restaurantTableSchema.plugin(paginate);

restaurantTableSchema.index({ branchId: 1, floorId: 1, label: 1 }, { unique: true });

restaurantTableSchema.pre('save', function assignQr(next) {
  if (!this.qrToken) {
    this.qrToken = crypto.randomBytes(24).toString('hex');
  }
  next();
});

/**
 * @typedef RestaurantTable
 */
const RestaurantTable = mongoose.model('RestaurantTable', restaurantTableSchema);

module.exports = RestaurantTable;
