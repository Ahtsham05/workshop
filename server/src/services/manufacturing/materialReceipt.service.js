const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { RawMaterialReceipt, Product, ProductVariant, Supplier, PurchaseOrder, Imei } = require('../../models');
const ApiError = require('../../utils/ApiError');
const purchaseService = require('../purchase.service');
const settingsService = require('./settings.service');
const { roundQty, roundMoney, requireBranch, scopeFilter, escapeRegex, parseDateRange, RowErrors } = require('./common');

/**
 * RMV — Raw Material Receipt Voucher (see models/rawMaterialReceipt.model.js).
 *
 * Drafts are free-form and never touch stock. Confirming re-validates everything on the
 * server and posts in ONE transaction:
 *   1. the voucher (draft → confirmed — a conditional write, so it can't post twice),
 *   2. a linked Purchase through purchase.service.js#createPurchase — the same pipeline
 *      every purchase uses: stock (+ the inventory ledger row), batches with expiry,
 *      serial units, product cost, and the supplier payable (the purchase's balance,
 *      which supplier payments settle),
 *   3. the purchase order's received quantities and receipt history, when against a PO.
 * Then, after commit, the purchase's cash book / accounts journal / supplier-ledger rows —
 * best-effort and re-postable, exactly as for any purchase.
 *
 * Validation problems come back as one 400 with errorCode ROW_ERRORS and
 * details.rows = [{ line, field, message }] so the entry grid shows each on its row.
 */

/** Product types a supplier receipt may bring in; unclassified products are allowed. */
const RECEIVABLE_TYPES = [null, undefined, 'raw_material', 'component', 'packaging_material', 'sub_assembly', 'by_product'];
const TYPE_LABEL = {
  finished_good: 'A finished good',
  wip: 'A WIP item',
  scrap: 'A scrap item',
  service: 'A service',
};

const OPEN_PO_STATUSES = ['draft', 'sent', 'partial'];

/** gross = qty × rate; discount on gross; tax on (gross − discount); net = taxable + tax. */
const computeLine = (line) => {
  const quantity = roundQty(Number(line.quantity) || 0);
  const rate = Math.max(0, Number(line.rate) || 0);
  const discountPercent = Math.min(100, Math.max(0, Number(line.discountPercent) || 0));
  const taxPercent = Math.min(100, Math.max(0, Number(line.taxPercent) || 0));
  const gross = roundMoney(quantity * rate);
  const discountAmount = roundMoney((gross * discountPercent) / 100);
  const taxable = roundMoney(gross - discountAmount);
  const taxAmount = roundMoney((taxable * taxPercent) / 100);
  return {
    quantity,
    rate,
    discountPercent,
    taxPercent,
    gross,
    discountAmount,
    taxable,
    taxAmount,
    netAmount: roundMoney(taxable + taxAmount),
    netUnitCost: quantity > 0 ? Math.round((taxable / quantity) * 10000) / 10000 : 0,
  };
};

const computeTotals = (lines) => ({
  items: lines.length,
  quantity: roundQty(lines.reduce((s, l) => s + l.quantity, 0)),
  subtotal: roundMoney(lines.reduce((s, l) => s + roundMoney(l.quantity * l.rate), 0)),
  discount: roundMoney(lines.reduce((s, l) => s + l.discountAmount, 0)),
  tax: roundMoney(lines.reduce((s, l) => s + l.taxAmount, 0)),
  grandTotal: roundMoney(lines.reduce((s, l) => s + l.netAmount, 0)),
});

const findVoucherOrThrow = async (ctx, id) => {
  const voucher = await RawMaterialReceipt.findOne({ _id: id, ...scopeFilter(ctx) });
  if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Raw material receipt not found');
  return voucher;
};

/**
 * Validate + denormalize lines against the branch catalog. `strict` (confirming) also
 * requires quantities, rates, batches/expiry and serials.
 */
const normalizeLines = async (ctx, rawLines, { strict }) => {
  const errors = new RowErrors();
  const lines = (rawLines || []).filter((l) => l && l.productId);
  if (strict && !lines.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Add at least one line before confirming');
  }
  const productIds = [...new Set(lines.map((l) => String(l.productId)))];
  const products = await Product.find({
    _id: { $in: productIds },
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
  })
    .select('name sku unit hasVariants productType trackImei trackSerial')
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const variants = await ProductVariant.find({ productId: { $in: productIds }, organizationId: ctx.organizationId })
    .select('productId isDefault sku trackBatch trackExpiry unit attributes')
    .lean();
  const variantById = new Map(variants.map((v) => [String(v._id), v]));
  const defaultVariantByProduct = new Map(variants.filter((v) => v.isDefault).map((v) => [String(v.productId), v]));

  const seenSerials = new Map();
  const out = lines.map((raw, index) => {
    const n = index + 1;
    const product = productById.get(String(raw.productId));
    if (!product) {
      errors.add(n, 'product', 'Product not found in this branch');
      return null;
    }
    if (!RECEIVABLE_TYPES.includes(product.productType)) {
      errors.add(
        n,
        'product',
        `${TYPE_LABEL[product.productType] || 'This item'} can't be received on a raw material receipt`
      );
    }
    // A real variant when the product has variants; the default variant when it's what
    // carries batch/expiry tracking (purchase.service.js creates batches on variants);
    // otherwise none — a simple product's stock lives on the product.
    let variant = null;
    if (product.hasVariants) {
      variant = raw.variantId ? variantById.get(String(raw.variantId)) : null;
      if (!variant || String(variant.productId) !== String(product._id) || variant.isDefault) {
        errors.add(n, 'product', 'Pick the variant to receive');
      }
    } else {
      const def = defaultVariantByProduct.get(String(product._id));
      if (def && (def.trackBatch || def.trackExpiry)) variant = def;
    }
    const trackBatch = !!(variant && (variant.trackBatch || variant.trackExpiry));
    const trackExpiry = !!(variant && variant.trackExpiry);
    const trackSerial = !!(product.trackImei || product.trackSerial);

    const serials = trackSerial ? [...new Set((raw.serials || []).map((s) => String(s).trim()).filter(Boolean))] : undefined;
    const money = computeLine({ ...raw, quantity: trackSerial ? serials.length : raw.quantity });

    if (strict) {
      if (!(money.quantity > 0))
        errors.add(
          n,
          trackSerial ? 'serials' : 'quantity',
          trackSerial ? 'Scan or type the serial numbers' : 'Enter a quantity above 0'
        );
      if (trackBatch && !String(raw.batchNumber || '').trim()) errors.add(n, 'batchNumber', 'Enter the batch number');
      if (trackExpiry && !raw.expiryDate) errors.add(n, 'expiryDate', 'Enter the expiry date');
    } else if (Number(raw.quantity) < 0) {
      errors.add(n, 'quantity', 'Quantity cannot be negative');
    }
    (serials || []).forEach((s) => {
      const key = s.toLowerCase();
      if (seenSerials.has(key)) errors.add(n, 'serials', `Serial ${s} is also on line ${seenSerials.get(key)}`);
      else seenSerials.set(key, n);
    });

    return {
      line: n,
      productId: product._id,
      variantId: variant ? variant._id : null,
      realVariantId: product.hasVariants && variant ? variant._id : null,
      productName:
        product.hasVariants && variant
          ? `${product.name} — ${Object.values(variant.attributes || {}).join(' / ')}`
          : product.name,
      sku: (variant && !variant.isDefault && variant.sku) || product.sku || '',
      productType: product.productType || null,
      unit: (variant && variant.unit) || product.unit,
      quantity: money.quantity,
      rate: money.rate,
      discountPercent: money.discountPercent,
      discountAmount: money.discountAmount,
      taxPercent: money.taxPercent,
      taxAmount: money.taxAmount,
      netAmount: money.netAmount,
      netUnitCost: money.netUnitCost,
      taxable: money.taxable,
      batchNumber: trackBatch ? String(raw.batchNumber || '').trim() : '',
      expiryDate: trackBatch && raw.expiryDate ? new Date(raw.expiryDate) : null,
      serials,
      location: String(raw.location || '').trim(),
      notes: String(raw.notes || '').trim(),
      trackSerial,
    };
  });

  // Same rule as purchases (imei.service.js#syncImeisForPurchaseItem): a serial already
  // in stock or sold in this branch can't arrive again — checked here so the message
  // lands on the right line instead of failing the whole confirmation.
  if (strict) {
    const allSerials = out.flatMap((l) => (l && l.serials) || []);
    if (allSerials.length) {
      const existing = await Imei.find({
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        status: { $in: ['in_stock', 'sold'] },
        $or: [{ imei: { $in: allSerials } }, { imei2: { $in: allSerials } }],
      })
        .select('imei imei2')
        .lean();
      const taken = new Set(existing.flatMap((e) => [e.imei, e.imei2].filter(Boolean).map((x) => String(x).toLowerCase())));
      out.forEach((l) => {
        (l && l.serials ? l.serials : []).forEach((s) => {
          if (taken.has(s.toLowerCase())) errors.add(l.line, 'serials', `Serial ${s} already exists`);
        });
      });
    }
  }
  errors.throwIfAny();
  return out;
};

const resolveSupplier = async (ctx, supplierId, { required }) => {
  if (!supplierId) {
    if (required) throw new ApiError(httpStatus.BAD_REQUEST, 'Choose the supplier');
    return { supplierId: null, supplierName: '' };
  }
  const supplier = await Supplier.findOne({ _id: supplierId, organizationId: ctx.organizationId }).select('name').lean();
  if (!supplier) throw new ApiError(httpStatus.BAD_REQUEST, 'Supplier not found in this organization');
  return { supplierId: supplier._id, supplierName: supplier.name };
};

const resolvePurchaseOrder = async (ctx, purchaseOrderId, supplierId) => {
  if (!purchaseOrderId) return { purchaseOrderId: null, purchaseOrderNumber: '' };
  const po = await PurchaseOrder.findOne({
    _id: purchaseOrderId,
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
  })
    .select('orderNumber supplier status')
    .lean();
  if (!po) throw new ApiError(httpStatus.BAD_REQUEST, 'Purchase order not found in this branch');
  if (!OPEN_PO_STATUSES.includes(po.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Purchase order ${po.orderNumber} is ${po.status}`);
  }
  if (supplierId && po.supplier && String(po.supplier) !== String(supplierId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Purchase order ${po.orderNumber} is for another supplier`);
  }
  return { purchaseOrderId: po._id, purchaseOrderNumber: po.orderNumber };
};

const HEADER_FIELDS = ['location', 'reference', 'notes'];

const toStoredLines = (lines) => lines.map(({ line, realVariantId, taxable, trackSerial, ...rest }) => rest);

const applyHeader = async (ctx, voucher, body, { strict }) => {
  if (body.date !== undefined) voucher.set('date', body.date ? new Date(body.date) : new Date());
  HEADER_FIELDS.forEach((f) => {
    if (body[f] !== undefined) voucher.set(f, body[f] || '');
  });
  if (body.supplierId !== undefined || strict) {
    Object.assign(
      voucher,
      await resolveSupplier(ctx, body.supplierId !== undefined ? body.supplierId : voucher.supplierId, { required: strict })
    );
  }
  if (body.purchaseOrderId !== undefined || strict) {
    Object.assign(
      voucher,
      await resolvePurchaseOrder(
        ctx,
        body.purchaseOrderId !== undefined ? body.purchaseOrderId : voucher.purchaseOrderId,
        voucher.supplierId
      )
    );
  }
};

// ── Queries ─────────────────────────────────────────────────────────────────────────

const queryReceipts = async (ctx, filter, options) => {
  const query = { ...scopeFilter(ctx) };
  if (filter.status) query.status = { $in: String(filter.status).split(',') };
  if (filter.supplierId) query.supplierId = filter.supplierId;
  Object.assign(query, parseDateRange(filter.dateFrom, filter.dateTo, 'date'));
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [
      { voucherNumber: re },
      { supplierName: re },
      { reference: re },
      { purchaseOrderNumber: re },
      { 'lines.productName': re },
    ];
  }
  return RawMaterialReceipt.paginate(query, { sortBy: 'date:desc', ...options });
};

const getReceipt = (ctx, id) => findVoucherOrThrow(ctx, id);

// ── Draft lifecycle ─────────────────────────────────────────────────────────────────

const createReceipt = async (ctx, body) => {
  requireBranch(ctx.branchId);
  const voucher = new RawMaterialReceipt({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    voucherNumber: 'pending',
    status: 'draft',
    date: body.date ? new Date(body.date) : new Date(),
    createdBy: ctx.createdBy,
    updatedBy: ctx.createdBy,
  });
  await applyHeader(ctx, voucher, body, { strict: false });
  const lines = await normalizeLines(ctx, body.lines, { strict: false });
  voucher.lines = toStoredLines(lines);
  voucher.totals = computeTotals(lines);
  voucher.voucherNumber = await settingsService.nextDocumentNumber(ctx.organizationId, 'rawMaterialReceipt');
  await voucher.save();
  return voucher;
};

const updateReceipt = async (ctx, id, body) => {
  requireBranch(ctx.branchId);
  const voucher = await findVoucherOrThrow(ctx, id);
  if (voucher.status !== 'draft') {
    throw new ApiError(httpStatus.BAD_REQUEST, `A ${voucher.status} receipt can no longer be edited`);
  }
  await applyHeader(ctx, voucher, body, { strict: false });
  if (body.lines !== undefined) {
    const lines = await normalizeLines(ctx, body.lines, { strict: false });
    voucher.lines = toStoredLines(lines);
    voucher.totals = computeTotals(lines);
  }
  voucher.updatedBy = ctx.createdBy;
  await voucher.save();
  return voucher;
};

const deleteReceipt = async (ctx, id) => {
  requireBranch(ctx.branchId);
  const voucher = await findVoucherOrThrow(ctx, id);
  if (voucher.status !== 'draft') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only a draft receipt can be deleted');
  }
  await voucher.deleteOne();
};

// ── Confirmation (posts stock) ──────────────────────────────────────────────────────

/** Checks the voucher's lines against the order and returns the order's new receipt. */
const applyToPurchaseOrder = (po, lines, voucher, purchase, ctx) => {
  const errors = new RowErrors();
  const key = (productId, variantId) => `${productId}::${variantId || ''}`;
  const orderLines = new Map(po.items.map((it) => [key(it.product, it.variantId), it]));
  const receiving = new Map();
  lines.forEach((l) => {
    const k = key(l.productId, l.realVariantId);
    const orderLine = orderLines.get(k);
    if (!orderLine) {
      errors.add(l.line, 'product', `Not on purchase order ${po.orderNumber}`);
      return;
    }
    receiving.set(k, roundQty((receiving.get(k) || 0) + l.quantity));
    const remaining = roundQty(Number(orderLine.quantity || 0) - Number(orderLine.receivedQuantity || 0));
    if (receiving.get(k) - remaining > 1e-6) {
      errors.add(
        l.line,
        'quantity',
        `Only ${remaining} ${orderLine.unit || ''} left to receive on ${po.orderNumber}`.trim()
      );
    }
  });
  errors.throwIfAny('This receipt doesn’t fit the purchase order');
  receiving.forEach((qty, k) => {
    const orderLine = orderLines.get(k);
    orderLine.receivedQuantity = roundQty(Number(orderLine.receivedQuantity || 0) + qty);
  });
  po.receipts.push({
    purchase: purchase._id,
    purchaseInvoiceNumber: purchase.invoiceNumber,
    receivedAt: voucher.date,
    receivedBy: ctx.createdBy,
    items: lines.map((l) => ({
      product: l.productId,
      variantId: l.realVariantId || undefined,
      receivedQuantity: l.quantity,
      priceAtPurchase: l.rate,
      unit: l.unit,
      conversionFactor: 1,
      discountType: 'percentage',
      discountValue: l.discountPercent,
      discountAmount: l.discountAmount,
      batchNumber: l.batchNumber || undefined,
      expiryDate: l.expiryDate || undefined,
      notes: l.notes || undefined,
    })),
    notes: `Received on ${voucher.voucherNumber}`,
  });
  po.status = po.computeStatus(); // eslint-disable-line no-param-reassign
};

const confirmReceipt = async (ctx, id) => {
  requireBranch(ctx.branchId);
  const voucher = await findVoucherOrThrow(ctx, id);
  if (voucher.status !== 'draft') {
    throw new ApiError(httpStatus.BAD_REQUEST, `This receipt is already ${voucher.status}`);
  }
  // Re-validate from what's stored, strictly — never trust totals or links from a client.
  await applyHeader(ctx, voucher, {}, { strict: true });
  const lines = await normalizeLines(
    ctx,
    voucher.lines.map((l) => l.toObject()),
    { strict: true }
  );

  const invoiceNumber = await purchaseService.generateNextPurchaseInvoiceNumber(ctx.organizationId, ctx.branchId);
  const totals = computeTotals(lines);
  const preTax = roundMoney(totals.subtotal - totals.discount);
  const purchaseBody = {
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    createdBy: ctx.createdBy,
    supplier: voucher.supplierId,
    purchaseOrder: voucher.purchaseOrderId || undefined,
    rawMaterialReceipt: voucher._id,
    invoiceNumber,
    vendorBillNumber: voucher.reference || undefined,
    purchaseDate: voucher.date,
    items: lines.map((l) => ({
      product: l.productId,
      variantId: l.variantId || undefined,
      quantity: l.quantity,
      unit: l.unit,
      conversionFactor: 1,
      priceAtPurchase: l.rate,
      discountType: 'percentage',
      discountValue: l.discountPercent,
      discountAmount: l.discountAmount,
      total: l.taxable,
      taxAmount: l.taxAmount,
      batchNumber: l.batchNumber || undefined,
      expiryDate: l.expiryDate || undefined,
      imeis: l.serials && l.serials.length ? l.serials : undefined,
    })),
    discount: 0,
    totalAmount: preTax,
    // The voucher's per-line tax is what the supplier billed.
    manualTax: true,
    // Received on account: the supplier is paid later through supplier payments.
    type: 'credit',
    paymentMethod: 'cash',
    paidAmount: 0,
    notes: `Raw material receipt ${voucher.voucherNumber}${voucher.notes ? ` — ${voucher.notes}` : ''}`,
  };

  const session = await mongoose.startSession();
  let purchase;
  let confirmed;
  try {
    await session.withTransaction(async () => {
      // Claim the draft first: a second confirm (double click, two people) finds nothing.
      confirmed = await RawMaterialReceipt.findOneAndUpdate(
        { _id: voucher._id, organizationId: ctx.organizationId, status: 'draft' },
        {
          $set: {
            status: 'confirmed',
            supplierId: voucher.supplierId,
            supplierName: voucher.supplierName,
            purchaseOrderId: voucher.purchaseOrderId,
            purchaseOrderNumber: voucher.purchaseOrderNumber,
            lines: toStoredLines(lines),
            totals,
            confirmedAt: new Date(),
            confirmedBy: ctx.createdBy,
            updatedBy: ctx.createdBy,
          },
        },
        { new: true, session }
      );
      if (!confirmed) throw new ApiError(httpStatus.CONFLICT, 'This receipt was confirmed by someone else — refresh');

      purchase = await purchaseService.createPurchase(purchaseBody, { session, deferPostCommit: true });

      if (voucher.purchaseOrderId) {
        const po = await PurchaseOrder.findOne({ _id: voucher.purchaseOrderId, organizationId: ctx.organizationId }).session(
          session
        );
        if (!po || !OPEN_PO_STATUSES.includes(po.status)) {
          throw new ApiError(httpStatus.BAD_REQUEST, 'The purchase order is no longer open');
        }
        applyToPurchaseOrder(po, lines, confirmed, purchase, ctx);
        await po.save({ session });
      }

      confirmed.purchaseId = purchase._id;
      confirmed.purchaseInvoiceNumber = purchase.invoiceNumber;
      await confirmed.save({ session });
    });
  } finally {
    await session.endSession();
  }

  await purchaseService.runPurchasePostCommit(purchase);
  return confirmed;
};

/** Create (or update a draft) and confirm in one call — "Save" on a new voucher. */
const saveAndConfirm = async (ctx, id, body) => {
  const draft = id ? await updateReceipt(ctx, id, body) : await createReceipt(ctx, body);
  try {
    return await confirmReceipt(ctx, draft._id);
  } catch (err) {
    // The draft is kept (with its number) so nothing typed is lost; tell the client.
    err.draftId = String(draft._id); // eslint-disable-line no-param-reassign
    if (err.details) err.details.draftId = String(draft._id); // eslint-disable-line no-param-reassign
    else if (err.errorCode === undefined) {
      err.errorCode = 'CONFIRM_FAILED'; // eslint-disable-line no-param-reassign
      err.details = { draftId: String(draft._id) }; // eslint-disable-line no-param-reassign
    }
    throw err;
  }
};

module.exports = {
  computeLine,
  computeTotals,
  queryReceipts,
  getReceipt,
  createReceipt,
  updateReceipt,
  deleteReceipt,
  confirmReceipt,
  saveAndConfirm,
};
