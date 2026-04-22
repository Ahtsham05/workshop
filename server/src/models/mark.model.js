const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const markSchema = mongoose.Schema(
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
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
      required: true,
    },
    obtainedMarks: {
      type: Number,
      required: true,
      min: 0,
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 0,
    },
    isAbsent: {
      type: Boolean,
      default: false,
    },
    percentage: {
      type: Number,
      default: 0,
    },
    grade: {
      type: String,
      enum: ['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'AB', ''],
      default: '',
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

markSchema.plugin(toJSON);
markSchema.plugin(paginate);

// Auto-calculate percentage & grade before save
markSchema.pre('save', function (next) {
  if (this.isAbsent) {
    this.grade = 'AB';
    this.percentage = 0;
  } else if (this.totalMarks > 0) {
    this.percentage = Math.round((this.obtainedMarks / this.totalMarks) * 100);
    if (this.percentage >= 90) this.grade = 'A+';
    else if (this.percentage >= 80) this.grade = 'A';
    else if (this.percentage >= 70) this.grade = 'B';
    else if (this.percentage >= 60) this.grade = 'C';
    else if (this.percentage >= 50) this.grade = 'D';
    else if (this.percentage >= 33) this.grade = 'E';
    else this.grade = 'F';
  }
  next();
});

markSchema.index({ organizationId: 1, branchId: 1, examId: 1, studentId: 1, subjectId: 1 }, { unique: true });
markSchema.index({ organizationId: 1, branchId: 1, examId: 1, classId: 1 });

const Mark = mongoose.model('Mark', markSchema);

module.exports = Mark;
