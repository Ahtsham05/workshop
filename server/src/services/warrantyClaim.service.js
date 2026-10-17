const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { WarrantyClaim, Product, Imei, Invoice, Supplier, Customer, User, StockAdjustment } = require('../models');
const stockAdjustmentService = require('./stockAdjustment.service');
const { matchesEitherImei } = require('./imei.service');
const { addTokenSearch } = require('../utils/searchQuery');
const { parseBusinessDateTime, atBusinessTimeOfDay, extractBusinessCalendarDate, endOfBusinessDay } = require('../utils/businessTimezone');

/** A day picked on a date-only field → that day at the current time (never midnight). */
const pickedMoment = (value) => atBusinessTimeOfDay(value) || new Date();
/** "Expected back on <day>" is overdue only once that whole day has passed. */
const endOfPickedDay = (value) => {
  const day = value ? extractBusinessCalendarDate(value) : null;
  return day ? endOfBusinessDay(day) : null;
};

/**
 * Warranty claims — see models/warrantyClaim.model.js for the two kinds and ownership.
 *
 *   received ──send──▶ sent ──receive back──▶ returned ──close──▶ closed
 *      │                  │       (repaired / replaced / rejected / credited)
 *      └──────────── cancel (only before anything came back) ───▶ cancelled
 *
 * "Reviving" a warranty item = bringing a shop-owned unit back into sellable stock with a
 * 'warranty_in' adjustment when it comes back repaired or replaced.
 */

const oid = (id) => (id && mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : null);
const scopeOf = ({ organizationId, branchId }) => ({ organizationId: oid(organizationId), branchId: oid(branchId) });
const isSerialized = (product) => !!(product.trackImei || product.trackSerial);

const userName = async (userId) => (userId ? (await User.findById(userId).select('name').lean())?.name || '' : '');

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

/** Warranty window and whether it still covers today. */
const warrantyFrom = ({ months, startDate, endDate }) => {
  const end = endDate || (months > 0 && startDate ? addMonths(startDate, months) : null);
  if (!end) return { months: months || 0, startDate: startDate || null, endDate: null, status: 'unknown' };
  return { months: months || 0, startDate: startDate || null, endDate: end, status: end.getTime() >= Date.now() ? 'in_warranty' : 'expired' };
};

/** Claim numbers WC-1001, WC-1002, … per organization (same _sequences pattern as transfers). */
const generateClaimNumber = async (organizationId) => {
  const db = mongoose.connection.db;
  const seqKey = `warrantyClaim_${organizationId}`;
  const result = await db.collection('_sequences').findOneAndUpdate(
    { _id: seqKey },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = Number(result?.seq ?? result?.value?.seq) || 1;
  return `WC-${1000 + seq}`;
};

const findClaimOrThrow = async (scope, claimId) => {
  const claim = oid(claimId) ? await WarrantyClaim.findOne({ _id: claimId, ...scopeOf(scope) }) : null;
  if (!claim) throw new ApiError(httpStatus.NOT_FOUND, 'Warranty claim not found');
  return claim;
};

const pushTimeline = async (claim, action, note, userId) => {
  claim.timeline.push({ action, note: note || '', at: new Date(), byUserId: userId || null, byUserName: await userName(userId) });
};

const imeiHistory = (status, note, userId) => ({ status, note, at: new Date(), byUserId: userId || null });

/** Posts a warranty_* stock adjustment and records it on the claim. */
const moveStock = async (claim, { type, productId, variantId, imeis, quantity, reason }, userId) => {
  const adjustment = await stockAdjustmentService.createAdjustment({
    organizationId: claim.organizationId,
    branchId: claim.branchId,
    productId,
    variantId: variantId || undefined,
    imeis: imeis && imeis.length ? imeis : undefined,
    quantity: imeis && imeis.length ? undefined : quantity,
    type,
    reason: reason || `Warranty claim ${claim.claimNumber}`,
    warrantyClaimId: claim._id,
    createdBy: userId,
  });
  claim.adjustments.push({ adjustmentId: adjustment._id, type, at: new Date() });
  return adjustment;
};

/**
 * What the shop knows about a serial/IMEI being brought in: the unit, its product, who
 * bought it and when, and its warranty — so the intake form fills itself.
 */
const lookupUnit = async (scope, serial) => {
  const number = String(serial || '').trim();
  if (!number) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a serial / IMEI number');
  const unit = await Imei.findOne({ ...scopeOf(scope), ...matchesEitherImei([number]) }).sort({ updatedAt: -1 }).lean();
  if (!unit) return { found: false };
  const [product, invoice, openClaim] = await Promise.all([
    unit.productId ? Product.findById(unit.productId).select('name warrantyMonths trackImei trackSerial').lean() : null,
    unit.invoiceId ? Invoice.findById(unit.invoiceId).select('invoiceNumber billNumber invoiceDate').lean() : null,
    WarrantyClaim.findOne({ ...scopeOf(scope), imeiId: unit._id, status: { $in: ['received', 'sent', 'returned'] } }).select('claimNumber status').lean(),
  ]);
  return {
    found: true,
    unit: {
      id: String(unit._id),
      serial: unit.imei,
      serial2: unit.imei2 || '',
      status: unit.status,
      productId: unit.productId ? String(unit.productId) : null,
      productName: product?.name || unit.productName,
      supplier: unit.supplierId ? { id: String(unit.supplierId), name: unit.supplierName || '' } : null,
      purchaseDate: unit.purchaseDate || null,
      customer: unit.customerId || unit.customerName ? { id: unit.customerId ? String(unit.customerId) : null, name: unit.customerName || '', phone: unit.customerPhone || '' } : null,
      invoice: invoice ? { id: String(invoice._id), number: invoice.billNumber || invoice.invoiceNumber, date: invoice.invoiceDate } : null,
      saleDate: unit.saleDate || null,
      warranty: warrantyFrom({ months: unit.warrantyMonths || product?.warrantyMonths || 0, startDate: unit.warrantyStartDate || unit.saleDate, endDate: unit.warrantyEndDate }),
    },
    openClaim: openClaim ? { id: String(openClaim._id), claimNumber: openClaim.claimNumber, status: openClaim.status } : null,
  };
};

/**
 * Logs a unit coming in under warranty. A 'stock' claim (the shop's own unsold unit)
 * takes it out of sellable stock at once; a 'customer' claim moves no stock.
 */
const createClaim = async (scope, body, userId) => {
  const s = scopeOf(scope);
  const product = await Product.findOne({ _id: body.productId, ...s });
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');
  const serialized = isSerialized(product);
  const serial = String(body.serial || '').trim();
  if (serialized && !serial) throw new ApiError(httpStatus.BAD_REQUEST, `${product.name} is serial/IMEI tracked — enter the serial / IMEI number`);

  let unit = null;
  if (serial) {
    unit = await Imei.findOne({ ...s, productId: product._id, ...matchesEitherImei([serial]) });
    if (serialized && !unit) throw new ApiError(httpStatus.BAD_REQUEST, `Serial / IMEI ${serial} is not on record for ${product.name}`);
    if (unit) {
      const open = await WarrantyClaim.findOne({ ...s, imeiId: unit._id, status: { $in: ['received', 'sent', 'returned'] } }).select('claimNumber');
      if (open) throw new ApiError(httpStatus.CONFLICT, `This unit already has an open claim (${open.claimNumber})`);
    }
  }
  // Variant stock lives on the variant — a stock move needs to know which one.
  if (body.type === 'stock' && product.hasVariants && !oid(body.variantId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Choose which variant of ${product.name}`);
  }
  if (body.type === 'stock' && unit && unit.status !== 'in_stock') {
    throw new ApiError(httpStatus.BAD_REQUEST, `This unit is not in stock (status: ${unit.status}) — log it as a customer claim instead`);
  }

  // Customer + invoice: as given, else from the unit's own sale record.
  const invoice = oid(body.invoiceId)
    ? await Invoice.findOne({ _id: body.invoiceId, organizationId: s.organizationId }).select('invoiceNumber billNumber invoiceDate customerId customerName walkInCustomerName')
    : unit?.invoiceId
      ? await Invoice.findById(unit.invoiceId).select('invoiceNumber billNumber invoiceDate customerId customerName walkInCustomerName')
      : null;
  let customer = { id: null, name: '', phone: '' };
  if (body.type === 'customer') {
    const customerId = oid(body.customerId) || (unit?.customerId ? oid(unit.customerId) : null) || (invoice && oid(invoice.customerId));
    const doc = customerId ? await Customer.findOne({ _id: customerId, organizationId: s.organizationId }).select('name phone').lean() : null;
    customer = {
      id: doc ? doc._id : null,
      name: body.customerName?.trim() || doc?.name || unit?.customerName || invoice?.customerName || invoice?.walkInCustomerName || '',
      phone: body.customerPhone?.trim() || doc?.phone || unit?.customerPhone || '',
    };
    if (!customer.name && !customer.phone) throw new ApiError(httpStatus.BAD_REQUEST, "Enter the customer's name or phone");
  }

  const saleDate = parseBusinessDateTime(body.saleDate) || unit?.saleDate || invoice?.invoiceDate || null;
  const warranty =
    body.type === 'stock'
      ? warrantyFrom({ months: unit?.warrantyMonths || product.warrantyMonths || 0, startDate: unit?.purchaseDate || null })
      : warrantyFrom({
          months: unit?.warrantyMonths || product.warrantyMonths || 0,
          startDate: unit?.warrantyStartDate || saleDate,
          endDate: unit?.warrantyEndDate || null,
        });

  const supplierId = oid(body.supplierId) || (unit?.supplierId ? oid(unit.supplierId) : null);
  const supplierDoc = supplierId ? await Supplier.findOne({ _id: supplierId, organizationId: s.organizationId }).select('name phone').lean() : null;

  const claim = new WarrantyClaim({
    ...s,
    claimNumber: await generateClaimNumber(s.organizationId),
    type: body.type,
    ownership: body.type === 'stock' ? 'shop' : 'customer',
    productId: product._id,
    variantId: oid(body.variantId),
    productName: product.name,
    quantity: serialized ? 1 : Math.max(1, parseInt(body.quantity, 10) || 1),
    imeiId: unit?._id || null,
    serial: unit?.imei || serial,
    originalSerial: unit?.imei || serial,
    customer,
    invoiceId: invoice?._id || null,
    invoiceNumber: invoice ? invoice.billNumber || invoice.invoiceNumber || '' : body.invoiceNumber?.trim() || '',
    saleDate,
    warranty,
    problem: body.problem,
    conditionNotes: body.conditionNotes || '',
    accessories: body.accessories || [],
    receivedAt: pickedMoment(body.receivedAt),
    supplier: supplierDoc ? { id: supplierDoc._id, name: supplierDoc.name, phone: supplierDoc.phone || '' } : { id: null, name: body.supplierName?.trim() || '', phone: '' },
    createdBy: userId,
  });

  if (body.type === 'stock') {
    await moveStock(
      claim,
      { type: 'warranty_out', productId: product._id, variantId: claim.variantId, imeis: unit ? [unit.imei] : null, quantity: claim.quantity, reason: `Warranty claim ${claim.claimNumber}: ${body.problem}` },
      userId
    );
  } else if (unit) {
    await Imei.updateOne({ _id: unit._id }, { $push: { history: imeiHistory(unit.status, `Warranty claim ${claim.claimNumber} received: ${body.problem}`, userId) } });
  }
  await pushTimeline(claim, 'received', body.problem, userId);
  await claim.save();
  return claim;
};

const sendToSupplier = async (scope, claimId, body, userId) => {
  const claim = await findClaimOrThrow(scope, claimId);
  if (claim.status !== 'received') throw new ApiError(httpStatus.BAD_REQUEST, `Only a received claim can be sent (this one is ${claim.status})`);
  const supplierId = oid(body.supplierId);
  if (supplierId) {
    const doc = await Supplier.findOne({ _id: supplierId, organizationId: claim.organizationId }).select('name phone').lean();
    if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
    claim.supplier = { id: doc._id, name: doc.name, phone: doc.phone || '' };
  } else if (body.supplierName?.trim()) {
    claim.supplier = { id: null, name: body.supplierName.trim(), phone: '' };
  }
  if (!claim.supplier?.name) throw new ApiError(httpStatus.BAD_REQUEST, 'Choose who it is being sent to');
  claim.status = 'sent';
  claim.sentAt = pickedMoment(body.sentAt);
  claim.sentReference = body.reference || '';
  claim.expectedBackAt = endOfPickedDay(body.expectedBackAt);
  if (claim.imeiId) {
    await Imei.updateOne({ _id: claim.imeiId }, { $push: { history: imeiHistory('in_warranty', `Sent to ${claim.supplier.name} (${claim.claimNumber})`, userId) } });
  }
  await pushTimeline(claim, 'sent', `${claim.supplier.name}${body.reference ? ` · ${body.reference}` : ''}${body.note ? ` — ${body.note}` : ''}`, userId);
  await claim.save();
  return claim;
};

/**
 * Customer claim: hand the customer a working unit from stock now. The faulty unit
 * becomes the shop's — revived into stock when it comes back.
 */
const giveReplacementFromStock = async (scope, claimId, body, userId) => {
  const claim = await findClaimOrThrow(scope, claimId);
  if (claim.type !== 'customer') throw new ApiError(httpStatus.BAD_REQUEST, 'Only a customer claim gets a replacement from stock');
  if (!['received', 'sent'].includes(claim.status)) throw new ApiError(httpStatus.BAD_REQUEST, `Not possible once the claim is ${claim.status}`);
  if (claim.replacementGiven) throw new ApiError(httpStatus.BAD_REQUEST, 'A replacement was already given on this claim');

  const product = await Product.findOne({ _id: body.productId || claim.productId, ...scopeOf(scope) });
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Replacement product not found in this branch');
  const serialized = isSerialized(product);
  const serial = String(body.serial || '').trim();
  if (serialized && !serial) throw new ApiError(httpStatus.BAD_REQUEST, 'Pick the serial / IMEI of the unit being handed over');
  const quantity = serialized ? 1 : Math.max(1, parseInt(body.quantity, 10) || claim.quantity);
  if (product.hasVariants && !oid(body.variantId)) throw new ApiError(httpStatus.BAD_REQUEST, `Choose which variant of ${product.name}`);

  await moveStock(
    claim,
    { type: 'warranty_replacement', productId: product._id, variantId: body.variantId, imeis: serialized ? [serial] : null, quantity, reason: `Replacement for warranty claim ${claim.claimNumber}` },
    userId
  );
  if (serialized) {
    // The handed-over unit now belongs to the customer, with the cover the faulty one had.
    await Imei.updateOne(
      { ...scopeOf(scope), productId: product._id, ...matchesEitherImei([serial]) },
      {
        $set: {
          customerId: claim.customer?.id || null,
          customerName: claim.customer?.name || '',
          customerPhone: claim.customer?.phone || '',
          saleDate: new Date(),
          warrantyMonths: claim.warranty?.months || product.warrantyMonths || 0,
          warrantyStartDate: claim.warranty?.startDate || new Date(),
          warrantyEndDate: claim.warranty?.endDate || (product.warrantyMonths ? addMonths(new Date(), product.warrantyMonths) : null),
        },
      }
    );
  }
  // The faulty unit is the shop's now: out of the customer's hands, waiting on the claim.
  if (claim.imeiId) {
    await Imei.updateOne(
      { _id: claim.imeiId },
      { $set: { status: 'in_warranty' }, $push: { history: imeiHistory('in_warranty', `Taken back under warranty (${claim.claimNumber}); customer given ${serial || product.name}`, userId) } }
    );
  }
  claim.ownership = 'shop';
  claim.replacementGiven = { productId: product._id, variantId: oid(body.variantId), productName: product.name, serial, quantity, at: new Date() };
  await pushTimeline(claim, 'replacement_given', `${product.name}${serial ? ` · ${serial}` : ''}`, userId);
  await claim.save();
  return claim;
};

/** A new unit record for a replacement serial, cloned from the faulty one. */
const cloneUnit = async (claim, original, newSerial, status, userId) => {
  const exists = await Imei.findOne({ organizationId: claim.organizationId, ...matchesEitherImei([newSerial]) }).select('_id');
  if (exists) throw new ApiError(httpStatus.CONFLICT, `Serial / IMEI ${newSerial} is already on record`);
  const source = original.toObject();
  ['_id', 'id', 'createdAt', 'updatedAt', '__v', 'history', 'imei2', 'transferId', 'productionOrderId'].forEach((k) => delete source[k]);
  const [unit] = await Imei.create([
    {
      ...source,
      imei: newSerial,
      imei2: '',
      status,
      notes: `Warranty replacement for ${original.imei} (${claim.claimNumber})`,
      history: [imeiHistory(status, `Received as warranty replacement for ${original.imei} (${claim.claimNumber})`, userId)],
      createdBy: userId,
    },
  ]);
  await Imei.updateOne(
    { _id: original._id },
    { $set: { status: 'scrapped' }, $push: { history: imeiHistory('scrapped', `Replaced under warranty by ${newSerial} (${claim.claimNumber})`, userId) } }
  );
  return unit;
};

/**
 * The unit came back. `resolution` says what the supplier did; `returnTo` where it goes:
 *   shop-owned:     'stock' (revive into sellable stock) | 'scrap'
 *   customer-owned: always back to the customer (a replacement takes over the old unit's
 *                   record and warranty)
 */
const receiveBack = async (scope, claimId, body, userId) => {
  const claim = await findClaimOrThrow(scope, claimId);
  if (!['received', 'sent'].includes(claim.status)) throw new ApiError(httpStatus.BAD_REQUEST, `This claim is already ${claim.status}`);
  const { resolution } = body;
  const product = await Product.findOne({ _id: claim.productId, ...scopeOf(scope) });
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'The product on this claim no longer exists');
  const serialized = isSerialized(product) && !!claim.imeiId;
  const original = serialized ? await Imei.findById(claim.imeiId) : null;
  const newSerial = String(body.replacementSerial || '').trim();
  if (resolution === 'replaced' && serialized && !newSerial) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter the serial / IMEI of the replacement unit');

  let returnTo;
  if (claim.ownership === 'shop') {
    const unitBack = resolution === 'repaired' || resolution === 'replaced' || resolution === 'rejected';
    returnTo = !unitBack ? 'none' : body.returnTo === 'scrap' ? 'scrap' : 'stock';
    if (returnTo === 'stock') {
      let backSerial = original?.imei;
      if (resolution === 'replaced' && serialized) backSerial = (await cloneUnit(claim, original, newSerial, 'in_warranty', userId)).imei;
      await moveStock(
        claim,
        {
          type: 'warranty_in',
          productId: product._id,
          variantId: claim.variantId,
          imeis: serialized ? [backSerial] : null,
          quantity: claim.quantity,
          reason: `Back from warranty (${resolution}) — ${claim.claimNumber}`,
        },
        userId
      );
    } else if (original) {
      // Credited / rejected-and-scrapped: the unit is gone for good.
      await Imei.updateOne({ _id: original._id }, { $set: { status: 'scrapped' }, $push: { history: imeiHistory('scrapped', `Warranty ${resolution} — ${claim.claimNumber}`, userId) } });
    }
  } else {
    returnTo = resolution === 'credited' ? 'none' : 'customer';
    if (resolution === 'replaced' && serialized) {
      await cloneUnit(claim, original, newSerial, 'sold', userId);
    } else if (original) {
      await Imei.updateOne({ _id: original._id }, { $push: { history: imeiHistory(original.status, `Back from warranty (${resolution}) — ${claim.claimNumber}`, userId) } });
    }
  }

  if (resolution === 'replaced' && newSerial) {
    claim.replacementSerial = newSerial;
    claim.serial = newSerial;
    if (serialized) claim.imeiId = (await Imei.findOne({ organizationId: claim.organizationId, imei: newSerial }).select('_id'))?._id || claim.imeiId;
  }
  // A customer's unit waits to be collected ('returned', closed on hand-over); the shop's
  // own unit is done the moment it is back in stock / written off.
  claim.status = claim.ownership === 'shop' ? 'closed' : 'returned';
  if (claim.status === 'closed') claim.closedAt = new Date();
  claim.resolution = resolution;
  claim.returnedAt = pickedMoment(body.returnedAt);
  claim.creditAmount = Number(body.creditAmount) || 0;
  claim.resolutionNotes = body.note || '';
  claim.returnedTo = returnTo;
  const where = { stock: 'back into stock', scrap: 'written off', customer: 'for the customer', none: '' }[returnTo];
  await pushTimeline(claim, 'returned', [resolution, newSerial && `new ${newSerial}`, where, body.note].filter(Boolean).join(' · '), userId);
  await claim.save();
  return claim;
};

const closeClaim = async (scope, claimId, body, userId) => {
  const claim = await findClaimOrThrow(scope, claimId);
  if (claim.status !== 'returned') throw new ApiError(httpStatus.BAD_REQUEST, 'Close a claim once the unit is back');
  claim.status = 'closed';
  claim.closedAt = new Date();
  claim.closingNote = body.note || '';
  await pushTimeline(claim, 'closed', body.note || (claim.ownership === 'customer' ? 'Handed back to the customer' : ''), userId);
  await claim.save();
  return claim;
};

/** Undo a claim logged by mistake — every stock move it made is reversed, newest first. */
const cancelClaim = async (scope, claimId, body, userId) => {
  const claim = await findClaimOrThrow(scope, claimId);
  if (!['received', 'sent'].includes(claim.status)) throw new ApiError(httpStatus.BAD_REQUEST, 'A claim can only be cancelled before the unit comes back');
  for (const move of [...claim.adjustments].reverse()) {
    const adjustment = await StockAdjustment.findById(move.adjustmentId).select('status');
    if (!adjustment || adjustment.status === 'reversed') continue;
    await stockAdjustmentService.reverseAdjustment({ adjustmentId: move.adjustmentId, organizationId: claim.organizationId, reversedBy: userId, fromWarrantyClaim: true });
  }
  if (claim.replacementGiven?.serial) {
    // Back on the shelf — no longer the customer's.
    await Imei.updateOne(
      { organizationId: claim.organizationId, branchId: claim.branchId, productId: claim.replacementGiven.productId, ...matchesEitherImei([claim.replacementGiven.serial]) },
      { $set: { customerId: null, customerName: '', customerPhone: '', saleDate: null, warrantyStartDate: null, warrantyEndDate: null } }
    );
  }
  if (claim.type === 'customer' && claim.replacementGiven && claim.imeiId) {
    // The faulty unit is the customer's again.
    await Imei.updateOne({ _id: claim.imeiId }, { $set: { status: 'sold' }, $push: { history: imeiHistory('sold', `Warranty claim ${claim.claimNumber} cancelled`, userId) } });
  }
  claim.status = 'cancelled';
  claim.cancelledAt = new Date();
  claim.cancelReason = body.reason || '';
  await pushTimeline(claim, 'cancelled', body.reason || '', userId);
  await claim.save();
  return claim;
};

const getClaim = async (scope, claimId) => findClaimOrThrow(scope, claimId);

/** Claims list; `overdue` = sent and past the expected-back date. */
const queryClaims = async (scope, { status, type, search, overdue, page = 1, limit = 20 } = {}) => {
  const match = { ...scopeOf(scope) };
  if (status) match.status = { $in: String(status).split(',') };
  if (type) match.type = type;
  if (overdue === true || overdue === 'true') {
    match.status = 'sent';
    match.expectedBackAt = { $lt: new Date() };
  }
  if (search) addTokenSearch(match, search, ['claimNumber', 'productName', 'serial', 'originalSerial', 'customer.name', 'customer.phone', 'supplier.name', 'invoiceNumber']);
  return WarrantyClaim.paginate(match, { page, limit, sortBy: 'createdAt:desc' });
};

const getClaimStats = async (scope) => {
  const s = scopeOf(scope);
  const [byStatus, overdue, unitsAway] = await Promise.all([
    WarrantyClaim.aggregate([{ $match: s }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    WarrantyClaim.countDocuments({ ...s, status: 'sent', expectedBackAt: { $lt: new Date() } }),
    // Shop-owned units out of stock right now (they come back with a warranty_in).
    WarrantyClaim.aggregate([
      { $match: { ...s, ownership: 'shop', status: { $in: ['received', 'sent'] } } },
      { $group: { _id: null, units: { $sum: '$quantity' } } },
    ]),
  ]);
  const counts = Object.fromEntries(byStatus.map((r) => [r._id, r.count]));
  return {
    received: counts.received || 0,
    sent: counts.sent || 0,
    returned: counts.returned || 0,
    closed: counts.closed || 0,
    cancelled: counts.cancelled || 0,
    open: (counts.received || 0) + (counts.sent || 0) + (counts.returned || 0),
    overdue,
    shopUnitsAway: unitsAway[0]?.units || 0,
  };
};

module.exports = {
  lookupUnit,
  createClaim,
  sendToSupplier,
  giveReplacementFromStock,
  receiveBack,
  closeClaim,
  cancelClaim,
  getClaim,
  queryClaims,
  getClaimStats,
};
