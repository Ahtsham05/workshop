const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { serviceManagementService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createService = catchAsync(async (req, res) => {
  const service = await serviceManagementService.createServiceDefinition({
    ...req.body,
    ...getBranchContext(req),
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(service);
});

const getServices = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['serviceName', 'isActive']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await serviceManagementService.queryServiceDefinitions(filter, options);
  res.send(result);
});

const updateService = catchAsync(async (req, res) => {
  const service = await serviceManagementService.updateServiceDefinitionById(req.params.serviceId, req.body, req.user.id);
  res.send(service);
});

const deleteService = catchAsync(async (req, res) => {
  await serviceManagementService.deleteServiceDefinitionById(req.params.serviceId);
  res.status(httpStatus.NO_CONTENT).send();
});

const createServiceInvoice = catchAsync(async (req, res) => {
  const invoice = await serviceManagementService.createServiceInvoice({
    ...req.body,
    ...getBranchContext(req),
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(invoice);
});

const getServiceInvoices = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['customerName', 'invoiceNumber', 'paymentMethod']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate']);
  const result = await serviceManagementService.queryServiceInvoices(filter, options);
  res.send(result);
});

const deleteServiceInvoice = catchAsync(async (req, res) => {
  await serviceManagementService.deleteServiceInvoiceById(req.params.invoiceId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createService,
  getServices,
  updateService,
  deleteService,
  createServiceInvoice,
  getServiceInvoices,
  deleteServiceInvoice,
};
