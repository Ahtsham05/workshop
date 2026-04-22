const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * TimeSlot Model
 *
 * Defines the org-wide period schedule (e.g. "Period 1: 08:00–08:45").
 * All timetable entries reference a timeSlotId instead of raw start/end times,
 * which enables:
 *  - Cross-class conflict detection via a single indexed query
 *  - Auto-generation knowing which slots are available
 *  - Consistent display across the entire school
 */
const timeSlotSchema = mongoose.Schema(
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
    // Display order / period number (1, 2, 3…)
    slotNumber: {
      type: Number,
      required: true,
    },
    // Human-friendly label — e.g. "Period 1", "Lunch Break"
    label: {
      type: String,
      trim: true,
    },
    // "HH:MM" 24-hour format
    startTime: {
      type: String,
      required: true,
      trim: true,
    },
    endTime: {
      type: String,
      required: true,
      trim: true,
    },
    // Governs auto-generation: only 'class'/'lab' slots get subject assignments
    type: {
      type: String,
      enum: ['class', 'lab', 'break', 'lunch', 'assembly', 'sports', 'other'],
      default: 'class',
    },
    // Days this slot is active (empty = applies to all days)
    applicableDays: {
      type: [String],
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

timeSlotSchema.plugin(toJSON);
timeSlotSchema.plugin(paginate);

// Unique: one slot number per org/branch
timeSlotSchema.index(
  { organizationId: 1, branchId: 1, slotNumber: 1 },
  { unique: true }
);

// Fast list fetch ordered by slot number
timeSlotSchema.index({ organizationId: 1, branchId: 1, isActive: 1, slotNumber: 1 });

const TimeSlot = mongoose.model('TimeSlot', timeSlotSchema);

module.exports = TimeSlot;
