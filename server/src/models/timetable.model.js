const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const timetableSchema = mongoose.Schema(
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
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
      required: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
    },
    day: {
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      required: true,
    },
    periods: [
      {
        periodNo: { type: Number, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        subjectId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Subject',
        },
        teacherId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Teacher',
        },
        // References the org's TimeSlot template (optional — backward compatible)
        timeSlotId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'TimeSlot',
          default: null,
        },
        room: { type: String, trim: true },
        type: {
          type: String,
          enum: ['class', 'lecture', 'lab', 'break', 'lunch', 'assembly', 'sports', 'other'],
          default: 'class',
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

timetableSchema.plugin(toJSON);
timetableSchema.plugin(paginate);

// Existing: fast fetch of a class's full week
timetableSchema.index({ organizationId: 1, branchId: 1, classId: 1, day: 1 });

// NEW: conflict detection — "Is teacher X busy on Monday Period 3 in any class?"
// Used by checkTeacherConflict() — covers teacherId across all timetable docs
timetableSchema.index({ organizationId: 1, branchId: 1, day: 1, 'periods.teacherId': 1 });

// NEW: timeSlotId-based conflict — faster when TimeSlots are configured
timetableSchema.index({ organizationId: 1, branchId: 1, day: 1, 'periods.timeSlotId': 1 });

// NEW: teacher weekly schedule view (aggregate across all classes)
timetableSchema.index({ organizationId: 1, branchId: 1, 'periods.teacherId': 1 });

const Timetable = mongoose.model('Timetable', timetableSchema);

module.exports = Timetable;
