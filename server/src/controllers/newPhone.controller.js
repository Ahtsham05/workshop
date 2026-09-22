const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { newPhoneService, purchaseService } = require('../services');
const { getBranchContext } = require('../utils/branchFilter');

const getStats = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const stats = await newPhoneService.getNewPhoneStats(organizationId, branchId, pick(req.query, ['dateFrom', 'dateTo']));
  res.send(stats);
});

// invoiceNumber is generated server-side from this org's own customizable purchase sequence
// (see documentNumbering.service.js, which already guards against colliding with any
// manually-entered number elsewhere in the app).
const createPurchase = catchAsync(async (req, res) => {
  const body = {
    ...req.body,
    invoiceNumber: await purchaseService.generateNextPurchaseInvoiceNumber(req.organizationId, req.branchId),
    ...getBranchContext(req),
  };
  const purchase = await newPhoneService.createNewPhonePurchase(body);

  res.status(httpStatus.CREATED).send(purchase);
});

const createSale = catchAsync(async (req, res) => {
  const invoice = await newPhoneService.createNewPhoneSale({ ...req.body, ...getBranchContext(req) }, req.user.id);
  res.status(httpStatus.CREATED).send(invoice);
});

const deletePurchase = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  await newPhoneService.deleteNewPhonePurchase({ purchaseId: req.params.purchaseId, organizationId });
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = { getStats, createPurchase, createSale, deletePurchase };
