const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

// One applied "price update" — everything a single Apply click changed, from one pasted
// message / PDF / spreadsheet / photo. The per-product before/after lines live in PriceChange
// (one collection row each), NOT embedded here: a real supplier list touches hundreds to
// thousands of products, which would bloat this document toward Mongo's 16MB limit and make
// the History list load every line just to show a row. This document is the header: who,
// when, from what, with what pricing rule, and the totals.
const PriceUpdateBatchSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    // Human-friendly per-organization sequence ("Price update #12") — see
    // priceUpdate.service.js#nextBatchNumber. Unique per org via the index below.
    batchNumber: { type: Number, required: true },
    source: {
      type: {
        type: String,
        enum: ['text', 'whatsapp', 'pdf', 'excel', 'image', 'manual'],
        default: 'text',
      },
      fileName: { type: String, trim: true },
      supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
      // Snapshot: history must keep reading correctly after a supplier is renamed or deleted.
      supplierName: { type: String, trim: true },
    },
    // What the numbers in the source list meant: the supplier's price to us (cost), our
    // selling price, or both columns.
    priceMode: { type: String, enum: ['cost', 'price', 'both'], default: 'cost' },
    // Snapshot of the pricing rule in force (keep margin / fixed margin / rounding / guards) so
    // an old update can be explained later, whatever the current defaults are.
    rule: { type: mongoose.Schema.Types.Mixed, default: null },
    note: { type: String, trim: true, maxlength: 500 },
    // The raw pasted text, kept for audit ("what exactly did the supplier send?"). Excluded
    // from queries by default — only the detail view asks for it.
    sourceText: { type: String, select: false },
    stats: {
      requested: { type: Number, default: 0 },
      applied: { type: Number, default: 0 },
      unchanged: { type: Number, default: 0 },
      stale: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      costUp: { type: Number, default: 0 },
      costDown: { type: Number, default: 0 },
      priceUp: { type: Number, default: 0 },
      priceDown: { type: Number, default: 0 },
      avgCostChangePercent: { type: Number, default: 0 },
      avgPriceChangePercent: { type: Number, default: 0 },
    },
    // 'applying' is only ever visible if the process died mid-apply.
    status: {
      type: String,
      enum: ['applying', 'applied', 'failed', 'rolled_back', 'partially_rolled_back'],
      default: 'applying',
    },
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    appliedAt: { type: Date },
    rolledBackBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rolledBackAt: { type: Date },
  },
  { timestamps: true }
);

PriceUpdateBatchSchema.plugin(toJSON);

PriceUpdateBatchSchema.index({ organizationId: 1, batchNumber: 1 }, { unique: true });
PriceUpdateBatchSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });

const PriceUpdateBatch = mongoose.model('PriceUpdateBatch', PriceUpdateBatchSchema);

module.exports = PriceUpdateBatch;
