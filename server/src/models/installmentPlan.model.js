const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const installmentPlanSchema = new mongoose.Schema(
  {
    organizationId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    planNumber:         { type: String, trim: true, index: true },
    customerName:       { type: String, required: true, trim: true },
    customerPhone:      { type: String, trim: true },
    customerCNIC:       { type: String, trim: true },
    customerAddress:    { type: String, trim: true },
    guarantorName:      { type: String, trim: true },
    guarantorPhone:     { type: String, trim: true },
    productId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true },
    quantity:           { type: Number, min: 1, default: 1 },
    itemDescription:    { type: String, required: true, trim: true },
    totalAmount:        { type: Number, required: true, min: 0 },
    downPayment:        { type: Number, default: 0, min: 0 },
    remainingAmount:    { type: Number, required: true, min: 0 },
    totalInstallments:  { type: Number, required: true, min: 1 },
    installmentFrequency:{ type: String, enum: ['weekly', 'biweekly', 'monthly'], default: 'monthly' },
    installmentAmount:  { type: Number, required: true, min: 0 },
    paidInstallments:   { type: Number, default: 0, min: 0 },
    totalPaid:          { type: Number, default: 0, min: 0 },
    totalOutstanding:   { type: Number, required: true, min: 0 },
    nextDueDate:        { type: Date },
    startDate:          { type: Date, default: Date.now },
    status:             { type: String, enum: ['active', 'completed', 'defaulted', 'cancelled'], default: 'active', index: true },
    notes:              { type: String, trim: true },
    createdBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

installmentPlanSchema.plugin(toJSON);
installmentPlanSchema.plugin(paginate);
installmentPlanSchema.index({ organizationId: 1, branchId: 1, status: 1, nextDueDate: 1 });
installmentPlanSchema.index({ organizationId: 1, branchId: 1, customerPhone: 1 });

const InstallmentPlan = mongoose.model('InstallmentPlan', installmentPlanSchema);
module.exports = InstallmentPlan;
