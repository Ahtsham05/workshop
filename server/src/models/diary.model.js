const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/** One subject line in a day's diary (classwork + homework). */
const diaryItemSchema = mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
    },
    subjectName: {
      type: String,
      trim: true,
    },
    classwork: {
      type: String,
      trim: true,
      default: '',
    },
    homework: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: true }
);

const diarySchema = mongoose.Schema(
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
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
      required: true,
    },
    // Optional — when set the diary targets a single section; otherwise the
    // whole class sees it.
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      default: null,
    },
    date: {
      type: Date,
      required: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    items: {
      type: [diaryItemSchema],
      default: [],
    },
    // General note / announcement for the day (optional).
    note: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

diarySchema.plugin(toJSON);
diarySchema.plugin(paginate);

diarySchema.index({ organizationId: 1, branchId: 1, classId: 1, date: -1 });
diarySchema.index({ organizationId: 1, branchId: 1, sectionId: 1, date: -1 });

const Diary = mongoose.model('Diary', diarySchema);

module.exports = Diary;
