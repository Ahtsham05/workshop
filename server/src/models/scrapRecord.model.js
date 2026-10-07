const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');
const { SCRAP_STAGES, SCRAP_REASONS } = require('../config/manufacturing');

/**
 * A manufacturing scrap / loss entry. `stage` says where it happened:
 *  - material:      issued components wasted on the floor (already out of stock — record only)
 *  - wip:           partly-made output lost in process (record only)
 *  - finished_good: finished stock written off — this one decrements branch stock
 *                   (InventoryTransaction type 'production_scrap')
 */
const ScrapRecordSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    scrapNumber: { type: String, required: true, trim: true },
    productionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionOrder', default: null, index: true },
    orderNumber: { type: String, trim: true },
    // Set for material-stage scrap: the ProductionOrder.materials[] entry it came from.
    materialLineId: { type: mongoose.Schema.Types.ObjectId, default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true },
    unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
    stage: { type: String, enum: SCRAP_STAGES, required: true },
    reason: { type: String, enum: SCRAP_REASONS, default: 'other' },
    quantity: { type: Number, required: true, min: 0.000001 },
    unitCost: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    affectsStock: { type: Boolean, default: false },
    scrapDate: { type: Date, default: Date.now },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Created by the manufacturing demo-data seeder (services/manufacturing/demoData.service.js).
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

ScrapRecordSchema.plugin(toJSON);
ScrapRecordSchema.plugin(paginate);

ScrapRecordSchema.index({ organizationId: 1, scrapNumber: 1 }, { unique: true });
ScrapRecordSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });

const ScrapRecord = mongoose.model('ScrapRecord', ScrapRecordSchema);

module.exports = ScrapRecord;
