const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const SupplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: false, required: false },
  phone: { type: String },
  whatsapp: { type: String },
  address: { type: String },
}, {
  timestamps: true,
});

// Add plugin that converts mongoose to json
SupplierSchema.plugin(toJSON);
SupplierSchema.plugin(paginate);

const Supplier = mongoose.model('Supplier', SupplierSchema);

module.exports = Supplier;
