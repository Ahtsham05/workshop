const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { supplierService } = require('../services');
const pick = require('../utils/pick');

const createSupplier = catchAsync(async (req, res) => {
  const supplier = await supplierService.createSupplier(req.body);
  res.status(httpStatus.CREATED).send(supplier);
});

const getSuppliers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'email', 'phone']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await supplierService.querySuppliers(filter, options);
  res.send(result);
});

const getSupplier = catchAsync(async (req, res) => {
  const supplier = await supplierService.getSupplierById(req.params.supplierId);
  if (!supplier) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
  }
  res.send(supplier);
});

const updateSupplier = catchAsync(async (req, res) => {
  const supplier = await supplierService.updateSupplierById(req.params.supplierId, req.body);
  res.send(supplier);
});

const deleteSupplier = catchAsync(async (req, res) => {
  await supplierService.deleteSupplierById(req.params.supplierId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getAllSuppliers = catchAsync(async (req, res) => {
  const suppliers = await supplierService.getAllSuppliers();
  res.send(suppliers);
});

const getSupplierPurchaseAndTransactions = catchAsync(async (req, res) => {
  const { supplierId, startDate, endDate } = req.query;
  // Call the service to get the sales and transactions
  const results = await supplierService.getSupplierPurchaseAndTransactions(supplierId, startDate, endDate);
  res.send(results);
});



module.exports = {
  createSupplier,
  getSuppliers,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  getAllSuppliers,
  getSupplierPurchaseAndTransactions
};
