const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Append-only trail of every billing decision: manual approvals/rejections, plan changes,
 * status transitions (grace, read-only), webhook-driven updates and settings edits.
 * Kept separate from AuditLog because many actors here are not org users (a platform admin,
 * Polar, the scheduler) and AuditLog's action enum is shaped around business records.
 */
const billingAuditSchema = mongoose.Schema(
  {
    organizationId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Organization', default: null, index: true },
    actorType: { type: String, enum: ['user', 'admin', 'polar', 'system'], required: true },
    actorId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', default: null },
    actorLabel: { type: String, trim: true, default: null },
    action: {
      type: String,
      required: true,
      enum: [
        'manual_payment.submitted',
        'manual_payment.approved',
        'manual_payment.rejected',
        'plan.changed',
        'plan.downgrade_scheduled',
        'plan.downgrade_canceled',
        'plan.downgrade_applied',
        'status.changed',
        'polar.checkout_created',
        'polar.subscription_synced',
        'polar.order_paid',
        'reminder.sent',
        'settings.updated',
        'plan_config.updated',
        'subscription.admin_override',
      ],
      index: true,
    },
    from: { type: mongoose.Schema.Types.Mixed, default: null },
    to: { type: mongoose.Schema.Types.Mixed, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

billingAuditSchema.index({ organizationId: 1, createdAt: -1 });

billingAuditSchema.plugin(toJSON);
billingAuditSchema.plugin(paginate);

const BillingAudit = mongoose.model('BillingAudit', billingAuditSchema);

module.exports = BillingAudit;
