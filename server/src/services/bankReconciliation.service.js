const httpStatus = require('http-status');
const { Wallet, WalletEntry, BankReconciliationSession } = require('../models');
const ApiError = require('../utils/ApiError');
const walletService = require('./wallet.service');

const resolveWallet = async (walletId, organizationId, branchId) => {
  const wallet = await Wallet.findOne({ _id: walletId, organizationId, branchId });
  if (!wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bank account not found');
  }
  // Statement-matching needs an independent external record (a real bank/wallet statement)
  // to match against — a cash-type account has none, and is reconciled by counting physical
  // cash against Cash Book instead (the existing Track Cash / Cash Register page). The client
  // already excludes cash-type wallets from this workflow's account picker; this is the
  // server-side backstop for direct API use.
  if (wallet.accountType === 'cash') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cash in Hand has no bank statement to reconcile — use Track Cash to reconcile physical cash instead',
    );
  }
  return wallet;
};

const currentBookBalance = async (wallet, organizationId, branchId) =>
  wallet.accountType === 'cash' ? walletService.resolveCashInHandBalance(organizationId, branchId) : wallet.balance;

/**
 * Reconciliation status + a quick snapshot for the workspace header — current book balance,
 * how many book transactions are still unreconciled, and when this account was last
 * reconciled (and to what balance), if ever.
 */
const getSummary = async ({ organizationId, branchId, walletId }) => {
  const wallet = await resolveWallet(walletId, organizationId, branchId);

  const [bookBalance, unreconciledCount, lastSession] = await Promise.all([
    currentBookBalance(wallet, organizationId, branchId),
    WalletEntry.countDocuments({ organizationId, branchId, walletType: wallet.type, isReconciled: { $ne: true } }),
    BankReconciliationSession.findOne({ organizationId, branchId, bankAccountId: walletId }).sort({ statementEndDate: -1 }),
  ]);

  return {
    bankAccountId: String(walletId),
    bankAccountName: wallet.type,
    currentBookBalance: bookBalance,
    unreconciledCount,
    lastReconciledAt: lastSession ? lastSession.statementEndDate : null,
    lastReconciledBalance: lastSession ? lastSession.statementClosingBalance : null,
  };
};

/** The "book side" — every not-yet-reconciled WalletEntry for this account, oldest first. */
const getUnreconciledEntries = async ({ organizationId, branchId, walletId, startDate, endDate }) => {
  const wallet = await resolveWallet(walletId, organizationId, branchId);

  const filter = {
    organizationId,
    branchId,
    walletType: wallet.type,
    isReconciled: { $ne: true },
  };
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }

  return WalletEntry.find(filter).sort({ date: 1, createdAt: 1 }).limit(1000).lean();
};

/**
 * Match uploaded bank-statement lines against unreconciled book (WalletEntry) transactions.
 * Pure matching — nothing is persisted here, the caller reviews the suggestions and then
 * calls `confirmReconciliation` with whichever WalletEntry ids it wants to actually mark
 * reconciled. Matching rule: same direction (in/out), same amount (to the paisa), closest
 * date within `dateToleranceDays` — each book entry can only be claimed by one statement
 * line (first-come by closest date, scanned in statement-line order).
 */
const matchStatement = async ({ organizationId, branchId, walletId, statementLines, dateToleranceDays = 3 }) => {
  const wallet = await resolveWallet(walletId, organizationId, branchId);

  if (!Array.isArray(statementLines) || statementLines.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No statement lines to match');
  }

  const parsedLines = statementLines.map((line, index) => ({
    index,
    date: new Date(line.date),
    description: line.description || '',
    amount: Math.abs(Number(line.amount) || 0),
    direction: line.direction === 'out' ? 'out' : 'in',
  }));

  const validDates = parsedLines.map((l) => l.date.getTime()).filter((t) => Number.isFinite(t));
  if (validDates.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Statement lines have no valid dates');
  }
  const toleranceMs = dateToleranceDays * 24 * 60 * 60 * 1000;
  const rangeStart = new Date(Math.min(...validDates) - toleranceMs);
  const rangeEnd = new Date(Math.max(...validDates) + toleranceMs);

  const candidates = await WalletEntry.find({
    organizationId,
    branchId,
    walletType: wallet.type,
    isReconciled: { $ne: true },
    date: { $gte: rangeStart, $lte: rangeEnd },
  })
    .sort({ date: 1 })
    .lean();

  const usedCandidateIds = new Set();
  const matches = [];
  const unmatchedStatementLines = [];

  parsedLines.forEach((line) => {
    let best = null;
    let bestDiffMs = Infinity;

    for (const candidate of candidates) {
      const candidateId = String(candidate._id);
      if (usedCandidateIds.has(candidateId)) continue;
      if (candidate.type !== line.direction) continue;
      if (Math.abs(Number(candidate.amount) - line.amount) > 0.01) continue;

      const diffMs = Math.abs(new Date(candidate.date).getTime() - line.date.getTime());
      if (diffMs > toleranceMs) continue;
      if (diffMs < bestDiffMs) {
        best = candidate;
        bestDiffMs = diffMs;
      }
    }

    if (best) {
      usedCandidateIds.add(String(best._id));
      matches.push({
        statementLineIndex: line.index,
        statementLine: { date: line.date, description: line.description, amount: line.amount, direction: line.direction },
        walletEntry: best,
        confidence: bestDiffMs === 0 ? 'exact' : 'close',
      });
    } else {
      unmatchedStatementLines.push({
        statementLineIndex: line.index,
        statementLine: { date: line.date, description: line.description, amount: line.amount, direction: line.direction },
      });
    }
  });

  const unmatchedBookEntries = candidates.filter((c) => !usedCandidateIds.has(String(c._id)));

  return { matches, unmatchedStatementLines, unmatchedBookEntries };
};

/**
 * Persist a reconciliation: mark the chosen WalletEntry ids as reconciled and record a
 * session snapshot for the audit trail / history.
 */
const confirmReconciliation = async ({
  organizationId,
  branchId,
  walletId,
  walletEntryIds,
  statementStartDate,
  statementEndDate,
  statementClosingBalance,
  userId,
}) => {
  const wallet = await resolveWallet(walletId, organizationId, branchId);

  if (!Array.isArray(walletEntryIds) || walletEntryIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Select at least one transaction to reconcile');
  }

  const entries = await WalletEntry.find({
    _id: { $in: walletEntryIds },
    organizationId,
    branchId,
    walletType: wallet.type,
    isReconciled: { $ne: true },
  });

  if (entries.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'None of the selected transactions could be reconciled');
  }

  const bookBalance = await currentBookBalance(wallet, organizationId, branchId);

  const session = await BankReconciliationSession.create({
    organizationId,
    branchId,
    bankAccountId: walletId,
    bankAccountName: wallet.type,
    statementStartDate: statementStartDate || undefined,
    statementEndDate,
    statementClosingBalance,
    bookClosingBalance: bookBalance,
    difference: Number((Number(statementClosingBalance) - Number(bookBalance)).toFixed(2)),
    matchedCount: entries.length,
    createdBy: userId,
  });

  await WalletEntry.updateMany(
    { _id: { $in: entries.map((e) => e._id) } },
    { isReconciled: true, reconciledAt: new Date(), reconciledSessionId: session._id }
  );

  return session;
};

/** Undo a mistaken reconciliation on a single transaction. */
const unreconcileEntry = async ({ walletEntryId, organizationId, branchId }) => {
  const entry = await WalletEntry.findOne({ _id: walletEntryId, organizationId, branchId });
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Transaction not found');
  }
  entry.isReconciled = false;
  entry.reconciledAt = undefined;
  entry.reconciledSessionId = undefined;
  await entry.save();
  return entry;
};

/** Past reconciliation runs for this account, most recent first. */
const getHistory = async ({ organizationId, branchId, walletId }) => {
  await resolveWallet(walletId, organizationId, branchId);
  return BankReconciliationSession.find({ organizationId, branchId, bankAccountId: walletId })
    .sort({ statementEndDate: -1 })
    .limit(50)
    .lean();
};

module.exports = {
  getSummary,
  getUnreconciledEntries,
  matchStatement,
  confirmReconciliation,
  unreconcileEntry,
  getHistory,
};
