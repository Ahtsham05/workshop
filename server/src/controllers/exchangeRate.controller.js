const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const exchangeRateService = require('../services/exchangeRate.service');
const auditLogService = require('../services/auditLog.service');
const pick = require('../utils/pick');

const TRACKED_EXCHANGE_RATE_FIELDS = ['rate', 'rateDate', 'notes'];

const rateLabel = (rate) => `${rate.fromCurrency}→${rate.toCurrency}`;

// createOrUpdateRate upserts by (organizationId, fromCurrency, toCurrency, rateDate) — see
// exchangeRate.service.js. It's always logged as a 'create' audit action here, matching
// the endpoint's own POST /exchange-rates semantics, regardless of whether the underlying
// day's row was inserted or overwritten.
const createOrUpdateRate = catchAsync(async (req, res) => {
  const rate = await exchangeRateService.createOrUpdateRate(req.organizationId, req.body, req.user.id);

  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'ExchangeRate',
    entityId: rate._id,
    entityName: rateLabel(rate),
    after: rate.toObject(),
    fields: TRACKED_EXCHANGE_RATE_FIELDS,
  });

  res.status(httpStatus.CREATED).send(rate);
});

const getRates = catchAsync(async (req, res) => {
  const filter = { organizationId: req.organizationId, ...pick(req.query, ['fromCurrency', 'toCurrency']) };
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await exchangeRateService.queryRates(filter, options);
  res.send(result);
});

const getLatestRate = catchAsync(async (req, res) => {
  const { from, to, asOfDate } = req.query;
  const result = await exchangeRateService.getLatestRate(req.organizationId, from, to, asOfDate);
  res.send(result);
});

const getRate = catchAsync(async (req, res) => {
  const rate = await exchangeRateService.getRateById(req.organizationId, req.params.exchangeRateId);
  res.send(rate);
});

const updateRate = catchAsync(async (req, res) => {
  const before = await exchangeRateService.getRateById(req.organizationId, req.params.exchangeRateId);
  const beforeSnapshot = before.toObject();

  const rate = await exchangeRateService.updateRateById(req.organizationId, req.params.exchangeRateId, req.body, req.user.id);

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'ExchangeRate',
    entityId: rate._id,
    entityName: rateLabel(rate),
    before: beforeSnapshot,
    after: rate.toObject(),
    fields: TRACKED_EXCHANGE_RATE_FIELDS,
  });

  res.send(rate);
});

const deleteRate = catchAsync(async (req, res) => {
  const rate = await exchangeRateService.getRateById(req.organizationId, req.params.exchangeRateId);
  await exchangeRateService.deleteRateById(req.organizationId, req.params.exchangeRateId);

  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'ExchangeRate',
    entityId: rate._id,
    entityName: rateLabel(rate),
  });

  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createOrUpdateRate,
  getRates,
  getLatestRate,
  getRate,
  updateRate,
  deleteRate,
};
