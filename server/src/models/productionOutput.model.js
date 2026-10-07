const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');
const { OUTPUT_STATUSES, REJECT_DISPOSITIONS } = require('../config/manufacturing');

/**
 * A production report: `producedQuantity` units came off the line for an order. Reporting
 * it backflushes the materials it used out of WIP. The units then wait in QC
 * (status 'pending_qc', InventoryTransaction stockBucket 'qc') until inspected into
 * good (→ ProductionReceipt into finished stock) and rejected (→ ScrapRecord or the order's
 * rework queue). With quality checks turned off both steps happen in one go.
 */
const ProductionOutputSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    outputNumber: { type: String, required: true, trim: true },
    productionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionOrder', required: true, index: true },
    orderNumber: { type: String, trim: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true },
    unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
    producedQuantity: { type: Number, required: true, min: 0.000001 },
    goodQuantity: { type: Number, default: 0 },
    rejectedQuantity: { type: Number, default: 0 },
    rejectDisposition: { type: String, enum: [...REJECT_DISPOSITIONS, null], default: null },
    rejectReason: { type: String, trim: true, default: '' },
    status: { type: String, enum: OUTPUT_STATUSES, default: 'pending_qc', index: true },
    // Material backflushed out of WIP for this output, lot by lot.
    consumption: {
      type: [
        new mongoose.Schema(
          {
            materialLineId: { type: mongoose.Schema.Types.ObjectId },
            wipLotId: { type: mongoose.Schema.Types.ObjectId },
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            productName: { type: String, trim: true },
            unit: { type: String },
            quantity: { type: Number },
            batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
            imeiIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Imei' }], default: undefined },
            cost: { type: Number, default: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    materialCost: { type: Number, default: 0 },
    unitCost: { type: Number, default: 0 },
    receiptId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReceipt', default: null },
    scrapId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScrapRecord', default: null },
    reportedAt: { type: Date, default: Date.now },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    inspectedAt: { type: Date, default: null },
    inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    inspectionNotes: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    // Created by the manufacturing demo-data seeder (services/manufacturing/demoData.service.js).
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

ProductionOutputSchema.plugin(toJSON);
ProductionOutputSchema.plugin(paginate);

ProductionOutputSchema.index({ organizationId: 1, outputNumber: 1 }, { unique: true });
ProductionOutputSchema.index({ organizationId: 1, branchId: 1, status: 1, createdAt: -1 });

const ProductionOutput = mongoose.model('ProductionOutput', ProductionOutputSchema);

module.exports = ProductionOutput;
