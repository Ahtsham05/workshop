const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const teacherAssignmentSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Organization',
      required: true,
    },
    branchId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Branch',
      required: true,
    },
    teacherId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Teacher',
      required: true,
    },
    classId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'SchoolClass',
      required: true,
    },
    sectionId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Section',
      required: true,
    },
    subjectId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Subject',
      default: null,
    },
    isClassTeacher: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

teacherAssignmentSchema.plugin(toJSON);
teacherAssignmentSchema.plugin(paginate);

// Performance indexes
teacherAssignmentSchema.index({ organizationId: 1, branchId: 1, teacherId: 1 });
teacherAssignmentSchema.index({ organizationId: 1, branchId: 1, classId: 1, sectionId: 1 });

// One teacher per class+section+subject combination
teacherAssignmentSchema.index(
  { organizationId: 1, branchId: 1, teacherId: 1, classId: 1, sectionId: 1, subjectId: 1 },
  { unique: true, sparse: false }
);

const TeacherAssignment = mongoose.model('TeacherAssignment', teacherAssignmentSchema);

module.exports = TeacherAssignment;
