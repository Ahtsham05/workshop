const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const syncVersionPlugin = require('./plugins/syncVersion.plugin');

const CustomerSchema = new mongoose.Schema({
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
  email: { type: String },
  phone: { type: String },
  whatsapp: { type: String },
  address: { type: String },
  // Structured address for tax-jurisdiction resolution, added alongside the pre-existing
  // free-text `address` above rather than replacing it (that field stays the display/search
  // value used everywhere today — see invoice/print templates).
  billingAddress: {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    countryCode: { type: String, trim: true, uppercase: true },
  },
  // Quick fast-path flag checked at tax-calculation time. The audit trail (reason,
  // certificate, effective dates) lives on TaxExemption records, not here — see
  // taxExemption.model.js.
  taxExempt: { type: Boolean, default: false },
  // ISO currency code override for this customer; null = organization's baseCurrency.
  preferredCurrency: { type: String, trim: true, uppercase: true, default: null },
  balance: { type: Number, default: 0 },
  customerType: {
    type: String,
    enum: ['retail', 'wholesale', 'vip', 'corporate'],
  },
  creditLimit: { type: Number, default: 0 },
  paymentTerms: {
    type: String,
    enum: ['cash', 'due_on_receipt', 'net_15', 'net_30', 'net_60'],
  },
  taxNumber: { type: String, trim: true },
  notes: { type: String, trim: true },
  // Auto-created subsidiary account under Accounts Receivable (double-entry).
  accountHeadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AccountHead',
  },
  // Shadow customer record auto-provisioned for an Employee so staff can be
  // billed through the normal Invoice flow. Hidden from the Customers list by
  // default; unpaid purchases are mirrored into that employee's ledger.
  isEmployeeAccount: {
    type: Boolean,
    default: false,
  },
  linkedEmployeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    index: true,
    sparse: true,
  },
  // Shadow customer record auto-provisioned for a Supplier so a supplier can
  // also be billed as a customer (sold products/services) through the normal
  // Invoice/Load/Sim-Sale/Service flows. Hidden from the Customers list by
  // default; unpaid purchases are mirrored into that supplier's ledger as a
  // debit note, netting against what the business owes them.
  isSupplierAccount: {
    type: Boolean,
    default: false,
  },
  linkedSupplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    index: true,
    sparse: true,
  },
  // Whether this customer shows up as billable/selectable across the app (Invoice
  // customer picker, POS, etc). Defaults true; deactivating hides it from those pickers
  // without deleting the record or its ledger history — see customer.service.js's
  // ACTIVE_ONLY_FILTER on getAllCustomers. The Customers admin list itself still shows
  // deactivated customers, with their own Active/Inactive toggle.
  isActive: { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
});

CustomerSchema.index({ organizationId: 1, branchId: 1 });

// Add plugin that converts mongoose to json
CustomerSchema.plugin(syncVersionPlugin);
CustomerSchema.plugin(toJSON);
CustomerSchema.plugin(paginate);

const Customer = mongoose.model('Customer', CustomerSchema);

module.exports = Customer;
