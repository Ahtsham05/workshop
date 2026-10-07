const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');
const { PRODUCTION_STATUSES, PRODUCTION_PRIORITIES, ORDER_TYPES } = require('../config/manufacturing');

/**
 * A material the order needs, snapshotted from the (exploded) BOM when the order is
 * created or its BOM/quantity changes while still editable. Execution only ever moves
 * `issuedQuantity`/`issuedCost`/`scrappedQuantity`; the requirement itself is frozen
 * from release onwards.
 */
const ProductionMaterialSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true },
    sku: { type: String, trim: true },
    unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
    // Net quantity per the BOM, and the quantity including the component's scrap allowance.
    baseQuantity: { type: Number, required: true, min: 0 },
    requiredQuantity: { type: Number, required: true, min: 0 },
    // All in the line's own (primary component) units — an alternative issued at ratio r is
    // credited as qty ÷ r. In WIP right now = issued − returned − consumed − scrapped.
    issuedQuantity: { type: Number, default: 0 },
    issuedCost: { type: Number, default: 0 },
    returnedQuantity: { type: Number, default: 0 },
    consumedQuantity: { type: Number, default: 0 },
    consumedCost: { type: Number, default: 0 },
    scrappedQuantity: { type: Number, default: 0 },
    isOptional: { type: Boolean, default: false },
    // 1 = direct component of the order's BOM, 2+ = came from an exploded sub-assembly.
    level: { type: Number, default: 1 },
    // Which BOM (version) this line was exploded from, for traceability.
    sourceBomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bom', default: null },
    alternatives: {
      type: [
        new mongoose.Schema(
          {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
            productName: { type: String, trim: true },
            ratio: { type: Number, default: 1 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: true }
);

/**
 * A quantity of one physical item currently sitting in this order's WIP: what was issued
 * (product/variant, the batch it came from, the serial units), at what cost, and against
 * which material line. Consumed / returned / scrapped FIFO. The authoritative record of
 * every move is the InventoryTransaction ledger (stockBucket 'wip'); lots are the order's
 * running balance of it so execution never has to re-aggregate the ledger.
 */
const WipLotSchema = new mongoose.Schema(
  {
    materialLineId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true },
    unit: { type: String },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
    batchNumber: { type: String, trim: true },
    imeiIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Imei' }], default: undefined },
    serialNumbers: { type: [String], default: undefined },
    // Physical units of this item still in WIP, and how many of them equal one unit of the
    // material line (1 for the primary component, the BOM ratio for an alternative).
    quantity: { type: Number, required: true, min: 0 },
    ratio: { type: Number, default: 1 },
    isAlternative: { type: Boolean, default: false },
    unitCost: { type: Number, default: 0 },
    issueId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialIssue' },
    issuedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const StatusHistorySchema = new mongoose.Schema(
  {
    from: { type: String },
    to: { type: String, required: true },
    note: { type: String, trim: true, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * A production (manufacturing) order. Stock in Logix Plus is held per branch, so the
 * order's branch IS its warehouse: materials are issued from and finished goods received
 * into that branch's stock. The location fields are labels for areas/bins inside it
 * (raw-material store, production floor, FG store) — informational in Phase 1.
 */
const ProductionOrderSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    orderNumber: { type: String, required: true, trim: true },
    // 'assembly' orders build (sub-)assemblies — same engine, own numbering and lifecycle.
    orderType: { type: String, enum: ORDER_TYPES, default: 'production', index: true },
    // Nesting: the order (and its material line) this one was created to supply. The
    // sub-assembly it builds goes into stock and is issued to the parent like any component.
    parentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionOrder', default: null, index: true },
    parentMaterialLineId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // The person doing the assembly work.
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    operatorName: { type: String, trim: true, default: '' },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true },
    sku: { type: String, trim: true },
    unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
    bomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bom', default: null },
    bomNumber: { type: String, trim: true },
    bomVersion: { type: Number },
    plannedQuantity: { type: Number, required: true, min: 0.000001 },
    // Output flow: produced = reported by the floor; it then sits in QC (qcPending) until
    // inspected into good (→ finished stock, counted in completedQuantity) and rejected
    // (→ scrap or rework). Rework that passes later also lands in completedQuantity.
    producedQuantity: { type: Number, default: 0 },
    completedQuantity: { type: Number, default: 0 },
    rejectedQuantity: { type: Number, default: 0 },
    qcPendingQuantity: { type: Number, default: 0 },
    reworkPendingQuantity: { type: Number, default: 0 },
    reworkedGoodQuantity: { type: Number, default: 0 },
    scrappedQuantity: { type: Number, default: 0 },
    plannedStartDate: { type: Date, default: null },
    plannedCompletionDate: { type: Date, default: null },
    actualStartDate: { type: Date, default: null },
    actualCompletionDate: { type: Date, default: null },
    sourceLocation: { type: String, trim: true, default: '' },
    wipLocation: { type: String, trim: true, default: '' },
    finishedGoodsLocation: { type: String, trim: true, default: '' },
    status: { type: String, enum: PRODUCTION_STATUSES, default: 'draft', index: true },
    priority: { type: String, enum: PRODUCTION_PRIORITIES, default: 'normal' },
    notes: { type: String, trim: true, default: '' },
    materials: { type: [ProductionMaterialSchema], default: [] },
    wipLots: { type: [WipLotSchema], default: [] },
    // Unit cost of output sitting in QC / rework, so it is valued when it finally lands.
    qcPendingCost: { type: Number, default: 0 },
    reworkPendingCost: { type: Number, default: 0 },
    // Running totals kept in step with issues/receipts so lists and the dashboard never
    // need to aggregate the transaction collections.
    materialCost: { type: Number, default: 0 },
    finishedGoodsValue: { type: Number, default: 0 },
    statusHistory: { type: [StatusHistorySchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Created by the manufacturing demo-data seeder (services/manufacturing/demoData.service.js).
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

ProductionOrderSchema.plugin(toJSON);
ProductionOrderSchema.plugin(paginate);

ProductionOrderSchema.index({ organizationId: 1, orderNumber: 1 }, { unique: true });
ProductionOrderSchema.index({ organizationId: 1, branchId: 1, status: 1, plannedCompletionDate: 1 });
ProductionOrderSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
ProductionOrderSchema.index({ organizationId: 1, bomId: 1 });

const ProductionOrder = mongoose.model('ProductionOrder', ProductionOrderSchema);

module.exports = ProductionOrder;
