const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { ProductionOrder, Product } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { EXECUTABLE_PRODUCTION_STATUSES } = require('../../config/manufacturing');
const settingsService = require('./settings.service');
const stockService = require('./stock.service');
const executionService = require('./execution.service');
const productionOrderService = require('./productionOrder.service');
const voucherService = require('./materialIssueVoucher.service');
const wip = require('./wip');
const { roundQty, requireBranch, RowErrors } = require('./common');

/**
 * Issue by material — "issue the packaging (or any material) without picking a finished
 * good". Every issued unit still belongs to a production order (that is what makes used /
 * wastage / still-in-the-factory answerable), so each line is sent to the open orders that
 * still need that material:
 *
 *   auto      — in production-queue order (running first, then priority, planned start,
 *               age), each order up to what it still needs; anything beyond the total need
 *               goes to the first order as an over-issue (a warning to override)
 *   orderId   — all of it to that one order
 *
 * Posting is ONE transaction that writes one Material Issue Voucher per order through the
 * normal issue pipeline (execution.service#issueMaterials) — every row of every order, or
 * nothing. The per-order checks are materialIssueVoucher.service#checkVoucher's own, with
 * their row numbers mapped back to this voucher's lines; stock is also checked across
 * orders (two orders sharing one line must not each count the same stock).
 */

const keyOf = (productId, variantId) => `${productId}:${variantId || ''}`;

const queueSort = (a, b) => {
  if (productionOrderService.isAheadOf(a, b)) return -1;
  if (productionOrderService.isAheadOf(b, a)) return 1;
  return 0;
};

/**
 * What open (released → paused) orders still have to be issued, per material, with each
 * order's share in queue order. `productType` narrows it (comma list, e.g. packaging_material).
 */
const pendingMaterials = async (ctx, { productType, productId } = {}) => {
  const { organizationId, branchId } = ctx;
  requireBranch(branchId);
  const orders = await ProductionOrder.find({
    organizationId,
    branchId,
    status: { $in: EXECUTABLE_PRODUCTION_STATUSES },
    ...(productId ? { 'materials.productId': productId } : {}),
  })
    .select('orderNumber orderType status priority plannedStartDate createdAt productName plannedQuantity unit materials')
    .lean();
  orders.sort(queueSort);

  const byKey = new Map();
  orders.forEach((order) =>
    order.materials.forEach((m) => {
      // Optional lines are the floor's call — they are issued against their order.
      if (m.isOptional) return;
      const outstanding = wip.lineRemaining(m);
      if (outstanding <= wip.EPS) return;
      const key = keyOf(m.productId, m.variantId);
      const entry = byKey.get(key) || {
        productId: String(m.productId),
        variantId: m.variantId ? String(m.variantId) : null,
        productName: m.productName,
        sku: m.sku || '',
        unit: m.unit,
        outstanding: 0,
        orders: [],
      };
      entry.outstanding = roundQty(entry.outstanding + outstanding);
      entry.orders.push({
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        status: order.status,
        productName: order.productName,
        materialLineId: String(m._id),
        outstanding,
      });
      byKey.set(key, entry);
    })
  );
  if (!byKey.size) return { materials: [] };

  const items = [...byKey.values()].map((e) => ({ productId: e.productId, variantId: e.variantId }));
  const [products, availability] = await Promise.all([
    Product.find({ _id: { $in: items.map((i) => i.productId) }, organizationId })
      .select('productType image sku barcode')
      .lean(),
    stockService.getAvailability({ organizationId, branchId, items }),
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const types = productType
    ? new Set(
        String(productType)
          .split(',')
          .map((t) => t.trim())
      )
    : null;

  const materials = [...byKey.entries()]
    .map(([key, e]) => {
      const product = productById.get(e.productId) || {};
      return {
        ...e,
        productType: product.productType || null,
        sku: e.sku || product.sku || product.barcode || '',
        imageUrl: (product.image && product.image.url) || null,
        available: roundQty(availability.get(key) || 0),
      };
    })
    .filter((m) => !types || types.has(m.productType || 'unclassified'))
    .sort((a, b) => a.productName.localeCompare(b.productName));
  return { materials };
};

/** Splits a line's quantity over the orders that need it. Returns [{ order, quantity }]. */
const allocate = (material, quantity, orderId) => {
  const candidates = orderId ? material.orders.filter((o) => o.orderId === String(orderId)) : material.orders;
  const parts = [];
  let left = roundQty(quantity);
  candidates.forEach((o) => {
    if (left <= wip.EPS) return;
    const take = roundQty(Math.min(left, o.outstanding));
    if (take > wip.EPS) parts.push({ order: o, quantity: take });
    left = roundQty(left - take);
  });
  // More than the orders need: the excess goes to the first one (an over-issue warning).
  if (left > wip.EPS && candidates.length) {
    const first = parts.find((p) => p.order === candidates[0]);
    if (first) first.quantity = roundQty(first.quantity + left);
    else parts.unshift({ order: candidates[0], quantity: left });
  }
  return parts;
};

/**
 * Everything wrong with a by-material voucher, without changing anything — the same
 * shape as checkVoucher ({ header, rows, warnings, notes }) plus `groups`: one checked
 * per-order voucher each, ready to post, and `allocations` per line for the screen.
 */
const checkByMaterial = async (ctx, body) => {
  const { organizationId } = ctx;
  requireBranch(ctx.branchId);
  const inputs = body.lines || [];
  if (!inputs.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Add at least one material to issue');
  const settings = await settingsService.getSettings(organizationId);
  const { materials } = await pendingMaterials(ctx);
  const byKey = new Map(materials.map((m) => [keyOf(m.productId, m.variantId), m]));

  const errors = new RowErrors();
  const seen = new Map();
  const groups = new Map(); // orderId → { lines: [{ input, line }] }
  const allocations = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const [index, input] of inputs.entries()) {
    const n = index + 1;
    const key = keyOf(input.productId, input.variantId);
    const material = byKey.get(key);
    const quantity = Number(input.quantity);
    allocations.push([]);
    if (seen.has(key)) {
      errors.add(n, 'product', `Already on line ${seen.get(key)}`);
      continue; // eslint-disable-line no-continue
    }
    seen.set(key, n);
    if (!material) {
      errors.add(n, 'product', 'No open production order still needs this material');
      continue; // eslint-disable-line no-continue
    }
    if (input.orderId && !material.orders.some((o) => o.orderId === String(input.orderId))) {
      errors.add(n, 'orderId', 'That order does not need this material any more');
      continue; // eslint-disable-line no-continue
    }
    if (!Number.isFinite(quantity) || !(quantity > 0)) {
      errors.add(n, 'quantity', 'Enter a quantity above 0');
      continue; // eslint-disable-line no-continue
    }
    let item;
    try {
      // eslint-disable-next-line no-await-in-loop
      item = await stockService.resolveItem({
        organizationId,
        branchId: ctx.branchId,
        productId: material.productId,
        variantId: material.variantId,
      });
    } catch (err) {
      errors.add(n, 'product', err.message);
      continue; // eslint-disable-line no-continue
    }
    if (item.serial) {
      errors.add(n, 'product', 'Serial-tracked — issue it against its order to pick the serial numbers');
      continue; // eslint-disable-line no-continue
    }
    // Stock across all the orders this line feeds (each per-order check sees only its part).
    if (!item.batchTracked && quantity > item.available + wip.EPS && !settings.allowNegativeStockIssue) {
      errors.add(
        n,
        'quantity',
        `Insufficient stock — ${roundQty(Math.max(0, item.available))} ${item.unit} available, ${roundQty(
          quantity
        )} to issue`
      );
      continue; // eslint-disable-line no-continue
    }
    const parts = allocate(material, quantity, input.orderId);
    allocations[index] = parts.map((p) => ({
      orderId: p.order.orderId,
      orderNumber: p.order.orderNumber,
      quantity: p.quantity,
    }));
    parts.forEach((p) => {
      const group = groups.get(p.order.orderId) || { lines: [] };
      group.lines.push({ n, input: { materialLineId: p.order.materialLineId, quantity: p.quantity } });
      groups.set(p.order.orderId, group);
    });
  }

  // Each order's part through the voucher's own checks; map its row numbers back.
  let header = {};
  const warnings = [];
  const notes = [];
  const checked = [];
  const seenWarning = new Set();
  // eslint-disable-next-line no-restricted-syntax
  for (const [orderId, group] of groups) {
    const subBody = {
      productionOrderId: orderId,
      sourceLocation: body.sourceLocation,
      wipLocation: body.wipLocation,
      requestedById: body.requestedById,
      issuedById: body.issuedById,
      lines: group.lines.map((l) => l.input),
    };
    // eslint-disable-next-line no-await-in-loop
    const check = await voucherService.checkVoucher(ctx, subBody);
    if (Object.keys(check.header).length && !Object.keys(header).length) header = check.header;
    const toLine = (k) => group.lines[k - 1].n;
    check.rows.forEach((r) => errors.add(toLine(r.line), r.field, `${check.order.orderNumber}: ${r.message}`));
    check.warnings.forEach((w) => {
      const line = toLine(w.line);
      const id = `${line}:${w.code}`;
      if (seenWarning.has(id)) return;
      seenWarning.add(id);
      warnings.push({ ...w, line, message: `${check.order.orderNumber}: ${w.message}` });
    });
    check.notes.forEach((x) => notes.push({ ...x, line: toLine(x.line) }));
    checked.push({ check, body: subBody });
  }
  return { header, rows: errors.rows, warnings, notes, groups: checked, allocations, settings };
};

const postByMaterial = async (ctx, body, permissions = {}) => {
  const check = await checkByMaterial(ctx, body);
  if (check.rows.length || Object.keys(check.header).length) {
    throw voucherService.rowErrorsError(check, permissions);
  }
  const overrides = voucherService.assertOverrides(check, body, permissions);
  const options = { canOverIssue: !!permissions.overIssueMaterials, settings: check.settings };
  const shared = { date: body.date, notes: body.notes, reference: body.reference };

  const session = await mongoose.startSession();
  const issues = [];
  try {
    await session.withTransaction(async () => {
      issues.length = 0;
      // eslint-disable-next-line no-restricted-syntax
      for (const group of check.groups) {
        const payload = voucherService.issuePayload(group.check, shared, group.body.lines, overrides);
        // eslint-disable-next-line no-await-in-loop
        const issue = await executionService.issueMaterials(ctx, group.check.order._id, payload, {
          ...options,
          session,
        });
        issues.push(issue);
      }
    });
  } finally {
    await session.endSession();
  }
  return { issues, allocations: check.allocations };
};

module.exports = { pendingMaterials, allocate, checkByMaterial, postByMaterial };
