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

/** Mirrors purchase.controller.js#createPurchase's invoice-number retry loop — the
 *  invoiceNumber is generated server-side and can rarely collide under concurrent buys. */
const createPurchase = catchAsync(async (req, res) => {
  const MAX_RETRIES = 3;
  let purchase;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const body = {
      ...req.body,
      invoiceNumber: await purchaseService.generateNextPurchaseInvoiceNumber(),
      ...getBranchContext(req),
    };
    try {
      purchase = await newPhoneService.createNewPhonePurchase(body);
      break;
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.invoiceNumber && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }

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
