const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const examSchema = mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['monthly', 'midterm', 'final', 'unit_test', 'assignment', 'other'],
      default: 'monthly',
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
      required: true,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    examFeeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    feeDueDate: {
      type: Date,
    },
    totalMarks: {
      type: Number,
      default: 0,
    },
    passingMarks: {
      type: Number,
      default: 0,
    },
    // Per-subject marks configuration — if present, each subject has its own
    // totalMarks and passingMarks.  totalMarks on the exam is auto-computed
    // as the sum of all subject totalMarks via a pre-save hook.
    subjects: [
      {
        subjectId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Subject',
          required: true,
        },
        totalMarks: { type: Number, required: true, min: 1 },
        passingMarks: { type: Number, required: true, min: 0 },
      },
    ],
    status: {
      type: String,
      enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
      default: 'upcoming',
    },
    description: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

examSchema.plugin(toJSON);
examSchema.plugin(paginate);

// If subjects are defined, derive exam-level totalMarks and passingMarks from them
examSchema.pre('save', function (next) {
  if (this.subjects && this.subjects.length > 0) {
    this.totalMarks = this.subjects.reduce((s, sub) => s + (sub.totalMarks || 0), 0);
    this.passingMarks = this.subjects.reduce((s, sub) => s + (sub.passingMarks || 0), 0);
  }
  next();
});

examSchema.index({ organizationId: 1, branchId: 1, classId: 1 });
examSchema.index({ organizationId: 1, branchId: 1, status: 1, startDate: -1 });

const Exam = mongoose.model('Exam', examSchema);

module.exports = Exam;
