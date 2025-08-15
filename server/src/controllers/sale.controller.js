const httpStatus = require('http-status');
const { saleService } = require('../services');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');

const createSale = catchAsync(async (req, res) => {
  const lastSale = await saleService.querySales({}, { limit: 1, page: 1, sortBy: 'invoiceNumber:desc' });

  const lastInvoiceNumber = lastSale?.results && lastSale?.results?.length > 0 ? parseInt(lastSale?.results[0]?.invoiceNumber.replace('INV-', '')) : 5000; // Default to 5000 if no previous sales
  const newInvoiceNumber = `INV-${lastInvoiceNumber + 1}`;

  const newSaleData = {
    ...req.body,
    invoiceNumber: newInvoiceNumber,
  };

  const sale = await saleService.createSale(newSaleData);

  res.status(httpStatus.CREATED).send(sale);
});

const getInvoiceNumber = catchAsync(async (req, res) => {
  const lastSale = await saleService.querySales({}, { limit: 1, page: 1, sortBy: 'invoiceNumber:desc' });

  const lastInvoiceNumber = lastSale?.results && lastSale?.results?.length > 0 ? parseInt(lastSale?.results[0]?.invoiceNumber.replace('INV-', '')) : 5000; // Default to 5000 if no previous sales
  const newInvoiceNumber = `INV-${lastInvoiceNumber + 1}`;
  res.send({ invoiceNumber: newInvoiceNumber });
});

const getSales = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['customer', 'saleDate']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await saleService.querySales(filter, options);
  res.send(result);
});

const getSale = catchAsync(async (req, res) => {
  const sale = await saleService.getSaleById(req.params.saleId);
  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }
  res.send(sale);
});

const updateSale = catchAsync(async (req, res) => {
  const sale = await saleService.updateSaleById(req.params.saleId, req.body);
  res.send(sale);
});

const deleteSale = catchAsync(async (req, res) => {
  await saleService.deleteSaleById(req.params.saleId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getSaleByDate = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['startDate', 'endDate']);
  const sale = await saleService.getSaleByDate(filter);
  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }
  res.send(sale);
});


module.exports = {
  createSale,
  getSales,
  getSale,
  updateSale,
  deleteSale,
  getSaleByDate,
  getInvoiceNumber,
};
