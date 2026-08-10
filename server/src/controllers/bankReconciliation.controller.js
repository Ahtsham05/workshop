const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { bankReconciliationService, auditLogService } = require('../services');
const { getBranchContext } = require('../utils/branchFilter');

const getSummary = catchAsync(async (req, res) => {
  const summary = await bankReconciliationService.getSummary({
    ...getBranchContext(req),
    walletId: req.params.walletId,
  });
  res.send(summary);
});

const getUnreconciled = catchAsync(async (req, res) => {
  const entries = await bankReconciliationService.getUnreconciledEntries({
    ...getBranchContext(req),
    walletId: req.params.walletId,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });
  res.send({ results: entries });
});

const matchStatement = catchAsync(async (req, res) => {
  const result = await bankReconciliationService.matchStatement({
    ...getBranchContext(req),
    walletId: req.params.walletId,
    statementLines: req.body.statementLines,
    dateToleranceDays: req.body.dateToleranceDays,
  });
  res.send(result);
});

const confirmReconciliation = catchAsync(async (req, res) => {
  const session = await bankReconciliationService.confirmReconciliation({
    ...getBranchContext(req),
    walletId: req.params.walletId,
    walletEntryIds: req.body.walletEntryIds,
    statementStartDate: req.body.statementStartDate,
    statementEndDate: req.body.statementEndDate,
    statementClosingBalance: req.body.statementClosingBalance,
    userId: req.user.id,
  });
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'BankReconciliationSession',
    entityId: session._id,
    entityName: `${session.bankAccountName} — Rs ${session.statementClosingBalance} (${session.matchedCount} matched)`,
    after: session.toObject ? session.toObject() : session,
  });
  res.status(httpStatus.CREATED).send(session);
});

const unreconcileEntry = catchAsync(async (req, res) => {
  const entry = await bankReconciliationService.unreconcileEntry({
    ...getBranchContext(req),
    walletEntryId: req.params.walletEntryId,
  });
  res.send(entry);
});

const getHistory = catchAsync(async (req, res) => {
  const history = await bankReconciliationService.getHistory({
    ...getBranchContext(req),
    walletId: req.params.walletId,
  });
  res.send({ results: history });
});

module.exports = {
  getSummary,
  getUnreconciled,
  matchStatement,
  confirmReconciliation,
  unreconcileEntry,
  getHistory,
};
