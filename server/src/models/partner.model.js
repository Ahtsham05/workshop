const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

/**
 * A business partner or product investor — an external stakeholder entitled to a share of
 * profit, not a system User (unlike a salesman). `partnerType` is purely descriptive/display
 * (which tab it shows under, how it's labeled) — actual profit-share behavior is driven
 * entirely by that partner's PartnerProfitShareRule(s), not by this field.
 */
const partnerSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    // null = partner spans the whole organization rather than one branch.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    name: { type: String, required: true, trim: true },
    partnerType: {
      type: String,
      enum: ['business_partner', 'product_investor'],
      default: 'business_partner',
    },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    cnic: { type: String, trim: true },
    address: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

partnerSchema.index({ organizationId: 1, branchId: 1, isActive: 1 });
partnerSchema.index({ organizationId: 1, name: 1 });

partnerSchema.plugin(toJSON);
partnerSchema.plugin(paginate);

const Partner = mongoose.model('Partner', partnerSchema);

module.exports = Partner;
