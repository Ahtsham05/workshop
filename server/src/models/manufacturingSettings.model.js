const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const counterDefaults = () => ({
  bom: 0,
  productionOrder: 0,
  materialIssue: 0,
  materialReturn: 0,
  productionOutput: 0,
  productionReceipt: 0,
  scrap: 0,
});

/**
 * One document per organization: manufacturing preferences plus the atomic document
 * counters behind BOM / production-order / issue / receipt / scrap numbers. Counters are
 * only ever advanced with $inc (see manufacturingSettings.service.js#nextDocumentNumber),
 * so concurrent creates never hand out the same number.
 */
const ManufacturingSettingsSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
    },
    prefixes: {
      bom: { type: String, trim: true, default: 'BOM' },
      productionOrder: { type: String, trim: true, default: 'MO' },
      materialIssue: { type: String, trim: true, default: 'MI' },
      materialReturn: { type: String, trim: true, default: 'MR' },
      productionOutput: { type: String, trim: true, default: 'PO' },
      productionReceipt: { type: String, trim: true, default: 'FG' },
      scrap: { type: String, trim: true, default: 'SCR' },
    },
    numberPadding: { type: Number, min: 3, max: 10, default: 5 },
    // Default location labels (bins/areas inside a branch) pre-filled on new production
    // orders. Stock itself is held per branch — see productionOrder.model.js.
    defaultSourceLocation: { type: String, trim: true, default: 'Raw Material Store' },
    defaultWipLocation: { type: String, trim: true, default: 'Production Floor' },
    defaultFinishedGoodsLocation: { type: String, trim: true, default: 'Finished Goods Store' },
    // Block a material issue that would take a component's on-hand stock below zero.
    allowNegativeStockIssue: { type: Boolean, default: false },
    // Block receiving more finished goods than the order planned.
    allowOverProduction: { type: Boolean, default: false },
    // Every new production order must reference a BOM.
    requireBomForProduction: { type: Boolean, default: true },
    // Explode sub-assemblies' own BOMs when computing material requirements; when off,
    // a sub-assembly is treated as a stocked item to be issued as-is.
    explodeSubAssemblies: { type: Boolean, default: false },
    // Reported output waits in a QC hold until inspected; when off, good/rejected
    // quantities are entered with the output and posted straight away.
    requireQualityCheck: { type: Boolean, default: true },
    defaultRejectDisposition: { type: String, enum: ['scrap', 'rework'], default: 'scrap' },
    defaultPriority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    counters: {
      type: new mongoose.Schema(
        {
          bom: { type: Number, default: 0 },
          productionOrder: { type: Number, default: 0 },
          materialIssue: { type: Number, default: 0 },
          materialReturn: { type: Number, default: 0 },
          productionOutput: { type: Number, default: 0 },
          productionReceipt: { type: Number, default: 0 },
          scrap: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: counterDefaults,
    },
    // Progress of the background demo-data load (services/manufacturing/demoData.service.js).
    // Kept in the DB, not in memory, so any server instance can report it and a load cut
    // short by a restart is recognisable (heartbeat goes stale).
    demoJob: {
      type: new mongoose.Schema(
        {
          state: { type: String, enum: ['running', 'done', 'failed'] },
          action: { type: String, enum: ['load', 'reload'] },
          branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
          step: { type: Number, default: 0 },
          total: { type: Number, default: 0 },
          message: { type: String, default: '' },
          error: { type: String, default: '' },
          result: { type: mongoose.Schema.Types.Mixed, default: null },
          startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          startedAt: { type: Date },
          heartbeatAt: { type: Date },
          finishedAt: { type: Date },
        },
        { _id: false }
      ),
      default: null,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

ManufacturingSettingsSchema.plugin(toJSON);

const ManufacturingSettings = mongoose.model('ManufacturingSettings', ManufacturingSettingsSchema);

module.exports = ManufacturingSettings;
