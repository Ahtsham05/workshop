const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { billPaymentService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createBillPayment = catchAsync(async (req, res) => {
  const billPayment = await billPaymentService.createBillPayment({
    ...req.body,
    ...getBranchContext(req),
  });
  res.status(httpStatus.CREATED).send(billPayment);
});

const getBillPayments = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['billType', 'companyId', 'status', 'paymentMethod']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'startDate', 'endDate', 'dueStartDate', 'dueEndDate']);
  const result = await billPaymentService.queryBillPayments(filter, options);
  res.send(result);
});

const getBillPayment = catchAsync(async (req, res) => {
  const billPayment = await billPaymentService.getBillPaymentById(req.params.billPaymentId);
  res.send(billPayment);
});

const updateBillPayment = catchAsync(async (req, res) => {
  const billPayment = await billPaymentService.updateBillPaymentById(
    req.params.billPaymentId,
    req.body,
    req.user.id
  );
  res.send(billPayment);
});

const deleteBillPayment = catchAsync(async (req, res) => {
  await billPaymentService.deleteBillPaymentById(req.params.billPaymentId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getBillsDueToday = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user.organizationId;
  const bills = await billPaymentService.getBillsDueToday(organizationId, req.branchId);
  res.send(bills);
});

const getOverdueBills = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user.organizationId;
  const bills = await billPaymentService.getOverdueBills(organizationId, req.branchId);
  res.send(bills);
});

const getBillPaymentReceipt = catchAsync(async (req, res) => {
  const billPayment = await billPaymentService.getBillPaymentById(req.params.billPaymentId);
  res.send({
    customerName: billPayment.customerName,
    companyName: billPayment.companyName,
    billType: billPayment.billType,
    referenceNumber: billPayment.referenceNumber,
    billAmount: billPayment.billAmount,
    serviceCharge: billPayment.serviceCharge,
    totalPaid: billPayment.totalReceived,
    paymentMethod: billPayment.paymentMethod,
    dueDate: billPayment.dueDate,
    paymentDate: billPayment.paymentDate,
    status: billPayment.status,
  });
});

const getBillPaymentReport = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user.organizationId;
  const { startDate, endDate, billType, companyId } = req.query;
  const report = await billPaymentService.getBillPaymentReport({
    organizationId,
    branchId: req.branchId,
    startDate,
    endDate,
    billType,
    companyId,
  });
  res.send(report);
});

const getBillDueSummary = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user.organizationId;
  const { dueStartDate, dueEndDate } = req.query;
  const summary = await billPaymentService.getDueDateRangeSummary({
    organizationId,
    branchId: req.branchId,
    dueStartDate,
    dueEndDate,
  });
  res.send(summary);
});

module.exports = {
  createBillPayment,
  getBillPayments,
  getBillPayment,
  updateBillPayment,
  deleteBillPayment,
  getBillsDueToday,
  getOverdueBills,
  getBillPaymentReceipt,
  getBillPaymentReport,
  getBillDueSummary,
};
