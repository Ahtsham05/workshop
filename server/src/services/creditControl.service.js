const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Customer, Invoice, Organization, CreditLimitEvent } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Customer credit control — how much a customer may owe, and whether a sale may add to it.
 *
 * Exposure (what the customer owes us right now) =
 *     ledger balance (Customer.balance, kept by customerLedger.service recalculateBalances)
 *   + unpaid part of pending invoices (goods handed over, not billed yet — optional)
 * A sale adds only its UNPAID part (total − paid): a fully paid cash sale is never stopped.
 *
 * Rules, checked when a sale would add credit:
 *   on_hold    — the customer is on credit hold (always blocks, even in warn mode)
 *   over_limit — exposure after the sale would exceed the effective limit
 *   overdue    — an invoice is overdue by more than settings.overdueBlockDays
 * An edit is only checked when it adds credit (new unpaid > old unpaid on the same customer),
 * so trimming an invoice of an over-limit customer is never refused.
 *
 * Effective limit = max(creditLimit, active temporary limit). creditLimit 0 = no limit.
 */

const EPSILON = 0.005;
const DAY_MS = 24 * 60 * 60 * 1000;
const CREDIT_LIMIT_ERROR_CODE = 'CREDIT_LIMIT_EXCEEDED';

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  mode: 'block',
  includePendingInvoices: true,
  overdueBlockDays: 0,
  defaultCreditLimit: 0,
  nearLimitPercent: 80,
});

const PAYMENT_TERM_DAYS = { cash: 0, due_on_receipt: 0, net_15: 15, net_30: 30, net_60: 60 };

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toCustomerIdMatchValues = (id) => {
  const str = String(id).trim();
  return mongoose.Types.ObjectId.isValid(str) ? [str, new mongoose.Types.ObjectId(str)] : [str];
};

const isRegisteredCustomerId = (customerId) =>
  Boolean(customerId) && customerId !== 'walk-in' && mongoose.Types.ObjectId.isValid(String(customerId));

const actorName = (actor) => (actor && (actor.name || actor.email)) || undefined;
const actorId = (actor) => (actor && (actor.id || actor._id)) || undefined;

// ---------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------

const normalizeSettings = (raw = {}) => ({
  enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : DEFAULT_SETTINGS.enabled,
  mode: raw.mode === 'warn' ? 'warn' : 'block',
  includePendingInvoices:
    raw.includePendingInvoices !== undefined ? Boolean(raw.includePendingInvoices) : DEFAULT_SETTINGS.includePendingInvoices,
  overdueBlockDays: Math.max(0, Math.floor(Number(raw.overdueBlockDays) || 0)),
  defaultCreditLimit: Math.max(0, Number(raw.defaultCreditLimit) || 0),
  nearLimitPercent: Math.min(100, Math.max(1, Number(raw.nearLimitPercent) || DEFAULT_SETTINGS.nearLimitPercent)),
});

const getSettings = async (organizationId) => {
  if (!organizationId) return { ...DEFAULT_SETTINGS };
  const org = await Organization.findById(organizationId).select('creditControl').lean();
  return normalizeSettings(org?.creditControl || {});
};

const updateSettings = async (organizationId, body = {}) => {
  const current = await getSettings(organizationId);
  const next = normalizeSettings({ ...current, ...body });
  await Organization.updateOne({ _id: organizationId }, { $set: { creditControl: next } });
  return next;
};

// ---------------------------------------------------------------------------------------
// Limits and exposure
// ---------------------------------------------------------------------------------------

/** The limit that applies right now, folding in a temporary increase while it is active. */
const resolveEffectiveLimit = (customer, now = new Date()) => {
  const baseLimit = Math.max(0, Number(customer?.creditLimit) || 0);
  const temp = customer?.tempCreditLimit || {};
  const tempAmount = Math.max(0, Number(temp.amount) || 0);
  const tempExpiresAt = temp.expiresAt ? new Date(temp.expiresAt) : null;
  const tempActive = tempAmount > 0 && tempExpiresAt && tempExpiresAt.getTime() > now.getTime();
  const limit = tempActive ? Math.max(baseLimit, tempAmount) : baseLimit;
  return {
    baseLimit,
    limit,
    hasLimit: limit > 0,
    temporary: tempActive
      ? { amount: tempAmount, expiresAt: tempExpiresAt, reason: temp.reason || '', setAt: temp.setAt || null }
      : null,
  };
};

/**
 * What an invoice adds to the customer's account: total − paid. A cash sale without a
 * split leg is fully paid at save (Invoice#finalize), quotations never post, cancelled
 * invoices no longer count.
 */
const unpaidOf = (invoice) => {
  if (!invoice) return 0;
  if (invoice.status === 'cancelled' || invoice.type === 'quotation') return 0;
  if (invoice.type === 'pending' && invoice.isConvertedToBill) return 0;
  if (invoice.type === 'cash' && !invoice.splitPaymentMethod) return 0;
  return Math.max(0, round2((Number(invoice.total) || 0) - (Number(invoice.paidAmount) || 0)));
};

/** Unpaid total of the customer's pending (not yet billed) invoices. */
const getPendingExposure = async ({ organizationId, customerId, excludeInvoiceId }) => {
  const match = {
    organizationId: new mongoose.Types.ObjectId(String(organizationId)),
    customerId: { $in: toCustomerIdMatchValues(customerId) },
    type: 'pending',
    isConvertedToBill: { $ne: true },
    status: { $ne: 'cancelled' },
  };
  if (excludeInvoiceId && mongoose.Types.ObjectId.isValid(String(excludeInvoiceId))) {
    match._id = { $ne: new mongoose.Types.ObjectId(String(excludeInvoiceId)) };
  }
  const [row] = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        amount: {
          $sum: { $max: [0, { $subtract: [{ $ifNull: ['$total', 0] }, { $ifNull: ['$paidAmount', 0] }] }] },
        },
        count: { $sum: 1 },
      },
    },
  ]);
  return { amount: round2(row?.amount || 0), count: row?.count || 0 };
};

/**
 * Open invoices past their due date. Due date = invoice.dueDate, else invoice date + the
 * customer's payment terms; an invoice with neither has no due date and is never overdue.
 */
const getOverdueSummary = async ({ organizationId, customer, now = new Date(), blockAfterDays = 0 }) => {
  // Lazy: customerPayment.service requires invoice/ledger services that require this one.
  // eslint-disable-next-line global-require
  const customerPaymentService = require('./customerPayment.service');
  const openInvoices = await customerPaymentService.getOpenInvoicesForCustomer({
    organizationId,
    customer: customer._id,
  });
  const termDays = PAYMENT_TERM_DAYS[customer.paymentTerms];
  const overdue = [];
  for (const invoice of openInvoices) {
    let due = invoice.dueDate ? new Date(invoice.dueDate) : null;
    if (!due && termDays !== undefined && invoice.invoiceDate) {
      due = new Date(new Date(invoice.invoiceDate).getTime() + termDays * DAY_MS);
    }
    if (!due || Number.isNaN(due.getTime())) continue;
    const endOfDue = new Date(due);
    endOfDue.setHours(23, 59, 59, 999);
    if (endOfDue.getTime() >= now.getTime()) continue;
    const daysOverdue = Math.max(1, Math.ceil((now.getTime() - endOfDue.getTime()) / DAY_MS));
    overdue.push({
      invoiceId: invoice._id,
      invoiceNumber: invoice.billNumber || invoice.invoiceNumber,
      dueDate: due,
      remainingAmount: round2(invoice.remainingAmount),
      daysOverdue,
    });
  }
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
  const blocking = blockAfterDays > 0 ? overdue.filter((row) => row.daysOverdue > blockAfterDays) : [];
  return {
    count: overdue.length,
    amount: round2(overdue.reduce((sum, row) => sum + row.remainingAmount, 0)),
    oldestDays: overdue[0]?.daysOverdue || 0,
    blockingCount: blocking.length,
    blockingAmount: round2(blocking.reduce((sum, row) => sum + row.remainingAmount, 0)),
    invoices: overdue.slice(0, 5),
  };
};

const resolveStatus = ({ onHold, hasLimit, exposure, limit, nearLimitPercent }) => {
  if (onHold) return 'hold';
  if (!hasLimit) return 'no_limit';
  if (exposure > limit + EPSILON) return 'over';
  if ((exposure / limit) * 100 >= nearLimitPercent) return 'near';
  return 'ok';
};

const loadCustomer = async (organizationId, customerId) => {
  if (!isRegisteredCustomerId(customerId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Credit control applies to registered customers only');
  }
  const customer = await Customer.findOne({ _id: customerId, organizationId });
  if (!customer) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  return customer;
};

/**
 * Full credit picture for one customer. `excludeInvoiceId` takes an invoice being edited
 * out of the numbers (its old effect is replaced by `saleAmount`, the edited unpaid amount).
 */
const getCreditStatus = async ({
  organizationId,
  customerId,
  customer: preloaded,
  saleAmount = 0,
  excludeInvoiceId,
  settings: preloadedSettings,
  now = new Date(),
}) => {
  const [customer, settings] = await Promise.all([
    preloaded || loadCustomer(organizationId, customerId),
    preloadedSettings || getSettings(organizationId),
  ]);

  // An invoice being edited already sits in the ledger balance (cash/credit) — take its
  // old effect out so it isn't counted twice. Pending invoices are excluded by query.
  let postedContribution = 0;
  if (excludeInvoiceId && mongoose.Types.ObjectId.isValid(String(excludeInvoiceId))) {
    const existing = await Invoice.findById(excludeInvoiceId)
      .select('customerId type status total paidAmount splitPaymentMethod isConvertedToBill')
      .lean();
    if (
      existing &&
      String(existing.customerId) === String(customer._id) &&
      (existing.type === 'cash' || existing.type === 'credit')
    ) {
      postedContribution = unpaidOf(existing);
    }
  }

  const [pending, overdue] = await Promise.all([
    settings.includePendingInvoices
      ? getPendingExposure({ organizationId: customer.organizationId, customerId: customer._id, excludeInvoiceId })
      : Promise.resolve({ amount: 0, count: 0 }),
    getOverdueSummary({
      organizationId: customer.organizationId,
      customer,
      now,
      blockAfterDays: settings.overdueBlockDays,
    }),
  ]);

  const ledgerBalance = round2(Number(customer.balance) || 0);
  const balance = round2(ledgerBalance - postedContribution);
  const exposure = round2(balance + pending.amount);
  const limitInfo = resolveEffectiveLimit(customer, now);
  const sale = round2(Math.max(0, Number(saleAmount) || 0));
  const projectedExposure = round2(exposure + sale);
  const available = limitInfo.hasLimit ? round2(limitInfo.limit - exposure) : null;
  const utilization = limitInfo.hasLimit ? round2((exposure / limitInfo.limit) * 100) : null;

  return {
    customerId: String(customer._id),
    customerName: customer.name,
    enabled: settings.enabled,
    mode: settings.mode,
    nearLimitPercent: settings.nearLimitPercent,
    overdueBlockDays: settings.overdueBlockDays,
    includePendingInvoices: settings.includePendingInvoices,
    baseLimit: limitInfo.baseLimit,
    limit: limitInfo.limit,
    hasLimit: limitInfo.hasLimit,
    temporary: limitInfo.temporary,
    onHold: Boolean(customer.creditHold),
    holdReason: customer.creditHoldReason || '',
    holdAt: customer.creditHoldAt || null,
    paymentTerms: customer.paymentTerms || null,
    balance,
    pendingAmount: pending.amount,
    pendingCount: pending.count,
    exposure,
    available,
    utilization,
    saleAmount: sale,
    projectedExposure,
    projectedAvailable: limitInfo.hasLimit ? round2(limitInfo.limit - projectedExposure) : null,
    excess: limitInfo.hasLimit ? round2(Math.max(0, projectedExposure - limitInfo.limit)) : 0,
    overdue,
    status: resolveStatus({
      onHold: customer.creditHold,
      hasLimit: limitInfo.hasLimit,
      exposure,
      limit: limitInfo.limit,
      nearLimitPercent: settings.nearLimitPercent,
    }),
  };
};

/**
 * Would this sale break a credit rule? `newUnpaid` is what the sale leaves owing,
 * `oldUnpaid` what the same invoice left owing before an edit (0 for a new sale).
 * Returns { allowed, reasons, status } — never throws for a rule break.
 */
const evaluateSale = async ({ organizationId, customerId, newUnpaid, oldUnpaid = 0, excludeInvoiceId, settings: preloaded }) => {
  if (!isRegisteredCustomerId(customerId)) return { allowed: true, reasons: [], status: null };
  const settings = preloaded || (await getSettings(organizationId));
  if (!settings.enabled) return { allowed: true, reasons: [], status: null };

  const unpaid = round2(Math.max(0, Number(newUnpaid) || 0));
  const increase = round2(unpaid - Math.max(0, Number(oldUnpaid) || 0));
  if (unpaid <= EPSILON || increase <= EPSILON) return { allowed: true, reasons: [], status: null };

  const customer = await Customer.findOne({ _id: customerId, organizationId });
  // Unknown customer: invoice validation reports it; nothing to enforce here.
  if (!customer) return { allowed: true, reasons: [], status: null };

  const status = await getCreditStatus({
    organizationId,
    customer,
    saleAmount: unpaid,
    excludeInvoiceId,
    settings,
  });

  const reasons = [];
  if (status.onHold) reasons.push('on_hold');
  if (status.hasLimit && status.projectedExposure > status.limit + EPSILON) reasons.push('over_limit');
  if (settings.overdueBlockDays > 0 && status.overdue.blockingCount > 0) reasons.push('overdue');

  return { allowed: reasons.length === 0, reasons, status, settings };
};

const fmt = (value) => round2(value).toLocaleString('en-US', { maximumFractionDigits: 2 });

const buildBlockMessage = ({ reasons, status, settings }) => {
  const parts = [];
  if (reasons.includes('on_hold')) {
    parts.push(`${status.customerName} is on credit hold${status.holdReason ? ` (${status.holdReason})` : ''}`);
  }
  if (reasons.includes('over_limit')) {
    parts.push(
      `credit limit ${fmt(status.limit)} exceeded — owes ${fmt(status.exposure)}, this sale adds ${fmt(status.saleAmount)} ` +
        `(${fmt(status.excess)} over)`
    );
  }
  if (reasons.includes('overdue')) {
    parts.push(
      `${status.overdue.blockingCount} invoice(s) overdue by more than ${settings.overdueBlockDays} days ` +
        `(${fmt(status.overdue.blockingAmount)})`
    );
  }
  const text = parts.join('; ');
  return `Credit check failed for ${status.customerName}: ${text}. Take payment, or ask a manager to approve or raise the limit.`;
};

/**
 * The gate every credit sale passes. Throws CREDIT_LIMIT_EXCEEDED (422) when the sale must
 * stop; otherwise returns null (nothing to note) or an outcome the caller stamps on the
 * invoice and logs with recordSaleOutcome once the invoice is saved.
 *
 * @param {Object} args
 * @param {'enforce'|'record'|'skip'} [args.creditMode] — record: never block (an offline
 *   sale already happened at the counter), just log it.
 * @param {{reason:string}} [args.override] — the person asked to approve it anyway.
 * @param {boolean} [args.canOverride] — they hold overrideCreditLimit.
 */
const enforceSale = async ({
  organizationId,
  customerId,
  newUnpaid,
  oldUnpaid = 0,
  excludeInvoiceId,
  creditMode = 'enforce',
  override,
  canOverride = false,
  acknowledgeWarning = false,
  actor,
}) => {
  if (creditMode === 'skip') return null;
  const result = await evaluateSale({ organizationId, customerId, newUnpaid, oldUnpaid, excludeInvoiceId });
  if (result.allowed) return null;

  const { reasons, status, settings } = result;
  const snapshot = {
    reasons,
    limit: status.limit,
    exposure: status.projectedExposure,
    excess: status.excess,
    saleAmount: status.saleAmount,
  };

  if (creditMode === 'record') {
    return { kind: 'offline_sale', ...snapshot, actor, reason: 'Offline sale synced after the counter' };
  }

  // Warn mode lets the counter carry on — except a credit hold, which is an explicit stop.
  if (settings.mode === 'warn' && !reasons.includes('on_hold') && acknowledgeWarning) {
    return { kind: 'warning', ...snapshot, actor, reason: 'Sold after the credit warning' };
  }

  const reasonText = override && typeof override.reason === 'string' ? override.reason.trim() : '';
  if (reasonText) {
    if (!canOverride) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to approve sales over the credit limit.');
    }
    return { kind: 'override', ...snapshot, actor, reason: reasonText };
  }

  const error = new ApiError(httpStatus.UNPROCESSABLE_ENTITY, buildBlockMessage(result));
  error.errorCode = CREDIT_LIMIT_ERROR_CODE;
  error.details = { reasons, mode: settings.mode, canOverride: Boolean(canOverride), credit: status };
  throw error;
};

/** The invoice-side stamp for an outcome from enforceSale. */
const toInvoiceStamp = (outcome) =>
  outcome
    ? {
        kind: outcome.kind,
        approvedBy: actorId(outcome.actor),
        approvedByName: actorName(outcome.actor),
        approvedAt: new Date(),
        reason: outcome.reason,
        reasons: outcome.reasons,
        limit: outcome.limit,
        exposure: outcome.exposure,
        excess: outcome.excess,
      }
    : undefined;

/** Logs a sale that went through over credit. Never throws — the sale is already saved. */
const recordSaleOutcome = async (outcome, invoice) => {
  if (!outcome || !invoice) return;
  try {
    await CreditLimitEvent.create({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      customerId: invoice.customerId,
      type: outcome.kind,
      invoiceId: invoice._id,
      invoiceNumber: invoice.billNumber || invoice.invoiceNumber,
      saleAmount: outcome.saleAmount,
      exposure: outcome.exposure,
      excess: outcome.excess,
      newLimit: outcome.limit,
      reasons: outcome.reasons,
      reason: outcome.reason,
      performedBy: actorId(outcome.actor),
      performedByName: actorName(outcome.actor),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to log credit override:', error);
  }
};

// ---------------------------------------------------------------------------------------
// Changing a customer's credit terms
// ---------------------------------------------------------------------------------------

const logEvent = (customer, actor, fields) =>
  CreditLimitEvent.create({
    organizationId: customer.organizationId,
    branchId: customer.branchId,
    customerId: customer._id,
    performedBy: actorId(actor),
    performedByName: actorName(actor),
    ...fields,
  });

const limitChangeType = (previous, next) => {
  if (previous <= 0 && next > 0) return 'limit_set';
  if (next > previous) return 'limit_increase';
  if (next < previous) return next <= 0 ? 'limit_set' : 'limit_decrease';
  return 'limit_set';
};

/**
 * Permanent limit change. action 'set' → limit = amount; 'increase' → limit += amount.
 * 'temporary' → temporary limit = amount until expiresAt (must be above the base limit).
 */
const changeLimit = async ({ organizationId, customerId, action, amount, expiresAt, reason, actor }) => {
  const customer = await loadCustomer(organizationId, customerId);
  const value = round2(Number(amount));
  if (!Number.isFinite(value) || value < 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a valid amount');
  const previousLimit = round2(customer.creditLimit || 0);
  const note = (reason || '').trim();

  if (action === 'temporary') {
    const until = expiresAt ? new Date(expiresAt) : null;
    if (!until || Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Pick a future date for the temporary limit to end');
    }
    if (value <= previousLimit) {
      throw new ApiError(httpStatus.BAD_REQUEST, `A temporary limit must be higher than the current limit (${fmt(previousLimit)})`);
    }
    // End of the chosen day, so "until 15 Nov" includes 15 Nov.
    until.setHours(23, 59, 59, 999);
    customer.tempCreditLimit = { amount: value, expiresAt: until, reason: note, setBy: actorId(actor), setAt: new Date() };
    customer.creditLimitUpdatedAt = new Date();
    await customer.save();
    await logEvent(customer, actor, { type: 'temp_limit_set', previousLimit, newLimit: value, expiresAt: until, reason: note });
    return customer;
  }

  if (action !== 'set' && action !== 'increase') throw new ApiError(httpStatus.BAD_REQUEST, 'Unknown credit limit action');
  if (action === 'increase' && value <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter an amount to add');
  const newLimit = action === 'increase' ? round2(previousLimit + value) : value;
  if (newLimit === previousLimit) return customer;

  customer.creditLimit = newLimit;
  customer.creditLimitUpdatedAt = new Date();
  // A temporary limit at or below the new permanent one no longer does anything.
  if (customer.tempCreditLimit?.amount && customer.tempCreditLimit.amount <= newLimit) {
    customer.tempCreditLimit = undefined;
  }
  await customer.save();
  await logEvent(customer, actor, { type: limitChangeType(previousLimit, newLimit), previousLimit, newLimit, reason: note });
  return customer;
};

const clearTemporaryLimit = async ({ organizationId, customerId, reason, actor }) => {
  const customer = await loadCustomer(organizationId, customerId);
  const temp = customer.tempCreditLimit;
  if (!temp || !temp.amount) return customer;
  const previous = temp.amount;
  customer.tempCreditLimit = undefined;
  customer.creditLimitUpdatedAt = new Date();
  await customer.save();
  await logEvent(customer, actor, {
    type: 'temp_limit_cleared',
    previousLimit: previous,
    newLimit: customer.creditLimit || 0,
    reason: (reason || '').trim(),
  });
  return customer;
};

const setHold = async ({ organizationId, customerId, onHold, reason, actor }) => {
  const customer = await loadCustomer(organizationId, customerId);
  const hold = Boolean(onHold);
  if (Boolean(customer.creditHold) === hold) return customer;
  const note = (reason || '').trim();
  if (hold && !note) throw new ApiError(httpStatus.BAD_REQUEST, 'Give a reason for putting the customer on hold');
  customer.creditHold = hold;
  customer.creditHoldReason = hold ? note : undefined;
  customer.creditHoldAt = hold ? new Date() : undefined;
  customer.creditHoldBy = hold ? actorId(actor) : undefined;
  await customer.save();
  await logEvent(customer, actor, { type: hold ? 'hold_on' : 'hold_off', reason: note });
  return customer;
};

/**
 * Logs a limit typed into the customer form (create or edit) so the history stays
 * complete even when the limit wasn't changed through the credit dialog.
 */
const recordFormLimitChange = async (customer, previousLimit, actor) => {
  const previous = round2(previousLimit || 0);
  const next = round2(customer.creditLimit || 0);
  if (previous === next) return;
  try {
    await logEvent(customer, actor, {
      type: limitChangeType(previous, next),
      previousLimit: previous,
      newLimit: next,
      reason: 'Changed on the customer form',
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to log credit limit change:', error);
  }
};

const getHistory = async ({ organizationId, customerId, limit = 50 }) => {
  const customer = await loadCustomer(organizationId, customerId);
  return CreditLimitEvent.find({ organizationId, customerId: customer._id })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 200))
    .lean()
    .then((rows) => rows.map(({ _id, __v, ...row }) => ({ id: String(_id), ...row })));
};

// ---------------------------------------------------------------------------------------
// Lists — the credit columns on the Customer Ledger list and the credit overview
// ---------------------------------------------------------------------------------------

/** Pending exposure for many customers in one query, keyed by customer id string. */
const getPendingExposureMap = async (organizationId, customerIds) => {
  if (!customerIds.length) return new Map();
  const values = customerIds.flatMap((cid) => toCustomerIdMatchValues(cid));
  const rows = await Invoice.aggregate([
    {
      $match: {
        organizationId: new mongoose.Types.ObjectId(String(organizationId)),
        customerId: { $in: values },
        type: 'pending',
        isConvertedToBill: { $ne: true },
        status: { $ne: 'cancelled' },
      },
    },
    {
      $group: {
        _id: { $toString: '$customerId' },
        amount: {
          $sum: { $max: [0, { $subtract: [{ $ifNull: ['$total', 0] }, { $ifNull: ['$paidAmount', 0] }] }] },
        },
      },
    },
  ]);
  return new Map(rows.map((row) => [row._id, round2(row.amount)]));
};

/** Credit summary for list rows (no overdue scan — that is per-customer and heavier). */
const summarizeCustomers = async (organizationId, customers, settingsArg) => {
  const settings = settingsArg || (await getSettings(organizationId));
  const pendingMap = settings.includePendingInvoices
    ? await getPendingExposureMap(
        organizationId,
        customers.map((c) => String(c._id))
      )
    : new Map();
  const now = new Date();
  return customers.map((customer) => {
    const limitInfo = resolveEffectiveLimit(customer, now);
    const exposure = round2((Number(customer.balance) || 0) + (pendingMap.get(String(customer._id)) || 0));
    return {
      customerId: String(customer._id),
      limit: limitInfo.limit,
      baseLimit: limitInfo.baseLimit,
      hasLimit: limitInfo.hasLimit,
      temporary: limitInfo.temporary,
      onHold: Boolean(customer.creditHold),
      exposure,
      available: limitInfo.hasLimit ? round2(limitInfo.limit - exposure) : null,
      utilization: limitInfo.hasLimit ? round2((exposure / limitInfo.limit) * 100) : null,
      status: resolveStatus({
        onHold: customer.creditHold,
        hasLimit: limitInfo.hasLimit,
        exposure,
        limit: limitInfo.limit,
        nearLimitPercent: settings.nearLimitPercent,
      }),
    };
  });
};

/** Every customer with credit terms (a limit or a hold), worst first. */
const getOverview = async ({ organizationId, branchId, status }) => {
  const filter = {
    organizationId,
    isEmployeeAccount: { $ne: true },
    isSupplierAccount: { $ne: true },
    $or: [{ creditLimit: { $gt: 0 } }, { creditHold: true }, { 'tempCreditLimit.amount': { $gt: 0 } }],
  };
  if (branchId) filter.branchId = branchId;
  const [settings, customers] = await Promise.all([
    getSettings(organizationId),
    Customer.find(filter).select('name nameUrdu phone balance creditLimit tempCreditLimit creditHold creditHoldReason branchId').lean(),
  ]);
  const summaries = await summarizeCustomers(organizationId, customers, settings);
  const byId = new Map(customers.map((c) => [String(c._id), c]));
  const rank = { hold: 0, over: 1, near: 2, ok: 3, no_limit: 4 };
  let rows = summaries.map((summary) => {
    const customer = byId.get(summary.customerId);
    return {
      ...summary,
      name: customer.name,
      nameUrdu: customer.nameUrdu,
      phone: customer.phone,
      balance: round2(customer.balance || 0),
      holdReason: customer.creditHoldReason || '',
    };
  });
  const totals = {
    customers: rows.length,
    totalLimit: round2(rows.reduce((sum, row) => sum + (row.limit || 0), 0)),
    totalExposure: round2(rows.reduce((sum, row) => sum + Math.max(0, row.exposure), 0)),
    over: rows.filter((row) => row.status === 'over').length,
    near: rows.filter((row) => row.status === 'near').length,
    hold: rows.filter((row) => row.status === 'hold').length,
    overAmount: round2(rows.filter((row) => row.status === 'over').reduce((sum, row) => sum + (row.exposure - row.limit), 0)),
  };
  if (status && status !== 'all') rows = rows.filter((row) => row.status === status);
  rows.sort((a, b) => rank[a.status] - rank[b.status] || (b.utilization || 0) - (a.utilization || 0));
  return { settings, totals, results: rows };
};

const getRecentOverrides = async ({ organizationId, branchId, limit = 50 }) => {
  const filter = { organizationId, type: { $in: ['override', 'warning', 'offline_sale'] } };
  if (branchId) filter.branchId = branchId;
  const rows = await CreditLimitEvent.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 200))
    .populate('customerId', 'name')
    .lean();
  return rows.map(({ _id, __v, customerId, ...row }) => ({
    id: String(_id),
    ...row,
    customerId: customerId?._id ? String(customerId._id) : String(customerId || ''),
    customerName: customerId?.name || '',
  }));
};

// ---------------------------------------------------------------------------------------
// Bulk credit actions, overdue review and the customer Excel export
// ---------------------------------------------------------------------------------------

const BULK_ACTIONS = [
  'set',
  'increase',
  'increase_percent',
  'match_balance',
  'remove',
  'temporary',
  'clear_temporary',
  'hold',
  'release',
  'payment_terms',
];
const PAYMENT_TERMS = Object.keys(PAYMENT_TERM_DAYS);
const BULK_CHUNK = 500;
const MAX_BULK_CUSTOMERS = 20000;

const roundUpTo = (value, step) => {
  const s = Number(step) || 0;
  if (s <= 1) return round2(value);
  return Math.ceil(value / s) * s;
};

const customerScopeFilter = ({ organizationId, branchId }) => {
  const filter = { organizationId, isEmployeeAccount: { $ne: true }, isSupplierAccount: { $ne: true } };
  if (branchId) filter.branchId = branchId;
  return filter;
};

/** Which customers a bulk action touches: picked ids, or a whole group of the branch. */
const resolveBulkTargets = async ({ organizationId, branchId, customerIds, scope }) => {
  const filter = customerScopeFilter({ organizationId, branchId });
  if (Array.isArray(customerIds) && customerIds.length) {
    filter._id = { $in: customerIds.filter((cid) => mongoose.Types.ObjectId.isValid(String(cid))) };
  } else if (scope === 'no_limit') {
    filter.creditLimit = { $not: { $gt: 0 } };
  } else if (scope === 'with_limit') {
    filter.creditLimit = { $gt: 0 };
  } else if (scope === 'receivable') {
    filter.balance = { $gt: 0 };
  } else if (scope !== 'all') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Pick customers, or a group to apply this to');
  }
  return Customer.find(filter)
    .select('name balance creditLimit tempCreditLimit creditHold creditHoldReason paymentTerms organizationId branchId')
    .limit(MAX_BULK_CUSTOMERS)
    .lean();
};

/**
 * One credit change applied to many customers at once — one bulkWrite plus one insertMany
 * of history rows, so a few thousand customers take a second, not minutes.
 * Customers the change doesn't make sense for (e.g. "+10%" on a customer with no limit)
 * are skipped and reported, never forced.
 */
const bulkUpdate = async ({
  organizationId,
  branchId,
  customerIds,
  scope,
  action,
  amount,
  percent,
  roundTo,
  expiresAt,
  reason,
  paymentTerms,
  actor,
}) => {
  if (!BULK_ACTIONS.includes(action)) throw new ApiError(httpStatus.BAD_REQUEST, 'Unknown credit action');
  const note = (reason || '').trim();
  const value = round2(Number(amount) || 0);
  const pct = Number(percent) || 0;
  let until = null;
  if (action === 'temporary') {
    until = expiresAt ? new Date(expiresAt) : null;
    if (!until || Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Pick a future date for the temporary limit to end');
    }
    until.setHours(23, 59, 59, 999);
    if (value <= 0 && pct <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter how much to add, as an amount or a %');
  }
  if (action === 'set' && value < 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a valid limit');
  if (action === 'increase' && value <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter an amount to add');
  if (action === 'increase_percent' && pct === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a percentage');
  if (action === 'hold' && !note) throw new ApiError(httpStatus.BAD_REQUEST, 'Give a reason for the credit hold');
  if (action === 'payment_terms' && paymentTerms && !PAYMENT_TERMS.includes(paymentTerms)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unknown payment terms');
  }

  const customers = await resolveBulkTargets({ organizationId, branchId, customerIds, scope });
  const now = new Date();
  const ops = [];
  const events = [];
  const skipped = [];
  const by = { performedBy: actorId(actor), performedByName: actorName(actor) };
  const event = (customer, fields) =>
    events.push({ organizationId: customer.organizationId, branchId: customer.branchId, customerId: customer._id, reason: note || undefined, ...by, ...fields });

  for (const customer of customers) {
    const base = round2(customer.creditLimit || 0);
    const skip = (why) => skipped.push({ customerId: String(customer._id), name: customer.name, reason: why });
    const setLimit = (next) => {
      const newLimit = Math.max(0, round2(next));
      if (newLimit === base) return skip('Limit already at that amount');
      const $set = { creditLimit: newLimit, creditLimitUpdatedAt: now };
      const update = { $set };
      if (customer.tempCreditLimit?.amount && customer.tempCreditLimit.amount <= newLimit) update.$unset = { tempCreditLimit: '' };
      ops.push({ updateOne: { filter: { _id: customer._id }, update } });
      return event(customer, { type: limitChangeType(base, newLimit), previousLimit: base, newLimit });
    };

    switch (action) {
      case 'set':
        setLimit(value);
        break;
      case 'remove':
        if (base <= 0) skip('Already has no limit');
        else setLimit(0);
        break;
      case 'increase':
        if (base <= 0) skip('Has no limit to increase');
        else setLimit(roundUpTo(base + value, roundTo));
        break;
      case 'increase_percent':
        if (base <= 0) skip('Has no limit to increase');
        else setLimit(roundUpTo(base * (1 + pct / 100), roundTo));
        break;
      case 'match_balance': {
        // What they owe now, plus a buffer — switching on limits without blocking anyone.
        const owed = Math.max(0, Number(customer.balance) || 0);
        const target = roundUpTo(owed * (1 + Math.max(0, pct) / 100) + Math.max(0, value), roundTo);
        if (target <= 0) skip('Owes nothing — no limit set (add a fixed amount to give one)');
        else setLimit(target);
        break;
      }
      case 'temporary': {
        if (base <= 0) {
          skip('Has no limit — a temporary increase needs one');
          break;
        }
        const temp = roundUpTo(pct > 0 ? base * (1 + pct / 100) + value : base + value, roundTo);
        if (temp <= base) {
          skip('Temporary limit would not be above the current limit');
          break;
        }
        ops.push({
          updateOne: {
            filter: { _id: customer._id },
            update: { $set: { tempCreditLimit: { amount: temp, expiresAt: until, reason: note, setBy: actorId(actor), setAt: now }, creditLimitUpdatedAt: now } },
          },
        });
        event(customer, { type: 'temp_limit_set', previousLimit: base, newLimit: temp, expiresAt: until });
        break;
      }
      case 'clear_temporary':
        if (!customer.tempCreditLimit?.amount) skip('Has no temporary limit');
        else {
          ops.push({ updateOne: { filter: { _id: customer._id }, update: { $unset: { tempCreditLimit: '' }, $set: { creditLimitUpdatedAt: now } } } });
          event(customer, { type: 'temp_limit_cleared', previousLimit: customer.tempCreditLimit.amount, newLimit: base });
        }
        break;
      case 'hold':
        if (customer.creditHold) skip('Already on hold');
        else {
          ops.push({ updateOne: { filter: { _id: customer._id }, update: { $set: { creditHold: true, creditHoldReason: note, creditHoldAt: now, creditHoldBy: actorId(actor) } } } });
          event(customer, { type: 'hold_on' });
        }
        break;
      case 'release':
        if (!customer.creditHold) skip('Not on hold');
        else {
          ops.push({ updateOne: { filter: { _id: customer._id }, update: { $set: { creditHold: false }, $unset: { creditHoldReason: '', creditHoldAt: '', creditHoldBy: '' } } } });
          event(customer, { type: 'hold_off' });
        }
        break;
      case 'payment_terms': {
        const next = paymentTerms || null;
        if ((customer.paymentTerms || null) === next) skip('Already on those terms');
        else ops.push({ updateOne: { filter: { _id: customer._id }, update: next ? { $set: { paymentTerms: next } } : { $unset: { paymentTerms: '' } } } });
        break;
      }
      default:
        break;
    }
  }

  for (let i = 0; i < ops.length; i += BULK_CHUNK) {
    // eslint-disable-next-line no-await-in-loop
    await Customer.bulkWrite(ops.slice(i, i + BULK_CHUNK), { ordered: false });
  }
  for (let i = 0; i < events.length; i += BULK_CHUNK) {
    // eslint-disable-next-line no-await-in-loop
    await CreditLimitEvent.insertMany(events.slice(i, i + BULK_CHUNK), { ordered: false });
  }
  return { total: customers.length, updated: ops.length, skippedCount: skipped.length, skipped: skipped.slice(0, 200) };
};

/**
 * Overdue position of every customer of the branch in one pass: open cash/credit invoices
 * (settlement-aware) whose due date — the invoice's own, else invoice date + the customer's
 * payment terms — has passed. Map customerId → { count, amount, oldestDays }.
 */
const scanOverdue = async ({ organizationId, branchId, now = new Date() }) => {
  // eslint-disable-next-line global-require
  const { buildSettlementAddFieldsStage } = require('../utils/invoiceSettlement');
  const match = {
    organizationId: new mongoose.Types.ObjectId(String(organizationId)),
    type: { $in: ['cash', 'credit'] },
    status: { $ne: 'cancelled' },
    customerId: { $nin: [null, '', 'walk-in'] },
  };
  if (branchId) match.branchId = new mongoose.Types.ObjectId(String(branchId));
  const [invoices, customers] = await Promise.all([
    Invoice.aggregate([
      { $match: match },
      buildSettlementAddFieldsStage(now),
      { $match: { remainingAmount: { $gt: 0.005 } } },
      { $project: { customerId: { $toString: '$customerId' }, invoiceDate: 1, dueDate: 1, remainingAmount: 1 } },
    ]),
    Customer.find(customerScopeFilter({ organizationId, branchId })).select('paymentTerms').lean(),
  ]);
  const termsById = new Map(customers.map((c) => [String(c._id), c.paymentTerms]));
  const result = new Map();
  for (const invoice of invoices) {
    const termDays = PAYMENT_TERM_DAYS[termsById.get(invoice.customerId)];
    let due = invoice.dueDate ? new Date(invoice.dueDate) : null;
    if (!due && termDays !== undefined && invoice.invoiceDate) due = new Date(new Date(invoice.invoiceDate).getTime() + termDays * DAY_MS);
    if (!due || Number.isNaN(due.getTime())) continue;
    const endOfDue = new Date(due);
    endOfDue.setHours(23, 59, 59, 999);
    if (endOfDue.getTime() >= now.getTime()) continue;
    const days = Math.max(1, Math.ceil((now.getTime() - endOfDue.getTime()) / DAY_MS));
    const row = result.get(invoice.customerId) || { count: 0, amount: 0, oldestDays: 0 };
    row.count += 1;
    row.amount = round2(row.amount + invoice.remainingAmount);
    row.oldestDays = Math.max(row.oldestDays, days);
    result.set(invoice.customerId, row);
  }
  return result;
};

/** Customers with an invoice overdue by more than `minDays` — the "hold overdue" review list. */
const getOverdueCustomers = async ({ organizationId, branchId, minDays = 0 }) => {
  const days = Math.max(0, Math.floor(Number(minDays) || 0));
  const [overdue, customers] = await Promise.all([
    scanOverdue({ organizationId, branchId }),
    Customer.find(customerScopeFilter({ organizationId, branchId }))
      .select('name nameUrdu phone balance creditLimit tempCreditLimit creditHold creditHoldReason paymentTerms')
      .lean(),
  ]);
  const now = new Date();
  const results = customers
    .map((customer) => {
      const row = overdue.get(String(customer._id));
      if (!row || row.oldestDays <= days) return null;
      const limitInfo = resolveEffectiveLimit(customer, now);
      return {
        customerId: String(customer._id),
        name: customer.name,
        nameUrdu: customer.nameUrdu,
        phone: customer.phone,
        balance: round2(customer.balance || 0),
        limit: limitInfo.limit,
        paymentTerms: customer.paymentTerms || null,
        onHold: Boolean(customer.creditHold),
        holdReason: customer.creditHoldReason || '',
        overdueCount: row.count,
        overdueAmount: row.amount,
        oldestDays: row.oldestDays,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.oldestDays - a.oldestDays || b.overdueAmount - a.overdueAmount);
  return {
    minDays: days,
    results,
    totals: {
      customers: results.length,
      amount: round2(results.reduce((sum, row) => sum + row.overdueAmount, 0)),
      notOnHold: results.filter((row) => !row.onHold).length,
    },
  };
};

/**
 * Every customer of the branch with the import columns plus live credit figures — the
 * Excel export, laid out so the same file re-imports (Update mode) as a bulk edit.
 */
const exportCustomers = async ({ organizationId, branchId }) => {
  const [settings, customers, overdue] = await Promise.all([
    getSettings(organizationId),
    Customer.find(customerScopeFilter({ organizationId, branchId }))
      .select('name nameUrdu phone whatsapp email address balance customerType taxNumber notes creditLimit tempCreditLimit creditHold creditHoldReason paymentTerms isActive')
      .sort({ name: 1 })
      .lean(),
    scanOverdue({ organizationId, branchId }),
  ]);
  const summaries = await summarizeCustomers(organizationId, customers, settings);
  return customers.map((customer, i) => {
    const credit = summaries[i];
    const late = overdue.get(String(customer._id));
    return {
      id: String(customer._id),
      name: customer.name,
      nameUrdu: customer.nameUrdu || '',
      phone: customer.phone || '',
      whatsapp: customer.whatsapp || '',
      email: customer.email || '',
      address: customer.address || '',
      customerType: customer.customerType || '',
      taxNumber: customer.taxNumber || '',
      notes: customer.notes || '',
      isActive: customer.isActive !== false,
      balance: round2(customer.balance || 0),
      creditLimit: round2(customer.creditLimit || 0),
      paymentTerms: customer.paymentTerms || '',
      creditHold: Boolean(customer.creditHold),
      creditHoldReason: customer.creditHoldReason || '',
      temporaryLimit: credit.temporary ? credit.temporary.amount : null,
      temporaryUntil: credit.temporary ? credit.temporary.expiresAt : null,
      creditUsed: credit.exposure,
      creditAvailable: credit.available,
      creditStatus: credit.status,
      overdueAmount: late ? late.amount : 0,
      overdueDays: late ? late.oldestDays : 0,
    };
  });
};

/** Payment terms as typed in a spreadsheet ("Net 30", "30 days", "cash"…) → stored value. */
const parsePaymentTerms = (raw) => {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return { empty: true };
  if (PAYMENT_TERMS.includes(text)) return { value: text };
  if (/^(cash|cod|cash only)$/.test(text)) return { value: 'cash' };
  if (/^(due on receipt|on receipt|receipt|immediate|0 ?days?|0)$/.test(text)) return { value: 'due_on_receipt' };
  const days = (text.match(/\d+/) || [])[0];
  if (days === '15') return { value: 'net_15' };
  if (days === '30') return { value: 'net_30' };
  if (days === '60') return { value: 'net_60' };
  return { invalid: true };
};

/** "yes / no / on / hold / true / 1" → boolean; anything else undefined. */
const parseYesNo = (raw) => {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return undefined;
  if (['yes', 'y', 'true', '1', 'on', 'hold', 'on hold', 'haan', 'ha'].includes(text)) return true;
  if (['no', 'n', 'false', '0', 'off', 'release', 'nahi'].includes(text)) return false;
  return null;
};

/** History rows for credit fields an import set or changed (one insertMany, never throws). */
const recordImportChanges = async (changes, actor) => {
  const rows = [];
  const by = { performedBy: actorId(actor), performedByName: actorName(actor) };
  for (const change of changes) {
    const base = { organizationId: change.organizationId, branchId: change.branchId, customerId: change.customerId, reason: 'Excel import', ...by };
    const prev = round2(change.previousLimit || 0);
    const next = change.newLimit === undefined ? prev : round2(change.newLimit || 0);
    if (next !== prev) rows.push({ ...base, type: limitChangeType(prev, next), previousLimit: prev, newLimit: next });
    if (change.hold !== undefined && Boolean(change.hold) !== Boolean(change.previousHold)) {
      rows.push({ ...base, type: change.hold ? 'hold_on' : 'hold_off', reason: change.holdReason || 'Excel import' });
    }
  }
  if (!rows.length) return;
  try {
    await CreditLimitEvent.insertMany(rows, { ordered: false });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to log imported credit changes:', error);
  }
};

module.exports = {
  CREDIT_LIMIT_ERROR_CODE,
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
  resolveEffectiveLimit,
  unpaidOf,
  getCreditStatus,
  evaluateSale,
  enforceSale,
  toInvoiceStamp,
  recordSaleOutcome,
  changeLimit,
  clearTemporaryLimit,
  setHold,
  recordFormLimitChange,
  getHistory,
  summarizeCustomers,
  getOverview,
  getRecentOverrides,
  BULK_ACTIONS,
  PAYMENT_TERMS,
  bulkUpdate,
  scanOverdue,
  getOverdueCustomers,
  exportCustomers,
  parsePaymentTerms,
  parseYesNo,
  recordImportChanges,
};
