const mongoose = require('mongoose');
const { toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');

/**
 * One way a bulk finished good leaves the factory: "1 KG Carton (20 × 1 KG)", "5 KG Bag",
 * "20 KG Bag" … The bulk product (e.g. Vito Mineral T, in kg) is what the BOM and the
 * production orders make; at packing time (services/manufacturing/packing.service.js) its
 * stock is turned into the pack product named here — a normal sellable product with its
 * own SKU, price and stock — and the packing materials listed below are used up.
 *
 *   contentQuantity  bulk per ONE pack, in the bulk product's unit (a 1 KG × 20 carton = 20)
 *   innerCount/Name  what is inside, for labels and prints ("20 × 1 KG pouch")
 *   materials        packing material per ONE pack (1 carton box, 20 pouches, 1 label …)
 */
const PackSizeSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    packProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    contentQuantity: { type: Number, required: true, min: 0.000001 },
    contentUnit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
    innerCount: { type: Number, min: 1, default: 1 },
    innerName: { type: String, trim: true, default: '', maxlength: 60 },
    materials: {
      type: [
        new mongoose.Schema(
          {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            productName: { type: String, trim: true },
            unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
            quantity: { type: Number, required: true, min: 0.000001 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    isActive: { type: Boolean, default: true },
    sequence: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

PackSizeSchema.plugin(toJSON);
PackSizeSchema.index({ organizationId: 1, branchId: 1, productId: 1, sequence: 1 });
PackSizeSchema.index({ organizationId: 1, packProductId: 1 });

const PackSize = mongoose.model('PackSize', PackSizeSchema);

module.exports = PackSize;
