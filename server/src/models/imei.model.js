const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const imeiSchema = new mongoose.Schema(
  {
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
    imei: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    imei2: {
      type: String,
      trim: true,
      default: '',
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      index: true,
    },
    productName: {
      type: String,
      trim: true,
      default: '',
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      default: null,
      index: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
      index: true,
    },
    brand: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    model: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    color: {
      type: String,
      trim: true,
      default: '',
    },
    storage: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['in_stock', 'sold', 'returned', 'scrapped'],
      default: 'in_stock',
      index: true,
    },
    purchasePrice: {
      type: Number,
      default: 0,
    },
    salePrice: {
      type: Number,
      default: 0,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
    },
    supplierName: {
      type: String,
      trim: true,
      default: '',
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    customerName: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    customerPhone: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    customerCNIC: {
      type: String,
      trim: true,
      default: '',
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    saleDate: {
      type: Date,
      default: null,
    },
    purchaseInvoiceRef: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

imeiSchema.plugin(toJSON);
imeiSchema.plugin(paginate);

module.exports = mongoose.model('Imei', imeiSchema);
