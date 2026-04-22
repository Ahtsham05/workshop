const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const schoolFeeSchema = mongoose.Schema(
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
      required: true,
    },
    feeType: {
      type: String,
      enum: ['tuition', 'admission', 'transport', 'exam', 'library', 'sports', 'lab', 'hostel', 'misc', 'monthly'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    fine: {
      type: Number,
      default: 0,
      min: 0,
    },
    netAmount: {
      type: Number,
      min: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    dueDate: {
      type: Date,
    },
    paidDate: {
      type: Date,
    },
    month: {
      type: String,
      trim: true,
    },
    year: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['pending', 'partial', 'paid', 'overdue', 'waived'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'cheque', 'online', ''],
    },
    voucherNo: {
      type: String,
      trim: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

schoolFeeSchema.plugin(toJSON);
schoolFeeSchema.plugin(paginate);

schoolFeeSchema.pre('save', function (next) {
  this.netAmount = this.amount - this.discount + this.fine;
  next();
});

schoolFeeSchema.index({ organizationId: 1, branchId: 1, studentId: 1 });
schoolFeeSchema.index({ organizationId: 1, branchId: 1, status: 1 });
schoolFeeSchema.index({ organizationId: 1, branchId: 1, dueDate: 1, status: 1 });
schoolFeeSchema.index({ organizationId: 1, branchId: 1, month: 1, year: 1, status: 1 });

const SchoolFee = mongoose.model('SchoolFee', schoolFeeSchema);

module.exports = SchoolFee;
