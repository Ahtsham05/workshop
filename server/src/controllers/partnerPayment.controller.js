const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { partnerPaymentService, auditLogService, localizationService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const ApiError = require('../utils/ApiError');
const { formatMoney } = require('../utils/money');

const createPayment = catchAsync(async (req, res) => {
  const payment = await partnerPaymentService.createPayment(
    { ...req.body, ...getBranchContext(req) },
    req.user.id
  );
  const currencyMeta = await localizationService.resolveOrganizationCurrencyMeta(req.organizationId);
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'PartnerPayment',
    entityId: payment._id,
    entityName: `${payment.partnerName || ''} — ${formatMoney(payment.amount, currencyMeta)}`,
    after: payment.toObject ? payment.toObject() : payment,
    fields: ['partnerId', 'amount', 'paymentMethod', 'walletType'],
  });
  res.status(httpStatus.CREATED).send(payment);
});

const getPayments = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['partnerId']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await partnerPaymentService.queryPayments(filter, options);
  res.send(result);
});

const getPayment = catchAsync(async (req, res) => {
  const payment = await partnerPaymentService.getPaymentById(req.params.paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Partner payment not found');
  }
  res.send(payment);
});

const deletePayment = catchAsync(async (req, res) => {
  const payment = await partnerPaymentService.getPaymentById(req.params.paymentId);
  await partnerPaymentService.deletePaymentById(req.params.paymentId);
  let entityName;
  if (payment) {
    const currencyMeta = await localizationService.resolveOrganizationCurrencyMeta(req.organizationId);
    entityName = `${payment.partnerName || ''} — ${formatMoney(payment.amount, currencyMeta)}`;
  }
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'PartnerPayment',
    entityId: req.params.paymentId,
    entityName,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createPayment,
  getPayments,
  getPayment,
  deletePayment,
};
