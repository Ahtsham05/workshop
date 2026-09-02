const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

// A recorded, auditable tax exemption for a customer — deliberately NOT a bare
// `taxExempt: true` boolean (see CLAUDE.md spec section 15): it carries the reason,
// certificate reference, and effective window so exemptions have a real audit trail.
// Customer.taxExempt (a quick boolean flag) is the fast-path check used at calculation
// time; this collection is the detail/history behind it.
const TaxExemptionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    // null = fully exempt from all tax categories; set = exempt only from this category.
    taxCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxCategory',
      default: null,
    },
    exemptionType: { type: String, trim: true }, // e.g. "Resale", "Non-profit", "Diplomatic"
    certificateNumber: { type: String, trim: true },
    certificateDocument: {
      url: { type: String },
      publicId: { type: String },
    },
    reason: { type: String, trim: true },
    validFrom: { type: Date, default: Date.now },
    validTo: { type: Date, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

TaxExemptionSchema.plugin(toJSON);
TaxExemptionSchema.plugin(paginate);

TaxExemptionSchema.index({ organizationId: 1, customerId: 1 });
TaxExemptionSchema.index({ organizationId: 1, customerId: 1, taxCategoryId: 1 });

const TaxExemption = mongoose.model('TaxExemption', TaxExemptionSchema);

module.exports = TaxExemption;
