const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Imei } = require('../models');
const ApiError = require('../utils/ApiError');

const normalizeImei = (value) => String(value || '').trim();

const createImei = async (body) => {
  return Imei.create(body);
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
    })),
  );
};

/** Used when a purchase is deleted: drop any still-unsold IMEIs that were created for it. */
const releaseImeisForPurchase = async (purchaseId) => {
  await Imei.deleteMany({ purchaseId, status: 'in_stock' });
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
  for (const item of items) {
    if (!item.imeis || item.imeis.length === 0) continue;
    const numbers = item.imeis.map(normalizeImei).filter(Boolean);
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
          saleDate: saleDate || new Date(),
          updatedBy,
        },
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
      },
    },
  );
};

const queryImeis = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

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
  Object.assign(record, updateBody);
  await record.save();
  return record;
};

const deleteImei = async (id) => {
  const record = await Imei.findById(id);
  if (!record) throw new ApiError(httpStatus.NOT_FOUND, 'IMEI record not found');
  await record.deleteOne();
};

const getImeiStats = async (organizationId, branchId) => {
  const stats = await Imei.aggregate([
    { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), branchId: new mongoose.Types.ObjectId(branchId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const result = { in_stock: 0, sold: 0, returned: 0, scrapped: 0 };
  stats.forEach((s) => { if (s._id in result) result[s._id] = s.count; });
  result.total = Object.values(result).reduce((a, b) => a + b, 0);
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
  validateImeisAvailable,
  markImeisSoldForInvoice,
  releaseImeisForInvoice,
};
