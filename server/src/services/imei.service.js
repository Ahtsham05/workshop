const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Imei, Product } = require('../models');
const ApiError = require('../utils/ApiError');

const normalizeImei = (value) => String(value || '').trim();

const historyEntry = (status, { note = '', byUserId = null, byUserName = '' } = {}) => ({
  status,
  note,
  at: new Date(),
  byUserId,
  byUserName,
});

const createImei = async (body) => {
  return Imei.create({ ...body, history: [historyEntry(body.status || 'in_stock', { byUserId: body.createdBy })] });
};

/** Used by the purchase form: returns in-stock + sold IMEIs already linked to this purchase+product, so the UI can show/edit them. */
const getImeisForPurchaseItem = async ({ purchaseId, productId, organizationId, branchId }) => {
  return Imei.find({ purchaseId, productId, organizationId, branchId });
};

/** Used by the sale form: in-stock IMEIs available to pick from for a given product. */
const getAvailableImeisForProduct = async ({ productId, organizationId, branchId, search }) => {
  const filter = { productId, organizationId, branchId, status: 'in_stock' };
  if (search && search.trim()) {
    const digits = search.replace(/\D/g, '');
    filter.imei = { $regex: digits || search.trim(), $options: 'i' };
  }
  return Imei.find(filter).sort({ createdAt: -1 }).limit(50);
};

/** Used by the product edit form: IMEIs entered directly as opening stock (not tied to any purchase invoice). */
const getOpeningStockImeisForProduct = async ({ productId, organizationId, branchId }) => {
  return Imei.find({ productId, organizationId, branchId, purchaseId: null }).sort({ createdAt: -1 });
};

/**
 * Reconciles the IMEI list for one purchase line item (or a product's opening stock,
 * when purchaseId is null) against what's already saved. Adds new numbers, removes
 * numbers the user deleted (only if still in_stock), leaves sold ones alone.
 */
const syncImeisForPurchaseItem = async ({
  purchaseId = null,
  productId,
  productName,
  imeis = [],
  purchasePrice,
  supplierId,
  supplierName,
  purchaseDate,
  organizationId,
  branchId,
  createdBy,
}) => {
  const wantedNumbers = [...new Set(imeis.map(normalizeImei).filter(Boolean))];

  const existing = await Imei.find({ purchaseId: purchaseId || null, productId, organizationId, branchId });
  const existingByNumber = new Map(existing.map((d) => [normalizeImei(d.imei), d]));

  // Remove numbers that were deleted from the form, but only if still in stock (never delete a sold record).
  const toDelete = existing.filter((d) => !wantedNumbers.includes(normalizeImei(d.imei)) && d.status === 'in_stock');
  if (toDelete.length > 0) {
    await Imei.deleteMany({ _id: { $in: toDelete.map((d) => d._id) } });
  }

  const newNumbers = wantedNumbers.filter((num) => !existingByNumber.has(num));
  if (newNumbers.length === 0) return;

  // Guard against re-adding a number that's already tracked elsewhere in this org/branch.
  const duplicates = await Imei.find({
    organizationId,
    branchId,
    imei: { $in: newNumbers },
    status: { $in: ['in_stock', 'sold'] },
  });
  if (duplicates.length > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `IMEI already exists in inventory: ${duplicates.map((d) => d.imei).join(', ')}`,
    );
  }

  await Imei.insertMany(
    newNumbers.map((imei) => ({
      organizationId,
      branchId,
      imei,
      productId,
      productName,
      purchaseId: purchaseId || null,
      purchasePrice,
      supplierId: supplierId || null,
      supplierName: supplierName || '',
      purchaseDate,
      status: 'in_stock',
      createdBy,
      history: [historyEntry('in_stock', { byUserId: createdBy, note: purchaseId ? 'Received via purchase' : 'Added as opening stock' })],
    })),
  );
};

/** Used when a purchase is deleted: drop any still-unsold IMEIs that were created for it. */
const releaseImeisForPurchase = async (purchaseId) => {
  await Imei.deleteMany({ purchaseId, status: 'in_stock' });
};

/** Keeps the IMEI tracking page in sync when a product is renamed. */
const renameProductOnImeis = async ({ productId, productName }) => {
  await Imei.updateMany({ productId }, { $set: { productName } });
};

/**
 * Used when a product is deleted: drop its still-unsold IMEIs (no sale history to lose).
 * Sold/returned/lost/stolen/scrapped IMEIs are kept — they're real historical records
 * (customer, sale price, audit trail) and must outlive the product they were sold from.
 */
const deleteInStockImeisForProduct = async (productId) => {
  await Imei.deleteMany({ productId, status: 'in_stock' });
};

/** Pre-flight check before creating/updating an invoice — ensures every selected IMEI is actually available. */
const validateImeisAvailable = async ({ items, organizationId, branchId }) => {
  for (const item of items) {
    if (!item.imeis || item.imeis.length === 0) continue;
    const numbers = item.imeis.map(normalizeImei).filter(Boolean);
    const found = await Imei.find({
      organizationId,
      branchId,
      productId: item.productId,
      imei: { $in: numbers },
      status: 'in_stock',
    });
    const foundSet = new Set(found.map((d) => normalizeImei(d.imei)));
    const missing = numbers.filter((num) => !foundSet.has(num));
    if (missing.length > 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, `IMEI not available in stock: ${missing.join(', ')}`);
    }
  }
};

/** Marks the chosen IMEIs as sold and attaches sale/customer info, for every item on an invoice. */
const markImeisSoldForInvoice = async ({ invoiceId, items, customerId, customerName, customerPhone, customerCNIC, saleDate, updatedBy, organizationId, branchId }) => {
  const effectiveSaleDate = saleDate || new Date();

  for (const item of items) {
    if (!item.imeis || item.imeis.length === 0) continue;
    const numbers = item.imeis.map(normalizeImei).filter(Boolean);

    const product = await Product.findById(item.productId).select('warrantyMonths');
    const warrantyMonths = product?.warrantyMonths || 0;
    const warrantyEndDate = warrantyMonths > 0
      ? new Date(new Date(effectiveSaleDate).setMonth(new Date(effectiveSaleDate).getMonth() + warrantyMonths))
      : null;

    await Imei.updateMany(
      { organizationId, branchId, productId: item.productId, imei: { $in: numbers }, status: 'in_stock' },
      {
        $set: {
          status: 'sold',
          invoiceId,
          salePrice: item.unitPrice,
          customerId: customerId && customerId !== 'walk-in' ? customerId : null,
          customerName: customerName || '',
          customerPhone: customerPhone || '',
          customerCNIC: customerCNIC || '',
          saleDate: effectiveSaleDate,
          warrantyMonths,
          warrantyStartDate: warrantyMonths > 0 ? effectiveSaleDate : null,
          warrantyEndDate,
          updatedBy,
        },
        $push: { history: historyEntry('sold', { byUserId: updatedBy, note: customerName ? `Sold to ${customerName}` : 'Sold' }) },
      },
    );
  }
};

/** Used when an invoice is updated/deleted: puts its IMEIs back into stock and clears sale info. */
const releaseImeisForInvoice = async (invoiceId) => {
  await Imei.updateMany(
    { invoiceId },
    {
      $set: {
        status: 'in_stock',
        invoiceId: null,
        salePrice: 0,
        customerId: null,
        customerName: '',
        customerPhone: '',
        customerCNIC: '',
        saleDate: null,
        warrantyMonths: 0,
        warrantyStartDate: null,
        warrantyEndDate: null,
      },
      $push: { history: historyEntry('in_stock', { note: 'Invoice reverted' }) },
    },
  );
};

/** Marks a device as lost or stolen, recording who reported it and why. */
const markImeiLostOrStolen = async (id, { status, reason, updatedBy }) => {
  if (!['lost', 'stolen'].includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Status must be lost or stolen');
  }
  const record = await Imei.findById(id);
  if (!record) throw new ApiError(httpStatus.NOT_FOUND, 'IMEI record not found');

  record.status = status;
  record.lostStolenAt = new Date();
  record.lostStolenReason = reason || '';
  record.updatedBy = updatedBy;
  record.history.push(historyEntry(status, { byUserId: updatedBy, note: reason || '' }));
  await record.save();
  return record;
};

const queryImeis = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (typeof queryFilter.status === 'string' && queryFilter.status.includes(',')) {
    queryFilter.status = { $in: queryFilter.status.split(',').map((s) => s.trim()).filter(Boolean) };
  }

  if (queryOptions.warrantyStatus === 'expiring_soon') {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    queryFilter.status = 'sold';
    queryFilter.warrantyEndDate = { $gte: now, $lte: in30Days };
    delete queryOptions.warrantyStatus;
  }

  if (queryOptions.search) {
    const search = String(queryOptions.search).trim();
    const digits = search.replace(/\D/g, '');
    const conditions = [];
    if (digits.length >= 2) {
      conditions.push({ imei: { $regex: digits, $options: 'i' } });
      conditions.push({ imei2: { $regex: digits, $options: 'i' } });
      conditions.push({ customerPhone: { $regex: digits, $options: 'i' } });
      conditions.push({ customerCNIC: { $regex: digits, $options: 'i' } });
    }
    if (search.length >= 2) {
      conditions.push({ brand: { $regex: search, $options: 'i' } });
      conditions.push({ model: { $regex: search, $options: 'i' } });
      conditions.push({ customerName: { $regex: search, $options: 'i' } });
      conditions.push({ supplierName: { $regex: search, $options: 'i' } });
    }
    if (conditions.length > 0) {
      queryFilter.$or = conditions;
    }
    delete queryOptions.search;
  }

  queryOptions.sortBy = queryOptions.sortBy || 'createdAt:-1';
  return Imei.paginate(queryFilter, queryOptions);
};

const getImeiById = async (id) => {
  const record = await Imei.findById(id);
  if (!record) throw new ApiError(httpStatus.NOT_FOUND, 'IMEI record not found');
  return record;
};

const getImeiByNumber = async (imei, organizationId, branchId) => {
  return Imei.findOne({ imei, organizationId, branchId });
};

const updateImei = async (id, updateBody) => {
  const record = await Imei.findById(id);
  if (!record) throw new ApiError(httpStatus.NOT_FOUND, 'IMEI record not found');

  const { status, updatedBy, notes, ...rest } = updateBody;
  Object.assign(record, rest, { updatedBy });
  if (notes !== undefined) record.notes = notes;

  if (status && status !== record.status) {
    record.status = status;
    record.history.push(historyEntry(status, { byUserId: updatedBy, note: notes || '' }));
  }

  await record.save();
  return record;
};

const deleteImei = async (id) => {
  const record = await Imei.findById(id);
  if (!record) throw new ApiError(httpStatus.NOT_FOUND, 'IMEI record not found');
  await record.deleteOne();
};

const getImeiStats = async (organizationId, branchId) => {
  const match = { organizationId: new mongoose.Types.ObjectId(organizationId), branchId: new mongoose.Types.ObjectId(branchId) };

  const stats = await Imei.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  const result = { in_stock: 0, sold: 0, returned: 0, scrapped: 0, lost: 0, stolen: 0 };
  stats.forEach((s) => { if (s._id in result) result[s._id] = s.count; });
  result.total = Object.values(result).reduce((a, b) => a + b, 0);

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [warrantyActive, warrantyExpiringSoon, warrantyExpired] = await Promise.all([
    Imei.countDocuments({ ...match, status: 'sold', warrantyEndDate: { $gt: in30Days } }),
    Imei.countDocuments({ ...match, status: 'sold', warrantyEndDate: { $gte: now, $lte: in30Days } }),
    Imei.countDocuments({ ...match, status: 'sold', warrantyEndDate: { $lt: now } }),
  ]);
  result.warrantyActive = warrantyActive;
  result.warrantyExpiringSoon = warrantyExpiringSoon;
  result.warrantyExpired = warrantyExpired;

  return result;
};

module.exports = {
  createImei,
  queryImeis,
  getImeiById,
  getImeiByNumber,
  updateImei,
  deleteImei,
  getImeiStats,
  getImeisForPurchaseItem,
  getAvailableImeisForProduct,
  getOpeningStockImeisForProduct,
  syncImeisForPurchaseItem,
  releaseImeisForPurchase,
  renameProductOnImeis,
  deleteInStockImeisForProduct,
  validateImeisAvailable,
  markImeisSoldForInvoice,
  releaseImeisForInvoice,
  markImeiLostOrStolen,
};
