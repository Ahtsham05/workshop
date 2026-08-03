const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Imei, Product } = require('../models');
const ApiError = require('../utils/ApiError');

const normalizeImei = (value) => String(value || '').trim();

/** Matches a unit by either of its two IMEI slots — a dual-SIM phone can be scanned,
 *  searched, sold, adjusted, or transferred using whichever of its two numbers the
 *  person handling it has in front of them; both must resolve to the same unit. */
const matchesEitherImei = (numbers) => ({ $or: [{ imei: { $in: numbers } }, { imei2: { $in: numbers } }] });

/** Every IMEI value (both slots) present among the given records — used to check
 *  whether a scanned number was actually found, regardless of which slot it matched.
 *  (A plain `records.map(r => r.imei)` would miss a number that only matched imei2.) */
const collectImeiNumbers = (records) =>
  new Set(records.flatMap((r) => [normalizeImei(r.imei), normalizeImei(r.imei2)].filter(Boolean)));

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

/**
 * Used by the sale form: in-stock IMEIs available to pick from for a given product.
 * When `batchId` (single batch) or `batchIds` (a line split across several batches) is
 * given, only units from those batches — plus units with no recorded batch (opening
 * stock, or purchased before serial-batch linking existed) — are offered, so picking a
 * batch narrows the list instead of always showing every in-stock unit of the product
 * regardless of which batch it actually belongs to.
 */
const getAvailableImeisForProduct = async ({ productId, organizationId, branchId, search, batchId, batchIds }) => {
  const filter = { productId, organizationId, branchId, status: 'in_stock' };
  // Batch narrowing and IMEI search are each their own $or — combined under $and so
  // neither clobbers the other (a bare second `filter.$or = ...` would overwrite the first).
  const andConditions = [];
  const ids = [...new Set([...(batchIds || []), ...(batchId ? [batchId] : [])].map(String).filter(Boolean))];
  if (ids.length > 0) {
    andConditions.push({ $or: [{ batchId: null }, { batchId: { $in: ids } }] });
  }
  if (search && search.trim()) {
    const digits = search.replace(/\D/g, '');
    const term = digits || search.trim();
    andConditions.push({ $or: [{ imei: { $regex: term, $options: 'i' } }, { imei2: { $regex: term, $options: 'i' } }] });
  }
  if (andConditions.length > 0) filter.$and = andConditions;
  return Imei.find(filter).sort({ createdAt: -1 }).limit(50);
};

/** Used by the product edit form: IMEIs entered directly as opening stock (not tied to any purchase invoice). */
const getOpeningStockImeisForProduct = async ({ productId, organizationId, branchId }) => {
  return Imei.find({ productId, organizationId, branchId, purchaseId: null }).sort({ createdAt: -1 });
};

/** Each imeis[] entry is either a plain IMEI string, or a { imei, imei2 } pair for
 *  dual-SIM phones — normalized to a consistent shape before anything else runs. */
const normalizeImeiEntry = (entry) => {
  if (entry && typeof entry === 'object') {
    return { imei: normalizeImei(entry.imei), imei2: normalizeImei(entry.imei2) };
  }
  return { imei: normalizeImei(entry), imei2: '' };
};

/** Splits a possibly-mixed imeis[] array (used on both Purchase and Invoice line items)
 *  into the primary number of each entry — one per unit, for "how many were requested"
 *  checks — and the full flattened set of every number across both slots, for the actual
 *  $in match via matchesEitherImei so either slot finds the unit. */
const extractSearchNumbers = (imeis = []) => {
  const entries = imeis.map(normalizeImeiEntry).filter((e) => e.imei);
  const primary = entries.map((e) => e.imei);
  const all = [...new Set([...primary, ...entries.map((e) => e.imei2).filter(Boolean)])];
  return { primary, all };
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
  type = 'imei',
  batchId = null,
  purchasePrice,
  supplierId,
  supplierName,
  purchaseDate,
  organizationId,
  branchId,
  createdBy,
  session,
}) => {
  const entries = imeis.map(normalizeImeiEntry).filter((e) => e.imei);

  // Every number across this batch — a phone's own imei/imei2, and every other phone's —
  // must be pairwise distinct. Without this, entering the same number twice (e.g. as one
  // phone's imei2 and another phone's imei) goes undetected here, since the only other
  // check below compares against already-committed DB records — nothing catches a
  // collision between two entries submitted together in the same batch. Left unguarded,
  // dual-SIM matching (matchesEitherImei) then treats the two different phones as the
  // same unit, so selling one silently marks the other sold too.
  const seenInBatch = new Set();
  for (const entry of entries) {
    if (entry.imei2 && entry.imei2 === entry.imei) {
      throw new ApiError(httpStatus.BAD_REQUEST, `IMEI and IMEI 2 cannot be the same number: ${entry.imei}`);
    }
    for (const num of [entry.imei, entry.imei2].filter(Boolean)) {
      if (seenInBatch.has(num)) {
        throw new ApiError(httpStatus.BAD_REQUEST, `The same IMEI was entered for two different phones: ${num}`);
      }
      seenInBatch.add(num);
    }
  }

  const wantedNumbers = [...new Set(entries.map((e) => e.imei))];
  const entryByImei = new Map(entries.map((e) => [e.imei, e]));

  const existing = await Imei.find({ purchaseId: purchaseId || null, productId, organizationId, branchId }).session(session || null);
  const existingByNumber = new Map(existing.map((d) => [normalizeImei(d.imei), d]));

  // Remove numbers that were deleted from the form, but only if still in stock (never delete a sold record).
  const toDelete = existing.filter((d) => !wantedNumbers.includes(normalizeImei(d.imei)) && d.status === 'in_stock');
  if (toDelete.length > 0) {
    await Imei.deleteMany({ _id: { $in: toDelete.map((d) => d._id) } }, { session });
  }

  const newNumbers = wantedNumbers.filter((num) => !existingByNumber.has(num));
  if (newNumbers.length === 0) return;

  // Guard against re-adding a number that's already tracked elsewhere in this org/branch — on
  // either IMEI slot, since a dual-SIM unit's second number must be just as unique as its
  // first. This check — and every write below — must run inside the caller's transaction (when
  // given): a duplicate found here throws, and the whole create (Product or Purchase) must roll
  // back instead of leaving a persisted record behind with no serials synced to it.
  const newImei2Numbers = newNumbers.map((num) => entryByImei.get(num)?.imei2).filter(Boolean);
  const allNewNumbers = [...new Set([...newNumbers, ...newImei2Numbers])];
  const duplicates = await Imei.find({
    organizationId,
    branchId,
    status: { $in: ['in_stock', 'sold'] },
    $or: [{ imei: { $in: allNewNumbers } }, { imei2: { $in: allNewNumbers } }],
  }).session(session || null);
  if (duplicates.length > 0) {
    const label = type === 'serial' ? 'Serial number' : 'IMEI';
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${label} already exists in inventory: ${duplicates.map((d) => d.imei).join(', ')}`,
    );
  }

  await Imei.insertMany(
    newNumbers.map((imei) => ({
      organizationId,
      branchId,
      imei,
      imei2: entryByImei.get(imei)?.imei2 || '',
      type,
      productId,
      productName,
      purchaseId: purchaseId || null,
      batchId: batchId || null,
      purchasePrice,
      supplierId: supplierId || null,
      supplierName: supplierName || '',
      purchaseDate,
      status: 'in_stock',
      createdBy,
      history: [historyEntry('in_stock', { byUserId: createdBy, note: purchaseId ? 'Received via purchase' : 'Added as opening stock' })],
    })),
    { session },
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
    const { primary: numbers, all: searchNumbers } = extractSearchNumbers(item.imeis);
    const found = await Imei.find({
      organizationId,
      branchId,
      productId: item.productId,
      ...matchesEitherImei(searchNumbers),
      status: 'in_stock',
    });
    const foundSet = collectImeiNumbers(found);
    const missing = numbers.filter((num) => !foundSet.has(num));
    if (missing.length > 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, `IMEI/Serial number not available in stock: ${missing.join(', ')}`);
    }

    // Catch a genuine batch mismatch (the unit's recorded batch differs from every batch
    // picked on this line — a single batch, or the several a split line draws from) —
    // units with no recorded batch (legacy/opening stock) are never rejected, only ones
    // that are *known* to belong to a different batch.
    const allowedBatchIds = Array.isArray(item.batchAllocations) && item.batchAllocations.length > 0
      ? item.batchAllocations.map((a) => String(a.batchId))
      : item.batchId ? [String(item.batchId)] : [];
    if (allowedBatchIds.length > 0) {
      const mismatched = found.filter((d) => d.batchId && !allowedBatchIds.includes(String(d.batchId)));
      if (mismatched.length > 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Serial number(s) ${mismatched.map((d) => d.imei).join(', ')} belong to a different batch than the one selected for ${item.name || 'this item'}`
        );
      }
    }
  }
};

/** Marks the chosen IMEIs as sold and attaches sale/customer info, for every item on an invoice. */
const markImeisSoldForInvoice = async ({ invoiceId, items, customerId, customerName, customerPhone, customerCNIC, saleDate, updatedBy, organizationId, branchId }) => {
  const effectiveSaleDate = saleDate || new Date();

  for (const item of items) {
    if (!item.imeis || item.imeis.length === 0) continue;
    const { all: searchNumbers } = extractSearchNumbers(item.imeis);

    const product = await Product.findById(item.productId).select('warrantyMonths');
    const warrantyMonths = product?.warrantyMonths || 0;
    const warrantyEndDate = warrantyMonths > 0
      ? new Date(new Date(effectiveSaleDate).setMonth(new Date(effectiveSaleDate).getMonth() + warrantyMonths))
      : null;

    await Imei.updateMany(
      { organizationId, branchId, productId: item.productId, ...matchesEitherImei(searchNumbers), status: 'in_stock' },
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

/** Used when a sales return restores specific sold units: puts just those IMEIs back
 *  into stock and clears their sale info, without touching the rest of the invoice's
 *  units (a partial return only restores the units actually coming back — unlike
 *  releaseImeisForInvoice above, which reverts the whole invoice). Matched by invoiceId
 *  + productId + exact numbers, so it can never accidentally release a unit from a
 *  different sale of the same product. */
const releaseImeisByNumbers = async ({ invoiceId, productId, imeis, organizationId, branchId, note }) => {
  const { all: numbers } = extractSearchNumbers(imeis || []);
  if (numbers.length === 0) return;
  await Imei.updateMany(
    { organizationId, branchId, invoiceId, productId, ...matchesEitherImei(numbers) },
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
      $push: { history: historyEntry('in_stock', { note: note || 'Returned by customer' }) },
    },
  );
};

/** Reverses releaseImeisByNumbers (a sales return gets rejected/deleted after already
 *  restoring units to stock) — re-marks those units as sold under the original invoice,
 *  but only the ones still sitting `in_stock`. A unit already resold to someone else in
 *  the meantime is deliberately left alone rather than yanked out from under that new
 *  sale; it just won't be perfectly reconciled by this reversal. */
const reclaimImeisForReturn = async ({ invoiceId, productId, imeis, organizationId, branchId }) => {
  const { all: numbers } = extractSearchNumbers(imeis || []);
  if (numbers.length === 0) return;
  await Imei.updateMany(
    { organizationId, branchId, productId, ...matchesEitherImei(numbers), status: 'in_stock' },
    {
      $set: { status: 'sold', invoiceId },
      $push: { history: historyEntry('sold', { note: 'Return reversed' }) },
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

  if (typeof queryFilter.productId === 'string' && queryFilter.productId.includes(',')) {
    queryFilter.productId = { $in: queryFilter.productId.split(',').map((s) => s.trim()).filter(Boolean) };
  }

  if (typeof queryFilter.acquisitionType === 'string' && queryFilter.acquisitionType.includes(',')) {
    queryFilter.acquisitionType = { $in: queryFilter.acquisitionType.split(',').map((s) => s.trim()).filter(Boolean) };
  }

  if (queryOptions.dateFrom || queryOptions.dateTo) {
    queryFilter.saleDate = {};
    if (queryOptions.dateFrom) queryFilter.saleDate.$gte = new Date(queryOptions.dateFrom);
    if (queryOptions.dateTo) queryFilter.saleDate.$lte = new Date(queryOptions.dateTo);
    delete queryOptions.dateFrom;
    delete queryOptions.dateTo;
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
      conditions.push({ sellerName: { $regex: search, $options: 'i' } });
    }
    if (conditions.length > 0) {
      queryFilter.$or = conditions;
    }
    delete queryOptions.search;
  }

  queryOptions.sortBy = queryOptions.sortBy || 'createdAt:-1';
  // Resolve batchId/purchaseId/invoiceId to their human-facing numbers — a raw ObjectId is
  // meaningless in a report or list; the Mobile Phone report in particular needs the sale
  // invoice # and purchase # alongside each unit for a complete transaction trail.
  queryOptions.populate = [
    { path: 'batchId', select: 'batchNumber' },
    { path: 'purchaseId', select: 'invoiceNumber paymentType' },
    { path: 'invoiceId', select: 'invoiceNumber paymentMethod walletType' },
  ];
  return Imei.paginate(queryFilter, queryOptions);
};

const getImeiById = async (id) => {
  const record = await Imei.findById(id).populate('batchId', 'batchNumber');
  if (!record) throw new ApiError(httpStatus.NOT_FOUND, 'IMEI record not found');
  return record;
};

const getImeiByNumber = async (imei, organizationId, branchId) => {
  return Imei.findOne({ organizationId, branchId, ...matchesEitherImei([normalizeImei(imei)]) });
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

const getImeiStats = async (organizationId, branchId, acquisitionType) => {
  const match = { organizationId: new mongoose.Types.ObjectId(organizationId), branchId: new mongoose.Types.ObjectId(branchId) };
  if (acquisitionType) {
    match.acquisitionType = acquisitionType.includes(',')
      ? { $in: acquisitionType.split(',').map((s) => s.trim()).filter(Boolean) }
      : acquisitionType;
  }

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
  matchesEitherImei,
  collectImeiNumbers,
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
  releaseImeisByNumbers,
  reclaimImeisForReturn,
  markImeiLostOrStolen,
};
