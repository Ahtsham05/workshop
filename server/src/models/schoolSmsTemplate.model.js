const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * A school's own saved SMS wording, on top of the built-in catalogue in
 * config/schoolSmsTemplates.js. Scoped per branch because each campus sends under its own
 * name and gateway SIM.
 */
const schoolSmsTemplateSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization' },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    body: { type: String, required: true, trim: true, maxlength: 1600 },
    category: { type: String, default: 'Custom', trim: true },
    // Which send paths may use it — mirrors the built-ins, because Broadcast cannot resolve
    // the fee voucher placeholders.
    context: { type: String, enum: ['broadcast', 'fee_alert'], default: 'broadcast' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

schoolSmsTemplateSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });

module.exports = mongoose.model('SchoolSmsTemplate', schoolSmsTemplateSchema);
