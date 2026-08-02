const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { Imei, Product, Purchase } = require('../models');
const ApiError = require('../utils/ApiError');
const purchaseService = require('./purchase.service');
const invoiceService = require('./invoice.service');

/**
 * New Phones reuses the generic Product/Purchase/Invoice/Imei system (each phone model
 * is a real catalog Product with trackImei: true) rather than a bespoke table like
 * PhoneBuyback — see phoneBuyback.service.js's getUsedPhoneStats for the used-phones
 * equivalent, which aggregates over a single shared "Used Phones" bucket product instead.
 * Scoping to trackImei products keeps this from picking up unrelated serialized
 * inventory (laptops, appliances) that also uses the Imei collection.
 */
// `in_stock`/`capitalInStock` are always a live snapshot; a date range — when given —
// narrows `sold`/`soldRevenue`/`soldCost`/`soldProfit` to units sold within it (by
// saleDate), mirroring phoneBuyback.service.js#getUsedPhoneStats's same convention.
const getNewPhoneStats = async (organizationId, branchId, { dateFrom, dateTo } = {}) => {
  const orgId = new mongoose.Types.ObjectId(organizationId);
  const branch = new mongoose.Types.ObjectId(branchId);

  const phoneProductIds = await Product.find({
    organizationId: orgId,
    branchId: branch,
    trackImei: true,
  }).distinct('_id');

  const match = {
    organizationId: orgId,
    branchId: branch,
    productId: { $in: phoneProductIds },
    acquisitionType: 'supplier_purchase',
  };

  const saleDateFilter = {};
  if (dateFrom) saleDateFilter.$gte = new Date(dateFrom);
  if (dateTo) saleDateFilter.$lte = new Date(dateTo);
  const soldMatch = Object.keys(saleDateFilter).length > 0
    ? { ...match, status: 'sold', saleDate: saleDateFilter }
    : { ...match, status: 'sold' };

  const [nonSoldByStatus, soldCount, investedAgg, profitAgg] = await Promise.all([
    Imei.aggregate([{ $match: { ...match, status: { $ne: 'sold' } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Imei.countDocuments(soldMatch),
    Imei.aggregate([
      { $match: { ...match, status: 'in_stock' } },
      { $group: { _id: null, total: { $sum: '$purchasePrice' } } },
    ]),
    Imei.aggregate([
      { $match: soldMatch },
      { $group: { _id: null, revenue: { $sum: '$salePrice' }, cost: { $sum: '$purchasePrice' } } },
    ]),
  ]);

  const statusCounts = { in_stock: 0, sold: soldCount, returned: 0, scrapped: 0, lost: 0, stolen: 0 };
  nonSoldByStatus.forEach((s) => { if (s._id in statusCounts) statusCounts[s._id] = s.count; });

  const profitRow = profitAgg[0] || { revenue: 0, cost: 0 };

  return {
    ...statusCounts,
    totalUnits: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    capitalInStock: investedAgg[0]?.total || 0,
    soldRevenue: profitRow.revenue,
    soldCost: profitRow.cost,
    soldProfit: profitRow.revenue - profitRow.cost,
  };
};

/**
 * Buying/selling new phones is just the generic Purchase/Invoice flow underneath (see
 * getNewPhoneStats above) — these wrappers exist purely so the New Phones feature has its
 * own permissions (buyNewPhones/sellNewPhones/deleteNewPhones) instead of silently riding
 * on the generic createPurchases/createInvoices, which would let anyone with regular
 * purchasing/selling rights bypass a New Phones-specific permission grant.
 */
const createNewPhonePurchase = async (body) => purchaseService.createPurchase(body);

const createNewPhoneSale = async (body, userId) => invoiceService.createInvoice(body, userId);

/** Only reversible while the unit is still in stock, mirroring phoneBuyback.service.js's
 *  deleteBuyback rule for Old Phones — the generic purchase-deletion path unconditionally
 *  reverses the product's stock count, which would double-count if the unit had already
 *  been sold (selling it already adjusted stock once). */
const deleteNewPhonePurchase = async ({ purchaseId, organizationId }) => {
  const purchase = await Purchase.findOne({ _id: purchaseId, organizationId });
  if (!purchase) throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');

  const soldUnit = await Imei.findOne({ purchaseId, status: { $ne: 'in_stock' } });
  if (soldUnit) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete — this phone has already been sold');
  }

  return purchaseService.deletePurchaseById(purchaseId);
};

module.exports = {
  getNewPhoneStats,
  createNewPhonePurchase,
  createNewPhoneSale,
  deleteNewPhonePurchase,
};
