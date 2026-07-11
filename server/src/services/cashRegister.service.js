const CashRegisterState = require('../models/cashRegisterState.model');
const CashRegisterSnapshot = require('../models/cashRegisterSnapshot.model');
const cashBookService = require('./cashBook.service');
const { toBusinessCalendarDate } = require('../utils/businessTimezone');
const {
  PKR_DENOMINATIONS,
  computeTotalFromCounts,
  normalizeCounts,
} = require('../utils/pkrDenominations');

const buildScopeFilter = (organizationId, branchId) => {
  const filter = { organizationId };
  if (branchId) filter.branchId = branchId;
  return filter;
};

const getExpectedCashAmount = async (organizationId, branchId) => {
  // Bound to end of today (business timezone) — a cash-affecting record mis-dated in
  // the future would otherwise inflate "Expected" ahead of what's physically in the
  // drawer today, creating a phantom variance against the Track Cash count.
  const summary = await cashBookService.getCashInHandSummary({
    organizationId,
    branchId,
    endDate: toBusinessCalendarDate(new Date()),
  });
  return Number(summary?.closingBalance || 0);
};

const getRegister = async (organizationId, branchId) => {
  const filter = buildScopeFilter(organizationId, branchId);
  const [state, expectedCashAmount] = await Promise.all([
    CashRegisterState.findOne(filter),
    getExpectedCashAmount(organizationId, branchId),
  ]);

  const counts = normalizeCounts(state?.counts || []);
  const totalAmount = computeTotalFromCounts(counts);
  const variance = totalAmount - expectedCashAmount;

  return {
    denominations: PKR_DENOMINATIONS,
    counts,
    totalAmount,
    expectedCashAmount,
    variance,
    notes: state?.notes || '',
    lastCountedAt: state?.lastCountedAt || null,
    lastCountedBy: state?.lastCountedBy || null,
  };
};

const saveRegister = async (organizationId, branchId, userId, body) => {
  const filter = buildScopeFilter(organizationId, branchId);
  const counts = normalizeCounts(body.counts || []);
  const totalAmount = computeTotalFromCounts(counts);
  const expectedCashAmount = await getExpectedCashAmount(organizationId, branchId);
  const variance = totalAmount - expectedCashAmount;
  const notes = body.notes ? String(body.notes).trim() : '';

  const now = new Date();
  const state = await CashRegisterState.findOneAndUpdate(
    filter,
    {
      ...filter,
      counts,
      totalAmount,
      notes,
      lastCountedAt: now,
      lastCountedBy: userId,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  await CashRegisterSnapshot.create({
    organizationId,
    branchId,
    counts,
    totalAmount,
    expectedCashAmount,
    variance,
    notes,
    createdBy: userId,
  });

  return {
    denominations: PKR_DENOMINATIONS,
    counts: normalizeCounts(state.counts),
    totalAmount: state.totalAmount,
    expectedCashAmount,
    variance,
    notes: state.notes || '',
    lastCountedAt: state.lastCountedAt,
    lastCountedBy: state.lastCountedBy,
  };
};

const clearRegister = async (organizationId, branchId, userId) =>
  saveRegister(organizationId, branchId, userId, {
    counts: PKR_DENOMINATIONS.map((d) => ({ value: d.value, kind: d.kind, quantity: 0 })),
    notes: '',
  });

const queryHistory = async (filter, options) => {
  const queryFilter = { ...filter };
  return CashRegisterSnapshot.paginate(queryFilter, {
    ...options,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'createdBy',
  });
};

module.exports = {
  getRegister,
  saveRegister,
  clearRegister,
  queryHistory,
};
