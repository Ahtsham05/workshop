const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const membershipSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
    },
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
    role: {
      type: String,
      enum: ['superAdmin', 'branchAdmin', 'staff'],
      default: 'staff',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// A user can only have one membership per branch
membershipSchema.index({ userId: 1, branchId: 1 }, { unique: true });

membershipSchema.plugin(toJSON);
membershipSchema.plugin(paginate);

/**
 * @typedef Membership
 */
const Membership = mongoose.model('Membership', membershipSchema);

module.exports = Membership;
