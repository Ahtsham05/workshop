const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

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
  email: { type: String },
  phone: { type: String },
  whatsapp: { type: String },
  address: { type: String },
  balance: { type: Number, default: 0 },
}, {
  timestamps: true,
});

CustomerSchema.index({ organizationId: 1, branchId: 1 });

// Add plugin that converts mongoose to json
CustomerSchema.plugin(toJSON);
CustomerSchema.plugin(paginate);

const Customer = mongoose.model('Customer', CustomerSchema);

module.exports = Customer;
