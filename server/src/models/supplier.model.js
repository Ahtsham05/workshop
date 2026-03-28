const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

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
  email: { type: String, unique: false, required: false },
  phone: { type: String },
  whatsapp: { type: String },
  address: { type: String },
  balance: { type: Number, default: 0 },
}, {
  timestamps: true,
});

SupplierSchema.index({ organizationId: 1, branchId: 1 });

// Add plugin that converts mongoose to json
SupplierSchema.plugin(toJSON);
SupplierSchema.plugin(paginate);

const Supplier = mongoose.model('Supplier', SupplierSchema);

module.exports = Supplier;
