const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const RESERVATION_STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'no_show', 'cancelled'];

const restaurantReservationSchema = mongoose.Schema(
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
    tableId: { type: mongoose.SchemaTypes.ObjectId, ref: 'RestaurantTable' },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    partySize: { type: Number, required: true, min: 1 },
    startAt: { type: Date, required: true },
    endAt: { type: Date },
    status: {
      type: String,
      enum: RESERVATION_STATUSES,
      default: 'pending',
    },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

restaurantReservationSchema.plugin(toJSON);
restaurantReservationSchema.plugin(paginate);

restaurantReservationSchema.index({ branchId: 1, startAt: 1 });

/**
 * @typedef RestaurantReservation
 */
const RestaurantReservation = mongoose.model('RestaurantReservation', restaurantReservationSchema);

module.exports = RestaurantReservation;
