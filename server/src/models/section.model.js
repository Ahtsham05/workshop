const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const sectionSchema = mongoose.Schema(
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
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
      required: true,
    },
    capacity: {
      type: Number,
      default: 40,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

sectionSchema.plugin(toJSON);
sectionSchema.plugin(paginate);

sectionSchema.index({ organizationId: 1, branchId: 1, classId: 1, name: 1 }, { unique: true });

const Section = mongoose.model('Section', sectionSchema);

module.exports = Section;
