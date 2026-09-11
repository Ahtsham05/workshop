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
  // Marks records created by the trial-account demo-data seeder (see
  // demoData.service.js) so they can be told apart from real data and cleared via the
  // self-service "Reset Demo Data" action without touching anything the user added.
  isDemo: { type: Boolean, default: false, index: true },
  name: { type: String, required: true, trim: true },
  nameUrdu: { type: String, trim: true },
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
  // Structured address for tax-jurisdiction resolution, added alongside the pre-existing
  // free-text `address` above rather than replacing it, same pattern as customer.model.js.
  billingAddress: {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    countryCode: { type: String, trim: true, uppercase: true },
  },
  // Supplier had no tax registration field at all until now (Customer already has one) —
  // needed so purchase input-tax can display/validate a supplier's registration number.
  taxNumber: { type: String, trim: true },
  // ISO currency code override for this supplier; null = organization's baseCurrency.
  preferredCurrency: { type: String, trim: true, uppercase: true, default: null },
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
  // Shadow Customer record so this supplier can also be billed through the
  // normal sale flows (Invoice/Load/Sim-Sale/Service) — see customer.model.js
  // isSupplierAccount. Unpaid balances are mirrored into this supplier's own
  // ledger as a debit note (see supplierLedger.service.js syncPurchaseFromCustomerSale).
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
  },
  // Whether this supplier shows up as selectable across the app (Purchase supplier
  // picker, etc). Defaults true; deactivating hides it from those pickers without
  // deleting the record or its ledger history — see supplier.service.js's
  // ACTIVE_ONLY_FILTER on getAllSuppliers. The Suppliers admin list itself still shows
  // deactivated suppliers, with their own Active/Inactive toggle.
  isActive: { type: Boolean, default: true, index: true },
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
