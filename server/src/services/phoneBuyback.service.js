const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { PhoneBuyback, Imei, Product, CustomerLedger } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const walletEntryService = require('./walletEntry.service');
const inventorySyncService = require('./inventorySync.service');
const invoiceService = require('./invoice.service');
const { matchesEitherImei } = require('./imei.service');

const USED_PHONES_PRODUCT_NAME = 'Used Phones';

const normalizeImei = (value) => String(value || '').trim();

const LEDGER_PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  bank: 'Bank Transfer',
};

const resolveLedgerPaymentMethod = (paymentMethod, walletType) => {
  if (paymentMethod === 'wallet') {
    return walletType ? `Wallet (${walletType})` : 'Wallet';
  }
  return LEDGER_PAYMENT_METHOD_LABELS[paymentMethod] || 'Cash';
};

/**
 * Records the buyback on the seller's Customer Ledger when they're a linked
 * Customer (not a walk-in) — otherwise there's no account to post to. Posted
 * as a single debit=credit=agreedPrice 'purchase' row (net balance effect
 * zero), the same "paid in full" shape buildCustomerSaleLedgerEntries uses
 * for a fully-settled cash Sale, just mirrored: we're buying FROM them, not
 * selling TO them, and we pay in full immediately (buybacks have no partial/
 * credit concept yet), so nothing is ever left outstanding either way.
 *
 * Uses a raw CustomerLedger.create — not customerLedgerService.createLedgerEntry
 * — deliberately: that helper auto-syncs its own Cash Book/Wallet entry, which
 * would double-post the cash movement already recorded above by this file
 * (referenceModel: 'PhoneBuyback'). This mirrors salesReturn.service.js's
 * _createCustomerLedgerEntry, which avoids the same helper for the same reason.
 * Best-effort: a ledger failure must not fail the buyback itself.
 */
const postBuybackToCustomerLedger = async (buyback) => {
  if (!buyback.sellerCustomerId) return;
  try {
    const lastEntry = await CustomerLedger.findOne({ customer: buyback.sellerCustomerId })
      .sort({ transactionDate: -1, createdAt: -1 })
      .select('balance');
    const currentBalance = lastEntry ? lastEntry.balance : 0;

    await CustomerLedger.create({
      organizationId: buyback.organizationId,
      branchId: buyback.branchId,
      customer: buyback.sellerCustomerId,
      transactionType: 'purchase',
      transactionDate: buyback.buybackDate,
      reference: buyback.imei,
      referenceId: buyback._id,
      description: `Bought ${[buyback.brand, buyback.model].filter(Boolean).join(' ') || 'phone'} (${buyback.imei}) from ${buyback.sellerName}`,
      debit: buyback.agreedPrice,
      credit: buyback.agreedPrice,
      balance: currentBalance,
      paymentMethod: resolveLedgerPaymentMethod(buyback.paymentMethod, buyback.walletType),
      notes: `Paid in full: Rs${Number(buyback.agreedPrice).toFixed(2)}`,
      createdBy: buyback.createdBy,
    });
  } catch (error) {
    // Don't fail the buyback if the ledger entry fails — mirrors purchase.service.js's
    // supplier-ledger try/catch for the same reason.
    console.error('Failed to create customer ledger entry for buyback:', buyback._id, error.message);
  }
};

/**
 * Every bought-back unit is linked to one shared catalog Product per
 * organization/branch (created lazily on first use) — the same pattern the
 * generic Imei/IMEI-tracking feature already relies on for per-unit pricing:
 * the real brand/model/price live on the Imei record, not the Product.
 */
const getOrCreateUsedPhonesProduct = async ({ organizationId, branchId, createdBy }) => {
  let product = await Product.findOne({ organizationId, branchId, name: USED_PHONES_PRODUCT_NAME });
  if (product) return product;

  product = await Product.create({
    organizationId,
    branchId,
    createdBy,
    name: USED_PHONES_PRODUCT_NAME,
    description: 'Catalog entry for individually-tracked used/old mobile phones bought from customers.',
    price: 0,
    cost: 0,
    stockQuantity: 0,
    category: 'Used Phones',
    trackImei: true,
  });
  return product;
};

const assertImeiAvailable = async ({ imei, imei2, organizationId, branchId }) => {
  const normalizedImei = normalizeImei(imei);
  const normalizedImei2 = normalizeImei(imei2);
  if (normalizedImei2 && normalizedImei2 === normalizedImei) {
    throw new ApiError(httpStatus.BAD_REQUEST, `IMEI and IMEI 2 cannot be the same number: ${normalizedImei}`);
  }
  const numbers = [normalizedImei, normalizedImei2].filter(Boolean);
  const duplicates = await Imei.find({
    organizationId,
    branchId,
    ...matchesEitherImei(numbers),
    status: { $in: ['in_stock', 'sold'] },
  });
  if (duplicates.length > 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, `IMEI already exists in inventory: ${duplicates.map((d) => d.imei).join(', ')}`);
  }
};

/**
 * Buys one used phone from a seller: creates its per-unit Imei record (with
 * condition/grading), bumps the shared "Used Phones" product's stock, and
 * pays the seller out through Cash Book / Wallet — mirroring how
 * purchase.service.js pays a Supplier, but for an individual seller instead.
 */
const createBuyback = async (body) => {
  const {
    organizationId,
    branchId,
    createdBy,
    sellerType = 'walkin',
    sellerCustomerId = null,
    sellerName,
    sellerPhone = '',
    sellerCNIC = '',
    sellerIdCardFront,
    sellerIdCardBack,
    imei,
    imei2 = '',
    brand = '',
    model = '',
    color = '',
    storage = '',
    condition = {},
    agreedPrice,
    askingPrice = 0,
    paymentMethod = 'cash',
    walletType,
    buybackDate,
    isTradeIn = false,
    tradeInInvoiceId = null,
    notes = '',
  } = body;

  if (sellerType === 'customer' && !sellerCustomerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'sellerCustomerId is required when sellerType is customer');
  }

  await assertImeiAvailable({ imei, imei2, organizationId, branchId });

  const product = await getOrCreateUsedPhonesProduct({ organizationId, branchId, createdBy });
  const effectiveDate = buybackDate || new Date();

  const imeiRecord = await Imei.create({
    organizationId,
    branchId,
    type: 'imei',
    imei: normalizeImei(imei),
    imei2: normalizeImei(imei2),
    productId: product._id,
    productName: product.name,
    brand,
    model,
    color,
    storage,
    status: 'in_stock',
    acquisitionType: isTradeIn ? 'trade_in' : 'buyback',
    purchasePrice: agreedPrice,
    askingPrice,
    sellerCustomerId: sellerType === 'customer' ? sellerCustomerId : null,
    sellerName,
    sellerPhone,
    sellerCNIC,
    sellerIdCardFront,
    sellerIdCardBack,
    purchaseDate: effectiveDate,
    condition,
    createdBy,
    history: [{
      status: 'in_stock',
      note: `Bought from ${sellerName}${isTradeIn ? ' (trade-in)' : ''}`,
      at: new Date(),
      byUserId: createdBy,
    }],
  });

  product.stockQuantity += 1;
  await product.save();

  inventorySyncService
    .recordStockChange({
      organizationId,
      productId: product._id,
      quantityDelta: 1,
      type: 'purchase',
      refType: 'PhoneBuyback',
      refId: imeiRecord._id,
      unitCost: agreedPrice,
      createdBy,
    })
    .catch(() => {});

  const buyback = await PhoneBuyback.create({
    organizationId,
    branchId,
    sellerType,
    sellerCustomerId: sellerType === 'customer' ? sellerCustomerId : null,
    sellerName,
    sellerPhone,
    sellerCNIC,
    sellerIdCardFront,
    sellerIdCardBack,
    imeiRecordId: imeiRecord._id,
    productId: product._id,
    imei: normalizeImei(imei),
    brand,
    model,
    color,
    storage,
    agreedPrice,
    askingPrice,
    paymentMethod,
    walletType,
    buybackDate: effectiveDate,
    isTradeIn,
    tradeInInvoiceId,
    notes,
    createdBy,
  });

  imeiRecord.buybackId = buyback._id;
  await imeiRecord.save();

  if (paymentMethod !== 'wallet' && agreedPrice > 0) {
    await cashBookService.upsertReferenceEntry({
      organizationId,
      branchId,
      type: 'expense',
      source: 'used_phone_buyback',
      amount: agreedPrice,
      paymentMethod: paymentMethod === 'bank' ? 'bank' : 'cash',
      referenceId: buyback._id,
      referenceModel: 'PhoneBuyback',
      description: `Bought ${[brand, model].filter(Boolean).join(' ') || 'phone'} (${buyback.imei}) from ${sellerName}`,
      date: effectiveDate,
      createdBy,
    });
  }

  if (paymentMethod === 'wallet' && walletType && agreedPrice > 0) {
    await walletEntryService.syncWalletPayment({
      organizationId,
      branchId,
      referenceId: buyback._id,
      referenceModel: 'PhoneBuyback',
      direction: 'out',
      amount: agreedPrice,
      paymentMethod: 'wallet',
      walletType,
      description: `Wallet payment for buyback of ${buyback.imei} from ${sellerName}`,
      date: effectiveDate,
      createdBy,
    });
  }

  await postBuybackToCustomerLedger(buyback);

  return buyback;
};

const queryBuybacks = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (queryOptions.dateFrom || queryOptions.dateTo) {
    queryFilter.buybackDate = {};
    if (queryOptions.dateFrom) queryFilter.buybackDate.$gte = new Date(queryOptions.dateFrom);
    if (queryOptions.dateTo) queryFilter.buybackDate.$lte = new Date(queryOptions.dateTo);
    delete queryOptions.dateFrom;
    delete queryOptions.dateTo;
  }

  if (queryOptions.search) {
    const search = String(queryOptions.search).trim();
    const digits = search.replace(/\D/g, '');
    const conditions = [];
    if (digits.length >= 2) {
      conditions.push({ imei: { $regex: digits, $options: 'i' } });
      conditions.push({ sellerPhone: { $regex: digits, $options: 'i' } });
      conditions.push({ sellerCNIC: { $regex: digits, $options: 'i' } });
      // PhoneBuyback only denormalizes the primary imei — a dual-SIM unit's second
      // number lives on its linked Imei record, so resolve matches there too.
      const imei2Matches = await Imei.find({ imei2: { $regex: digits, $options: 'i' }, buybackId: { $ne: null } })
        .select('buybackId')
        .lean();
      if (imei2Matches.length > 0) {
        conditions.push({ _id: { $in: imei2Matches.map((m) => m.buybackId) } });
      }
    }
    if (search.length >= 2) {
      conditions.push({ sellerName: { $regex: search, $options: 'i' } });
      conditions.push({ brand: { $regex: search, $options: 'i' } });
      conditions.push({ model: { $regex: search, $options: 'i' } });
    }
    if (conditions.length > 0) queryFilter.$or = conditions;
    delete queryOptions.search;
  }

  queryOptions.sortBy = queryOptions.sortBy || 'buybackDate:-1';
  queryOptions.populate = 'imeiRecordId,sellerCustomerId';
  return PhoneBuyback.paginate(queryFilter, queryOptions);
};

const getBuybackById = async (id) => {
  const buyback = await PhoneBuyback.findById(id).populate('imeiRecordId').populate('sellerCustomerId');
  if (!buyback) throw new ApiError(httpStatus.NOT_FOUND, 'Buyback record not found');
  return buyback;
};

/**
 * Edits are restricted to the commercial/grading details of a unit that
 * hasn't sold yet — once an Imei is 'sold', its buyback record becomes a
 * historical receipt and only notes remain editable.
 */
const updateBuyback = async (id, updateBody) => {
  const buyback = await PhoneBuyback.findById(id);
  if (!buyback) throw new ApiError(httpStatus.NOT_FOUND, 'Buyback record not found');

  const imeiRecord = await Imei.findById(buyback.imeiRecordId);
  const isSold = imeiRecord && imeiRecord.status !== 'in_stock';

  const { notes, askingPrice, condition, updatedBy, ...rest } = updateBody;

  if (!isSold) {
    if (askingPrice !== undefined) {
      buyback.askingPrice = askingPrice;
      if (imeiRecord) imeiRecord.askingPrice = askingPrice;
    }
    Object.assign(buyback, rest);
    if (condition && imeiRecord) {
      imeiRecord.condition = { ...imeiRecord.condition?.toObject?.(), ...condition };
    }
  } else if (Object.keys(rest).length > 0 || askingPrice !== undefined || condition) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This unit has already been sold — only notes can be edited');
  }

  if (notes !== undefined) buyback.notes = notes;
  buyback.updatedBy = updatedBy;
  await buyback.save();
  if (imeiRecord) {
    imeiRecord.updatedBy = updatedBy;
    await imeiRecord.save();
  }

  return buyback;
};

/** Only reversible while the unit is still in stock — a sold unit's payout is history. */
const deleteBuyback = async (id, { updatedBy } = {}) => {
  const buyback = await PhoneBuyback.findById(id);
  if (!buyback) throw new ApiError(httpStatus.NOT_FOUND, 'Buyback record not found');

  const imeiRecord = await Imei.findById(buyback.imeiRecordId);
  if (imeiRecord && imeiRecord.status !== 'in_stock') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete a buyback once the unit has been sold');
  }

  const product = await Product.findById(buyback.productId);
  if (product) {
    product.stockQuantity = Math.max(0, product.stockQuantity - 1);
    await product.save();
    inventorySyncService
      .recordStockChange({
        organizationId: buyback.organizationId,
        productId: product._id,
        quantityDelta: -1,
        type: 'adjustment',
        refType: 'PhoneBuyback',
        refId: buyback._id,
        createdBy: updatedBy,
      })
      .catch(() => {});
  }

  if (imeiRecord) await imeiRecord.deleteOne();

  // Safe to delete outright, no balance recalculation needed elsewhere: this row's
  // debit always equals its credit (see postBuybackToCustomerLedger), so it never
  // shifted the customer's running balance in the first place.
  if (buyback.sellerCustomerId) {
    await CustomerLedger.deleteMany({ referenceId: buyback._id, customer: buyback.sellerCustomerId });
  }

  await cashBookService.deleteEntriesByReference(buyback._id, 'PhoneBuyback');
  await walletEntryService.reverseWalletPayment({
    organizationId: buyback.organizationId,
    branchId: buyback.branchId,
    referenceId: buyback._id,
    referenceModel: 'PhoneBuyback',
    direction: 'out',
    amount: buyback.agreedPrice,
    paymentMethod: buyback.paymentMethod,
    walletType: buyback.walletType,
    userId: updatedBy,
  });

  await buyback.deleteOne();
  return buyback;
};

/**
 * `in_stock`/`capitalInStock` are always a live snapshot (what's on the shelf right now
 * has no "date range" of its own). `sold`/`soldRevenue`/`soldCost`/`soldProfit` are the
 * one part of this that genuinely happened at a point in time, so a date range — when
 * given — narrows those to units sold within it (by saleDate), letting the same stat
 * cards answer "how's my resale business doing this week/month" instead of only ever
 * showing all-time totals.
 */
const getUsedPhoneStats = async (organizationId, branchId, { dateFrom, dateTo } = {}) => {
  const match = {
    organizationId: new mongoose.Types.ObjectId(organizationId),
    branchId: new mongoose.Types.ObjectId(branchId),
    acquisitionType: { $in: ['buyback', 'trade_in'] },
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
 * Reselling a used phone is just the generic Invoice flow underneath — the unit is a
 * regular Imei record (acquisitionType: 'buyback') under the shared "Used Phones" bucket
 * product, and Invoice creation already knows how to match/sell an Imei by either IMEI
 * slot. This wrapper exists purely so Old Phones has its own sellUsedPhones permission
 * (mirrors newPhone.service.js#createNewPhoneSale) instead of silently riding on the
 * generic createInvoices permission, which would let anyone with regular selling rights
 * resell a used phone without an Old-Phones-specific grant.
 */
const createUsedPhoneSale = async (body, userId) => invoiceService.createInvoice(body, userId);

module.exports = {
  getOrCreateUsedPhonesProduct,
  createBuyback,
  queryBuybacks,
  getBuybackById,
  updateBuyback,
  deleteBuyback,
  getUsedPhoneStats,
  createUsedPhoneSale,
};
