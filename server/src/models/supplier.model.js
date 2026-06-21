const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const syncVersionPlugin = require('./plugins/syncVersion.plugin');

const SupplierSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  name: { type: String, required: true },
  nameUrdu: { type: String },
  picture: {
    url: { type: String },
    publicId: { type: String },
  },
  idCardFront: {
    url: { type: String },
    publicId: { type: String },
  },
  idCardBack: {
    url: { type: String },
    publicId: { type: String },
  },
  email: { type: String, unique: false, required: false },
  phone: { type: String },
  whatsapp: { type: String },
  address: { type: String },
  balance: { type: Number, default: 0 },
  // Auto-created subsidiary account under Accounts Payable (double-entry).
  accountHeadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AccountHead',
  },
  /**
   * Cached performance metrics refreshed weekly by jobs/supplierScoringScheduler.js
   * (see services/supplierScoring.service.js for the live computation). Cached here so
   * supplier list/detail views don't need to re-run aggregations on every request.
   */
  performance: {
    avgLeadTimeDays: { type: Number, default: null },
    onTimeDeliveryRate: { type: Number, default: null }, // 0-1
    cancellationRate: { type: Number, default: null }, // 0-1
    returnRate: { type: Number, default: null }, // 0-1
    ordersCount: { type: Number, default: 0 },
    overallScore: { type: Number, default: null }, // 0-100, weighted composite (see supplierScoring.service.js)
    lastScoredAt: { type: Date, default: null },
  },
}, {
  timestamps: true,
});

SupplierSchema.index({ organizationId: 1, branchId: 1 });

// Add plugin that converts mongoose to json
SupplierSchema.plugin(syncVersionPlugin);
SupplierSchema.plugin(toJSON);
SupplierSchema.plugin(paginate);

const Supplier = mongoose.model('Supplier', SupplierSchema);

module.exports = Supplier;
