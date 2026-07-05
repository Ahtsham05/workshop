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
  email: { type: String },
  phone: { type: String },
  whatsapp: { type: String },
  address: { type: String },
  balance: { type: Number, default: 0 },
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
