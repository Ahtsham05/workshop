const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const billPaymentSchema = new mongoose.Schema(
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
      required: false,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    billType: {
      type: String,
      enum: ['electricity', 'gas', 'water', 'internet', 'other'],
      required: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UtilityCompany',
      required: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    referenceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    billAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    serviceCharge: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalReceived: {
      type: Number,
      required: true,
      min: 0,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    paymentDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue'],
      default: 'pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'jazzcash', 'easypaisa'],
      required: true,
      default: 'cash',
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

billPaymentSchema.plugin(toJSON);
billPaymentSchema.plugin(paginate);

billPaymentSchema.index({ organizationId: 1, branchId: 1, status: 1, dueDate: 1 });
billPaymentSchema.index({ organizationId: 1, branchId: 1, billType: 1, paymentDate: -1 });
billPaymentSchema.index({ referenceNumber: 1 });

const BillPayment = mongoose.model('BillPayment', billPaymentSchema);

module.exports = BillPayment;
