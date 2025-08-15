const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { purchaseService } = require('../services');
const pick = require('../utils/pick');

const createPurchase = catchAsync(async (req, res) => {
  // Fetch the last purchase invoice (assuming 'purchase' model has 'invoiceNumber' field)
  const lastPurchase = await purchaseService.queryPurchases({}, { limit: 1, page: 1, sortBy: 'invoiceNumber:desc' });

  // Get the last invoice number and increment it
  const lastInvoiceNumber = lastPurchase?.results && lastPurchase?.results?.length > 0 ? parseInt(lastPurchase?.results[0]?.invoiceNumber.replace('INV-', '')) : 5000; // Default to 5000 if no previous purchases

  const newInvoiceNumber = `INV-${lastInvoiceNumber + 1}`; // Generate the new invoice number

  // Prepare the data for the new purchase with the updated invoice number
  const newPurchaseData = {
    ...req.body,
    invoiceNumber: newInvoiceNumber, // Add the incremented invoice number
  };

  // Create the new purchase with the updated invoice number
  const purchase = await purchaseService.createPurchase(newPurchaseData);

  // Send the response with the created purchase
  res.status(httpStatus.CREATED).send(purchase);
});

const getPurchases = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['supplier', 'purchaseDate']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await purchaseService.queryPurchases(filter, options);
  res.send(result);
});

const getPurchase = catchAsync(async (req, res) => {
  const purchase = await purchaseService.getPurchaseById(req.params.purchaseId);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }
  res.send(purchase);
});

const updatePurchase = catchAsync(async (req, res) => {
  const purchase = await purchaseService.updatePurchaseById(req.params.purchaseId, req.body);
  res.send(purchase);
});

const deletePurchase = catchAsync(async (req, res) => {
  await purchaseService.deletePurchaseById(req.params.purchaseId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getPurchaseByDate = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['startDate', 'endDate']);
  const purchase = await purchaseService.getPurchaseByDate(filter);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }
  res.send(purchase);
});

module.exports = {
  createPurchase,
  getPurchases,
  getPurchase,
  updatePurchase,
  deletePurchase,
  getPurchaseByDate
};
