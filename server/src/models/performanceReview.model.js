const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const performanceReviewSchema = mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewPeriod: {
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
    },
    reviewType: {
      type: String,
      enum: ['Quarterly', 'Half-Yearly', 'Annual', 'Probation'],
      default: 'Annual',
    },
    ratings: {
      workQuality: { type: Number, min: 1, max: 5, default: 3 },
      productivity: { type: Number, min: 1, max: 5, default: 3 },
      communication: { type: Number, min: 1, max: 5, default: 3 },
      teamwork: { type: Number, min: 1, max: 5, default: 3 },
      punctuality: { type: Number, min: 1, max: 5, default: 3 },
      initiative: { type: Number, min: 1, max: 5, default: 3 },
      leadership: { type: Number, min: 1, max: 5, default: 3 },
      problemSolving: { type: Number, min: 1, max: 5, default: 3 },
    },
    overallRating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    strengths: {
      type: String,
      trim: true,
    },
    weaknesses: {
      type: String,
      trim: true,
    },
    achievements: {
      type: String,
      trim: true,
    },
    areasOfImprovement: {
      type: String,
      trim: true,
    },
    goals: [
      {
        description: String,
        deadline: Date,
        status: {
          type: String,
          enum: ['Not Started', 'In Progress', 'Completed', 'Delayed'],
          default: 'Not Started',
        },
      },
    ],
    comments: {
      type: String,
      trim: true,
    },
    employeeComments: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Draft', 'Submitted', 'Reviewed', 'Acknowledged'],
      default: 'Draft',
    },
    submittedDate: {
      type: Date,
    },
    acknowledgedDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

performanceReviewSchema.plugin(toJSON);
performanceReviewSchema.plugin(paginate);

// Index for better query performance
performanceReviewSchema.index({ employee: 1, reviewPeriod: 1 });

const PerformanceReview = mongoose.model('PerformanceReview', performanceReviewSchema);

module.exports = PerformanceReview;
