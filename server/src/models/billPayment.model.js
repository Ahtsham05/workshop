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
    actualBillAmount: {
      type: Number,
      min: 0,
    },
    // Cashier's estimate of what the utility will actually charge once this bill is
    // settled late (e.g. the company already quoted a higher figure over the phone,
    // or bundled it into next month's bill). Entered while still pending/overdue, so
    // Mark-as-Paid can default `actualBillAmount` to it instead of the cashier
    // re-typing/guessing weeks later.
    expectedLateAmount: {
      type: Number,
      min: 0,
    },
    latePaymentLoss: {
      type: Number,
      min: 0,
      default: 0,
    },
    netBillProfit: {
      type: Number,
      default: 0,
    },
    paidAfterDueDate: {
      type: Boolean,
      default: false,
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
      // 'jazzcash'/'easypaisa' kept for backward compatibility with existing records;
      // new records use 'wallet' + walletType to reference an actual created wallet.
      enum: ['cash', 'bank', 'wallet', 'jazzcash', 'easypaisa'],
      required: true,
      default: 'cash',
    },
    // Wallet name when paymentMethod === 'wallet'
    walletType: {
      type: String,
      trim: true,
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
    keepTimestampsInJSON: true,
  }
);

billPaymentSchema.plugin(toJSON);
billPaymentSchema.plugin(paginate);

billPaymentSchema.index({ organizationId: 1, branchId: 1, status: 1, dueDate: 1 });
billPaymentSchema.index({ organizationId: 1, branchId: 1, billType: 1, paymentDate: -1 });
billPaymentSchema.index({ referenceNumber: 1 });

const BillPayment = mongoose.model('BillPayment', billPaymentSchema);

module.exports = BillPayment;
