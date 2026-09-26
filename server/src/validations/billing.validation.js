const { z } = require('zod');
const { MANUAL_PAYMENT_METHODS, MANUAL_BILLING_MONTHS, ALL_MODULES } = require('../config/billing');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');
const planKey = z.string().trim().toLowerCase().min(1).max(40);
const months = z.coerce
  .number()
  .int()
  .refine((m) => MANUAL_BILLING_MONTHS.includes(m), { message: `must be one of ${MANUAL_BILLING_MONTHS.join(', ')}` });
const limit = z.coerce.number().int().min(-1).max(1e7);

const planOnly = { body: z.object({ planKey }).strict() };

const createIntent = { body: z.object({ planKey, months }).strict() };

// Multipart form fields arrive as strings — coerce.
const submitManualPayment = {
  body: z.object({
    reference: z
      .string()
      .trim()
      .regex(/^LXP-\d{4}-[A-Z2-9]{5}$/, 'is not a valid payment reference'),
    method: z.enum(MANUAL_PAYMENT_METHODS),
    transactionId: z
      .string()
      .trim()
      .min(4, 'looks too short')
      .max(64)
      .regex(/^[A-Za-z0-9\-_/ .]+$/, 'may only contain letters, digits and - _ / .'),
    payerName: z.string().trim().min(2).max(100),
    paidAmountPkr: z.coerce.number().positive().max(10000000),
    paidOn: z.coerce
      .date()
      .refine((d) => d.getTime() <= Date.now() + 24 * 3600 * 1000, { message: 'cannot be in the future' })
      .refine((d) => d.getTime() >= Date.now() - 60 * 24 * 3600 * 1000, { message: 'is more than 60 days ago' }),
  }),
};

const pageQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

const listMyPayments = { query: z.object(pageQuery) };

const adminListManualPayments = {
  query: z.object({
    ...pageQuery,
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    method: z.enum(MANUAL_PAYMENT_METHODS).optional(),
    search: z.string().trim().max(100).optional(),
  }),
};

const paymentIdParam = { params: z.object({ paymentId: objectId }) };

const adminReject = {
  ...paymentIdParam,
  body: z.object({ reason: z.string().trim().min(5, 'please give the customer a clear reason').max(500) }).strict(),
};

const walletDetails = z
  .object({ accountTitle: z.string().trim().max(100), accountNumber: z.string().trim().max(40) })
  .partial();

const adminUpdateSettings = {
  body: z
    .object({
      pkrPerUsd: z.coerce.number().min(1).max(10000),
      graceDays: z.coerce.number().int().min(0).max(60),
      reminderDays: z.array(z.coerce.number().int().min(1).max(60)).max(5),
      intentTtlHours: z.coerce
        .number()
        .int()
        .min(1)
        .max(24 * 30),
      bank: z
        .object({
          bankName: z.string().trim().max(100),
          accountTitle: z.string().trim().max(100),
          accountNumber: z.string().trim().max(40),
          iban: z.string().trim().max(40),
          branch: z.string().trim().max(100),
        })
        .partial(),
      jazzcash: walletDetails,
      easypaisa: walletDetails,
    })
    .partial()
    .strict(),
};

const adminUpdatePlan = {
  params: z.object({ key: planKey }),
  body: z
    .object({
      name: z.string().trim().min(1).max(60),
      description: z.string().trim().max(300),
      badge: z.string().trim().max(30).nullable(),
      priceUsdMonthly: z.coerce.number().min(0).max(10000),
      limits: z.object({ maxUsers: limit, maxInvoicesPerMonth: limit, maxBranches: limit }).partial(),
      modules: z.array(z.enum(ALL_MODULES)),
      polar: z
        .object({
          sandboxProductId: z.string().trim().max(100).nullable(),
          productionProductId: z.string().trim().max(100).nullable(),
        })
        .partial(),
      isPublic: z.boolean(),
      isActive: z.boolean(),
      sortOrder: z.coerce.number().int(),
    })
    .partial()
    .strict(),
};

const adminOverrideSubscription = {
  params: z.object({ orgId: objectId }),
  body: z
    .object({
      planType: planKey,
      status: z.enum(['trialing', 'active', 'gracePeriod', 'canceled', 'expired']),
      currentPeriodEnd: z.coerce.date().nullable(),
      note: z.string().trim().min(3).max(300),
    })
    .partial({ planType: true, status: true, currentPeriodEnd: true })
    .strict(),
};

const adminAudit = { query: z.object({ ...pageQuery, organizationId: objectId.optional() }) };

module.exports = {
  planOnly,
  createIntent,
  submitManualPayment,
  listMyPayments,
  adminListManualPayments,
  paymentIdParam,
  adminReject,
  adminUpdateSettings,
  adminUpdatePlan,
  adminOverrideSubscription,
  adminAudit,
};
