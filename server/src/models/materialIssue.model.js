const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');

/**
 * An immutable record of components taken out of branch stock for a production order.
 * Each line's stock decrement is mirrored in the InventoryTransaction ledger
 * (type 'production_issue', refType 'MaterialIssue').
 */
const MaterialIssueSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    issueNumber: { type: String, required: true, trim: true },
    // 'issue' = stock → WIP; 'return' = unused WIP → stock (numbered with the MR prefix).
    kind: { type: String, enum: ['issue', 'return'], default: 'issue', index: true },
    // Set when the user deliberately issued more than the remaining requirement.
    isOverIssue: { type: Boolean, default: false },
    productionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionOrder', required: true, index: true },
    orderNumber: { type: String, trim: true },
    issueDate: { type: Date, default: Date.now },
    lines: {
      type: [
        new mongoose.Schema(
          {
            // The ProductionOrder.materials[] entry this line fulfils.
            materialLineId: { type: mongoose.Schema.Types.ObjectId, required: true },
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
            productName: { type: String, trim: true },
            unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
            quantity: { type: Number, required: true, min: 0 },
            // Quantity credited against the material requirement — differs from `quantity`
            // only when an alternative with a ratio other than 1 was issued.
            creditedQuantity: { type: Number, required: true, min: 0 },
            isAlternative: { type: Boolean, default: false },
            unitCost: { type: Number, default: 0 },
            totalCost: { type: Number, default: 0 },
            balanceAfter: { type: Number },
            batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
            batchNumber: { type: String, trim: true },
            imeiIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Imei' }], default: undefined },
            serialNumbers: { type: [String], default: undefined },
            wipLotId: { type: mongoose.Schema.Types.ObjectId },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    totalCost: { type: Number, default: 0 },
    // Material Issue Voucher (MIV) header — set when issued through the voucher screen;
    // older issues fall back to the order's own locations.
    sourceLocation: { type: String, trim: true, default: '' },
    wipLocation: { type: String, trim: true, default: '' },
    reference: { type: String, trim: true, default: '' },
    requestedBy: { userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: { type: String, trim: true } },
    issuedBy: { userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: { type: String, trim: true } },
    // Warnings a permitted user chose to override when posting (audit trail).
    overrides: {
      type: [
        new mongoose.Schema(
          {
            line: Number,
            code: { type: String, trim: true },
            message: { type: String, trim: true },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    notes: { type: String, trim: true, default: '' },
    // A posted voucher is never erased: cancelling reverses its stock (contra ledger rows,
    // refType 'MaterialIssueReversal') and keeps it here, marked, for the audit trail.
    status: { type: String, enum: ['posted', 'cancelled'], default: 'posted', index: true },
    cancelledAt: { type: Date },
    cancelledBy: { userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: { type: String, trim: true } },
    cancelReason: { type: String, trim: true },
    // Bumped on every edit; an edit or cancel must name the revision it was made from.
    revision: { type: Number, default: 0 },
    editHistory: {
      type: [
        new mongoose.Schema(
          {
            at: { type: Date, default: Date.now },
            by: { userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: { type: String, trim: true } },
            // 'header' = date/people/reference/notes only; 'lines' = stock re-posted.
            kind: { type: String, enum: ['header', 'lines'] },
            summary: { type: String, trim: true },
            note: { type: String, trim: true },
            previousTotal: Number,
            newTotal: Number,
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Created by the manufacturing demo-data seeder (services/manufacturing/demoData.service.js).
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

MaterialIssueSchema.plugin(toJSON);
MaterialIssueSchema.plugin(paginate);

MaterialIssueSchema.index({ organizationId: 1, issueNumber: 1 }, { unique: true });
MaterialIssueSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });

const MaterialIssue = mongoose.model('MaterialIssue', MaterialIssueSchema);

module.exports = MaterialIssue;
