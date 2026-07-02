const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

const agentBillSchema = new mongoose.Schema(
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
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'UtilityCompany' },
    companyName: { type: String, trim: true },
    dueDate: { type: Date },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank', 'wallet'],
      default: 'cash',
    },
    walletType: { type: String, trim: true },
    customerName: { type: String, required: true, trim: true },
    referenceNumber: { type: String, required: true, trim: true },
    mobileNo: { type: String, trim: true },
    currentBillAmount: { type: Number, default: 0, min: 0 },
    previousBillAmount: { type: Number, default: 0, min: 0 },
    overdueAmount: { type: Number, default: 0, min: 0 },
    profit: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    isPaid: { type: Boolean, default: false, index: true },
    paidDate: { type: Date, default: null },
    overdueCharged: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

agentBillSchema.plugin(toJSON);
agentBillSchema.plugin(paginate);

agentBillSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });

const AgentBill = mongoose.model('AgentBill', agentBillSchema);
module.exports = AgentBill;
