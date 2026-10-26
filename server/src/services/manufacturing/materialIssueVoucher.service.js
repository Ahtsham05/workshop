const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { ProductionOrder, RawMaterialReceipt, User, Batch, Imei, Bom } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { EXECUTABLE_PRODUCTION_STATUSES } = require('../../config/manufacturing');
const settingsService = require('./settings.service');
const stockService = require('./stock.service');
const executionService = require('./execution.service');
const productionOrderService = require('./productionOrder.service');
const wip = require('./wip');
const { roundQty, requireBranch, RowErrors } = require('./common');

/**
 * MIV — Material Issue Voucher: issues components from a source warehouse into a
 * production order's WIP, from the multi-row entry screen.
 *
 * The posting itself is execution.service.js#issueMaterials — the one issue pipeline
 * (paired ledger rows available → WIP, batches, serial units, WIP lots, order material
 * and cost totals, all in ONE MongoDB transaction; any failing row rolls everything back).
 * This file adds what a voucher needs around it:
 *
 *   checkVoucher — read-only: every problem at once, per row, before anything is posted.
 *     errors   never postable (bad quantity, missing serial, unknown warehouse, …)
 *     warnings postable only when a permitted user overrides them:
 *       exceeds_remaining  — more than the order still needs     → overIssueMaterials
 *       expired_batch      — an expired batch would be issued    → manageManufacturingSettings
 *       insufficient_stock — stock would go negative (only when the
 *                            "allow negative stock issue" setting is on) → issueMaterials
 *     notes    information only (e.g. which batches FEFO will take)
 *   postVoucher — re-checks, enforces overrides + permissions, then posts.
 *
 * Issue for a finished good (`body.newOrder` instead of `productionOrderId`): the voucher
 * names the product, BOM and quantity to produce. planForProduct explodes the BOM for that
 * quantity (lines keyed `new:<index>`); posting creates the production order — released,
 * BOM locked — and issues against it in the SAME transaction, so a failed issue leaves no
 * stray order behind and every issued unit is still tracked per order (WIP, consumption,
 * wastage, returns).
 */

const OVERRIDE_PERMISSION = {
  exceeds_remaining: 'overIssueMaterials',
  expired_batch: 'manageManufacturingSettings',
  insufficient_stock: 'issueMaterials',
};

const fmt = (n) => String(roundQty(n));
const dateText = (d) => new Date(d).toISOString().slice(0, 10);

/** Warehouse locations of this branch: the settings defaults plus every one in use. */
const knownLocations = async ({ organizationId, branchId }, settings) => {
  const scope = { organizationId, branchId };
  const [sources, wips, finished, receipts] = await Promise.all([
    ProductionOrder.distinct('sourceLocation', scope),
    ProductionOrder.distinct('wipLocation', scope),
    ProductionOrder.distinct('finishedGoodsLocation', scope),
    RawMaterialReceipt.distinct('location', scope),
  ]);
  return [
    settings.defaultSourceLocation,
    settings.defaultWipLocation,
    settings.defaultFinishedGoodsLocation,
    ...sources,
    ...wips,
    ...finished,
    ...receipts,
  ]
    .map((l) => String(l || '').trim())
    .filter(Boolean);
};

const NEW_LINE = /^new:(\d+)$/;

/**
 * The production order a finished-good voucher would create — built in memory only
 * (productionOrder.service#buildOrderDoc), with ids so voucher lines can point at its
 * material lines. Released from the start: it exists to be issued against right away.
 */
const buildNewOrder = async (ctx, newOrder, settings, { sourceLocation, wipLocation } = {}) => {
  const doc = await productionOrderService.buildOrderDoc(
    ctx,
    {
      productId: newOrder.productId,
      variantId: newOrder.variantId || null,
      bomId: newOrder.bomId || null,
      plannedQuantity: newOrder.plannedQuantity,
      plannedStartDate: newOrder.plannedStartDate || new Date(),
      plannedCompletionDate: newOrder.plannedCompletionDate || null,
      priority: newOrder.priority || undefined,
      ...(sourceLocation ? { sourceLocation } : {}),
      ...(wipLocation ? { wipLocation } : {}),
      notes: newOrder.notes || '',
    },
    settings
  );
  if (!doc.bomId) {
    throw new ApiError(httpStatus.BAD_REQUEST, `"${doc.productName}" has no BOM — create one to issue material for it`);
  }
  if (!doc.materials.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, `The BOM of "${doc.productName}" has no components`);
  }
  const now = new Date();
  return {
    ...doc,
    _id: new mongoose.Types.ObjectId(),
    status: 'released',
    materials: doc.materials.map((m) => ({ ...m, _id: new mongoose.Types.ObjectId() })),
    wipLots: [],
    statusHistory: [
      { from: null, to: 'draft', by: ctx.createdBy, at: now, note: 'Created from a material issue voucher' },
      { from: 'draft', to: 'released', by: ctx.createdBy, at: now, note: 'Released to issue material' },
    ],
  };
};

const loadPerson = async (organizationId, userId) => {
  if (!userId) return null;
  const user = await User.findOne({ _id: userId, organizationId }).select('name email').lean();
  return user ? { userId: user._id, name: user.name || user.email } : null;
};

/**
 * A line's batch split: `batches` [{ batchId, quantity }] (one batch picked, or several
 * when one batch can't cover the line), the older single `batchId`, or null = FEFO.
 * Repeated batches are merged; zero quantities dropped.
 */
const lineBatches = (input) => {
  if (Array.isArray(input.batches) && input.batches.length) {
    const merged = new Map();
    input.batches.forEach((b) => {
      const q = Number(b.quantity) || 0;
      if (b.batchId && q > 0) merged.set(String(b.batchId), roundQty((merged.get(String(b.batchId)) || 0) + q));
    });
    return merged.size ? [...merged].map(([batchId, quantity]) => ({ batchId, quantity })) : null;
  }
  return input.batchId ? [{ batchId: String(input.batchId), quantity: Number(input.quantity) }] : null;
};

/**
 * Everything wrong with a voucher, without changing anything.
 * Returns { order, header: {field: message}, rows: [{line, field, message}],
 *           warnings: [{line, field, code, message}], notes: [{line, field, message}], people }.
 */
const checkVoucher = async (ctx, body, { giveBack = null } = {}) => {
  const { organizationId, branchId } = ctx;
  requireBranch(branchId);
  // Editing a posted voucher: check as if it were already reversed — its quantities back
  // in stock and back on the order's still-to-issue, its serial units in stock again.
  const lineCredit = new Map();
  const itemCredit = new Map();
  const batchCredit = new Map();
  // What earlier lines of this same voucher already take from each batch.
  const batchTaken = new Map();
  const ownSerials = new Set();
  (giveBack ? giveBack.lines : []).forEach((l) => {
    const line = String(l.materialLineId);
    lineCredit.set(line, roundQty((lineCredit.get(line) || 0) + (l.creditedQuantity || 0)));
    const item = `${l.productId}:${l.variantId || ''}`;
    itemCredit.set(item, roundQty((itemCredit.get(item) || 0) + l.quantity));
    if (l.batchId) batchCredit.set(String(l.batchId), roundQty((batchCredit.get(String(l.batchId)) || 0) + l.quantity));
    (l.serialNumbers || []).forEach((sn) => ownSerials.add(sn));
  });
  const settings = await settingsService.getSettings(organizationId);
  const header = {};
  const isNew = !!body.newOrder;
  let order;
  if (isNew) {
    try {
      order = await buildNewOrder(ctx, body.newOrder, settings, body);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      header[/quantity/i.test(err.message) ? 'produceQuantity' : 'productId'] = err.message;
      return { order: null, isNew, header, rows: [], warnings: [], notes: [], people: {} };
    }
  } else {
    order = await ProductionOrder.findOne({ _id: body.productionOrderId, organizationId, branchId }).lean();
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found in this branch');
  }

  if (!EXECUTABLE_PRODUCTION_STATUSES.includes(order.status)) {
    header.productionOrderId = `${order.orderNumber} is ${order.status.replace(
      '_',
      ' '
    )} — it must be released (and not completed) to issue material`;
  }

  const known = await knownLocations(ctx, settings);
  const knownSet = new Set(known.map((l) => l.toLowerCase()));
  const source = String(body.sourceLocation || order.sourceLocation || '').trim();
  const wipLocation = String(body.wipLocation || order.wipLocation || '').trim();
  if (!source) header.sourceLocation = 'Choose the source warehouse';
  else if (!knownSet.has(source.toLowerCase()))
    header.sourceLocation = `"${source}" is not a warehouse location of this branch`;
  if (!wipLocation) header.wipLocation = 'Choose the WIP location';
  else if (!knownSet.has(wipLocation.toLowerCase()))
    header.wipLocation = `"${wipLocation}" is not a location of this branch`;
  else if (source && wipLocation.toLowerCase() === source.toLowerCase())
    header.wipLocation = 'The WIP location must differ from the source warehouse';

  const [requestedBy, issuedBy] = await Promise.all([
    loadPerson(organizationId, body.requestedById),
    loadPerson(organizationId, body.issuedById || ctx.createdBy),
  ]);
  if (body.requestedById && !requestedBy) header.requestedById = 'Not a user of this organization';
  if (body.issuedById && !issuedBy) header.issuedById = 'Not a user of this organization';

  const errors = new RowErrors();
  const warnings = [];
  const notes = [];
  const remainingByLine = new Map();
  const usedByItem = new Map();
  const seen = new Map();
  const today = stockService.startOfToday();

  const inputs = body.lines || [];
  if (!inputs.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Add at least one material to issue');

  // eslint-disable-next-line no-restricted-syntax
  for (const [index, input] of inputs.entries()) {
    const n = index + 1;
    const planned = NEW_LINE.exec(String(input.materialLineId || ''));
    let material;
    if (isNew) {
      material = planned ? order.materials[Number(planned[1])] : null;
      // The plan was made from the BOM a moment ago; if it changed since, say so.
      if (material && input.productId && String(input.productId) !== String(material.productId)) material = null;
      if (!material) {
        errors.add(n, 'product', 'Not in the BOM of this product any more — reload the materials');
        continue; // eslint-disable-line no-continue
      }
      // eslint-disable-next-line no-param-reassign
      input.materialLineId = String(material._id);
    } else {
      material = planned ? null : order.materials.find((m) => String(m._id) === String(input.materialLineId));
    }
    if (!material) {
      errors.add(n, 'product', 'Not a material of this production order');
      continue; // eslint-disable-line no-continue
    }
    let { productId, variantId } = material;
    let ratio = 1;
    if (input.alternativeProductId) {
      const alt = (material.alternatives || []).find((a) => String(a.productId) === String(input.alternativeProductId));
      if (!alt) {
        errors.add(n, 'product', `Not a listed alternative for "${material.productName}"`);
        continue; // eslint-disable-line no-continue
      }
      ({ productId, variantId } = alt);
      ratio = alt.ratio || 1;
    }
    const lineKey = `${material._id}:${input.alternativeProductId || ''}`;
    if (seen.has(lineKey)) {
      errors.add(n, 'product', `Already on line ${seen.get(lineKey)}`);
      continue; // eslint-disable-line no-continue
    }
    seen.set(lineKey, n);

    let item;
    try {
      // eslint-disable-next-line no-await-in-loop
      item = await stockService.resolveItem({ organizationId, branchId, productId, variantId });
    } catch (err) {
      errors.add(n, 'product', err.message);
      continue; // eslint-disable-line no-continue
    }

    const serials = [...new Set((input.serialNumbers || []).map((s) => String(s).trim()).filter(Boolean))];
    const quantity = item.serial ? serials.length : Number(input.quantity);
    if (item.serial && !serials.length) {
      errors.add(n, 'serials', 'Missing serial numbers — pick the units to issue');
      continue; // eslint-disable-line no-continue
    }
    if (!Number.isFinite(quantity) || !(quantity > 0)) {
      errors.add(n, 'quantity', 'Enter a quantity above 0');
      continue; // eslint-disable-line no-continue
    }
    if (item.serial && input.quantity && Math.round(input.quantity) !== serials.length) {
      errors.add(n, 'serials', `Pick exactly ${fmt(input.quantity)} serial number(s) — ${serials.length} picked`);
    }

    const itemKey = `${item.product._id}:${item.variant ? item.variant._id : ''}`;
    // The edited voucher's own quantity comes back before the new one goes out.
    const credit = itemCredit.get(`${item.product._id}:${variantId || ''}`) || 0;
    const available = roundQty(item.available + credit);
    const alreadyUsed = usedByItem.get(itemKey) || 0;
    usedByItem.set(itemKey, roundQty(alreadyUsed + quantity));

    if (item.serial) {
      // eslint-disable-next-line no-await-in-loop
      const inStock = await Imei.find({
        organizationId,
        branchId,
        productId: item.product._id,
        status: 'in_stock',
        $or: [{ imei: { $in: serials } }, { imei2: { $in: serials } }],
      })
        .select('imei imei2')
        .lean();
      const found = new Set([...inStock.flatMap((u) => [u.imei, u.imei2]).filter(Boolean), ...ownSerials]);
      const missing = serials.filter((s) => !found.has(s));
      if (missing.length) {
        errors.add(n, 'serials', `Not in stock: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
      }
    } else if (item.batchTracked) {
      // (Read-only: no Inventory row yet simply means no batches.)
      const inventoryId = item.inventory ? item.inventory._id : null;
      const freeIn = (b) =>
        roundQty(b.quantity + (batchCredit.get(String(b._id)) || 0) - (batchTaken.get(String(b._id)) || 0));
      const take = (b, q) => batchTaken.set(String(b._id), roundQty((batchTaken.get(String(b._id)) || 0) + q));
      const allocations = lineBatches({ ...input, quantity });
      if (allocations) {
        const total = roundQty(allocations.reduce((s, a) => s + a.quantity, 0));
        if (Math.abs(total - quantity) > 1e-6) {
          errors.add(
            n,
            'batchId',
            `Batch quantities add up to ${fmt(total)} ${item.unit} — the line issues ${fmt(quantity)}. Re-split the batches.`
          );
        }
        const found = inventoryId
          ? // eslint-disable-next-line no-await-in-loop
            await Batch.find({ _id: { $in: allocations.map((a) => a.batchId) }, inventoryId }).lean()
          : [];
        const byId = new Map(found.map((b) => [String(b._id), b]));
        allocations.forEach((a) => {
          const batch = byId.get(String(a.batchId));
          if (!batch) {
            errors.add(n, 'batchId', 'Batch not found for this product');
            return;
          }
          const free = freeIn(batch);
          if (free + 1e-9 < a.quantity) {
            const taken = batchTaken.get(String(batch._id)) || 0;
            errors.add(
              n,
              'batchId',
              `Batch ${batch.batchNumber} has only ${fmt(Math.max(0, free))} ${item.unit}${
                taken > 0 ? ` left after the lines above` : ''
              }, ${fmt(a.quantity)} asked`
            );
          }
          if (stockService.isExpired(batch, today)) {
            warnings.push({
              line: n,
              field: 'batchId',
              code: 'expired_batch',
              message: `Batch ${batch.batchNumber} expired on ${dateText(batch.expiryDate)}`,
            });
          }
          take(batch, a.quantity);
        });
        if (allocations.length > 1) {
          notes.push({
            line: n,
            field: 'batchId',
            message: `Split over ${allocations.length} batches: ${allocations
              .map((a) => `${(byId.get(String(a.batchId)) || {}).batchNumber || '?'} × ${fmt(a.quantity)}`)
              .join(', ')}`,
          });
        }
      } else {
        // No batch chosen: FEFO picks — say which, and never expired ones silently.
        const batches = inventoryId
          ? // eslint-disable-next-line no-await-in-loop
            await Batch.find({
              inventoryId,
              // An edited voucher's own batches count even if it emptied them.
              $or: [{ status: 'active', quantity: { $gt: 0 } }, { _id: { $in: [...batchCredit.keys()] } }],
            })
              .sort({ expiryDate: 1, createdAt: 1 })
              .lean()
          : [];
        const fresh = batches.filter((b) => !stockService.isExpired(b, today));
        const freshTotal = roundQty(fresh.reduce((s, b) => s + Math.max(0, freeIn(b)), 0));
        const allTotal = roundQty(batches.reduce((s, b) => s + Math.max(0, freeIn(b)), 0));
        const pick = (list) => {
          let left = quantity;
          const picks = [];
          list.forEach((b) => {
            const free = Math.max(0, freeIn(b));
            if (left <= 1e-9 || free <= 1e-9) return;
            const q = roundQty(Math.min(left, free));
            picks.push(`${b.batchNumber} × ${fmt(q)}`);
            take(b, q);
            left = roundQty(left - q);
          });
          return picks;
        };
        if (freshTotal + 1e-9 >= quantity) {
          const picks = pick(fresh);
          notes.push({
            line: n,
            field: 'batchId',
            message: `No batch chosen — FEFO will take ${picks.join(', ')}`,
          });
        } else if (allTotal + 1e-9 >= quantity) {
          pick(batches);
          warnings.push({
            line: n,
            field: 'batchId',
            code: 'expired_batch',
            message: `Only ${fmt(freshTotal)} ${item.unit} in unexpired batches — the rest would come from expired ones`,
          });
        } else {
          // Stock the product holds that no batch accounts for (tracking turned on with
          // stock already there, or a purchase saved without a batch) can't be issued by batch.
          const unbatched = roundQty(item.available - batches.reduce((s, b) => s + b.quantity, 0));
          errors.add(
            n,
            'batchId',
            `Missing batch stock — batches hold only ${fmt(allTotal)} ${item.unit}, ${fmt(quantity)} needed${
              unbatched > 1e-9 ? `. ${fmt(unbatched)} ${item.unit} in stock have no batch — put them into a batch first` : ''
            }`
          );
        }
      }
    } else if (alreadyUsed + quantity > available + 1e-9) {
      const message = `Insufficient stock — ${fmt(Math.max(0, available - alreadyUsed))} ${item.unit} available, ${fmt(
        quantity
      )} to issue`;
      if (settings.allowNegativeStockIssue) {
        warnings.push({
          line: n,
          field: 'quantity',
          code: 'insufficient_stock',
          message: `${message} (stock goes negative)`,
        });
      } else {
        errors.add(n, 'quantity', message);
      }
    }

    const credited = roundQty(quantity / ratio);
    const remaining = remainingByLine.has(String(material._id))
      ? remainingByLine.get(String(material._id))
      : roundQty(wip.lineOpen(material) + (lineCredit.get(String(material._id)) || 0));
    if (credited > remaining + wip.EPS) {
      warnings.push({
        line: n,
        field: 'quantity',
        code: 'exceeds_remaining',
        message: `Issuing ${fmt(credited)} ${material.unit} is more than the ${fmt(remaining)} still required`,
      });
    }
    remainingByLine.set(String(material._id), Math.max(0, roundQty(remaining - credited)));
  }

  return {
    order,
    isNew,
    settings,
    header,
    rows: errors.rows,
    warnings,
    notes,
    sourceLocation: source,
    wipLocation,
    people: { requestedBy, issuedBy },
  };
};

/** Public result of a check (no order document). */
const describeCheck = (check, permissions) => ({
  header: check.header,
  rows: check.rows,
  warnings: check.warnings.map((w) => ({
    ...w,
    permission: OVERRIDE_PERMISSION[w.code],
    allowed: !!permissions[OVERRIDE_PERMISSION[w.code]],
  })),
  notes: check.notes,
});

const rowErrorsError = (check, permissions) => {
  const first = check.rows[0];
  const headerFirst = Object.values(check.header)[0];
  const err = new ApiError(
    httpStatus.BAD_REQUEST,
    first ? `Some lines need attention: ${first.message} (line ${first.line})` : headerFirst
  );
  err.errorCode = 'ROW_ERRORS';
  err.details = describeCheck(check, permissions);
  return err;
};

/**
 * Checks and posts a voucher. `body.overrides` lists the warning codes the person chose to
 * override; each needs its permission (`permissions` = { [key]: boolean }).
 */
/** Every warning must be overridden (`body.overrides`) by someone allowed to. */
const assertOverrides = (check, body, permissions) => {
  const overrides = new Set(body.overrides || []);
  const pending = check.warnings.filter((w) => !overrides.has(w.code));
  const denied = check.warnings.filter((w) => overrides.has(w.code) && !permissions[OVERRIDE_PERMISSION[w.code]]);
  if (pending.length || denied.length) {
    const err = new ApiError(
      denied.length ? httpStatus.FORBIDDEN : httpStatus.CONFLICT,
      denied.length
        ? 'You do not have permission to override these warnings — ask a supervisor'
        : `${check.warnings.length} warning(s) need an override before posting`
    );
    err.errorCode = 'ISSUE_WARNINGS';
    err.details = describeCheck(check, permissions);
    throw err;
  }
  return overrides;
};

/** What execution.service#issueMaterials takes for one order's checked voucher lines. */
const issuePayload = (check, body, inputLines, overrides) => {
  const lines = inputLines.map((l) => ({
    materialLineId: l.materialLineId,
    alternativeProductId: l.alternativeProductId || null,
    quantity: l.serialNumbers && l.serialNumbers.length ? l.serialNumbers.length : Number(l.quantity),
    batches: lineBatches(l) || undefined,
    serialNumbers: l.serialNumbers && l.serialNumbers.length ? l.serialNumbers : undefined,
  }));

  return {
    lines,
    allowOverIssue: overrides.has('exceeds_remaining'),
    skipExpiredBatches: !overrides.has('expired_batch'),
    issueDate: body.date || undefined,
    notes: body.notes || '',
    reference: body.reference || '',
    sourceLocation: check.sourceLocation,
    wipLocation: check.wipLocation,
    requestedBy: check.people.requestedBy || undefined,
    issuedBy: check.people.issuedBy || undefined,
    overrides: check.warnings.map((w) => ({ line: w.line, code: w.code, message: w.message })),
  };
};

const postVoucher = async (ctx, body, permissions = {}) => {
  const check = await checkVoucher(ctx, body);
  if (check.rows.length || Object.keys(check.header).length) throw rowErrorsError(check, permissions);
  const overrides = assertOverrides(check, body, permissions);
  const payload = issuePayload(check, body, body.lines, overrides);
  const options = { canOverIssue: !!permissions.overIssueMaterials };
  if (!check.isNew) return executionService.issueMaterials(ctx, check.order._id, payload, options);

  // Finished-good voucher: the order and the issue commit together, or neither does.
  const { order } = check;
  const session = await mongoose.startSession();
  let issue;
  try {
    await session.withTransaction(async () => {
      const numbers = await productionOrderService.assignNumbers(ctx, order, { session });
      await ProductionOrder.create([{ ...order, ...numbers }], { session });
      // Released against this BOM version — later edits go into a new version.
      await Bom.updateOne(
        { _id: order.bomId, organizationId: ctx.organizationId },
        { $set: { isLocked: true } },
        { session }
      );
      issue = await executionService.issueMaterials(ctx, order._id, payload, {
        ...options,
        session,
        settings: check.settings,
      });
    });
  } finally {
    await session.endSession();
  }
  return issue;
};

/**
 * What issuing for `quantity` of a finished good takes: its BOM exploded for that quantity
 * (what the new order's material lines will be), with on-hand stock and what open orders
 * already hold. Also the product's BOM versions and its open orders, so the screen can offer
 * issuing against one of those instead of starting a new order.
 */
const planForProduct = async (ctx, { productId, variantId, bomId, quantity }) => {
  const { organizationId, branchId } = ctx;
  requireBranch(branchId);
  const settings = await settingsService.getSettings(organizationId);
  const order = await buildNewOrder(ctx, { productId, variantId, bomId, plannedQuantity: quantity }, settings);
  const items = order.materials.flatMap((m) => [
    { productId: m.productId, variantId: m.variantId },
    ...(m.alternatives || []).map((a) => ({ productId: a.productId, variantId: a.variantId })),
  ]);
  const key = (m) => `${m.productId}:${m.variantId || ''}`;
  const [availability, holders, boms, openOrders] = await Promise.all([
    stockService.getAvailability({ organizationId, branchId, items }),
    ProductionOrder.find({
      organizationId,
      branchId,
      status: { $in: productionOrderService.RESERVING_STATUSES },
      'materials.productId': { $in: order.materials.map((m) => m.productId) },
    })
      .select('materials')
      .lean(),
    Bom.find({ organizationId, branchId, productId: order.productId, isActive: true })
      .select('bomNumber version name quantity unit isDefault')
      .sort({ version: -1 })
      .lean(),
    ProductionOrder.find({
      organizationId,
      branchId,
      productId: order.productId,
      status: { $in: EXECUTABLE_PRODUCTION_STATUSES },
    })
      .select('orderNumber status plannedQuantity completedQuantity unit materials createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);
  const held = new Map();
  holders.forEach((o) =>
    o.materials.forEach((m) => {
      if (m.isOptional) return;
      held.set(key(m), roundQty((held.get(key(m)) || 0) + wip.lineRemaining(m)));
    })
  );
  const lines = order.materials.map((m, index) => {
    const available = roundQty(availability.get(key(m)) || 0);
    // Production-stock material is used from the floor at receipt, never issued here.
    const outstanding = wip.lineRemaining(m);
    return {
      materialLineId: `new:${index}`,
      supply: m.supply || 'order',
      productId: String(m.productId),
      variantId: m.variantId ? String(m.variantId) : null,
      productName: m.productName,
      sku: m.sku,
      unit: m.unit,
      level: m.level,
      isOptional: !!m.isOptional,
      baseQuantity: m.baseQuantity,
      requiredQuantity: m.requiredQuantity,
      perUnit: roundQty(m.requiredQuantity / order.plannedQuantity),
      issuedQuantity: 0,
      returnedQuantity: 0,
      consumedQuantity: 0,
      scrappedQuantity: 0,
      wipQuantity: 0,
      outstandingQuantity: outstanding,
      availableQuantity: available,
      shortageQuantity: m.isOptional ? 0 : Math.max(0, roundQty(outstanding - Math.max(0, available))),
      // Not reserved yet — the order doesn't exist. What other open orders still need:
      reservedQuantity: 0,
      heldByEarlierOrdersQuantity: held.get(key(m)) || 0,
      heldByEarlierOrders: [],
      netShortageQuantity: 0,
      alternatives: (m.alternatives || []).map((a) => ({
        ...a,
        productId: String(a.productId),
        variantId: a.variantId ? String(a.variantId) : null,
        availableQuantity: roundQty(availability.get(key(a)) || 0),
      })),
    };
  });
  // eslint-disable-next-line global-require
  await require('./floorStock.service').annotateFloorLines(ctx, lines);
  return {
    productId: String(order.productId),
    variantId: order.variantId ? String(order.variantId) : null,
    productName: order.productName,
    unit: order.unit,
    quantity: order.plannedQuantity,
    bom: { id: String(order.bomId), bomNumber: order.bomNumber, version: order.bomVersion },
    boms: boms.map((b) => ({
      id: String(b._id),
      bomNumber: b.bomNumber,
      version: b.version,
      name: b.name,
      quantity: b.quantity,
      unit: b.unit,
      isDefault: !!b.isDefault,
    })),
    lines,
    shortageCount: lines.filter((l) => l.shortageQuantity > 0).length,
    openOrders: openOrders.map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber,
      status: o.status,
      plannedQuantity: o.plannedQuantity,
      completedQuantity: o.completedQuantity || 0,
      unit: o.unit,
      // How much of its material is still to issue (0–100).
      openPercent: (() => {
        const req = o.materials.reduce((s, m) => s + (m.requiredQuantity || 0), 0);
        const left = o.materials.reduce((s, m) => s + wip.lineRemaining(m), 0);
        return req > 0 ? Math.round((left / req) * 100) : 0;
      })(),
    })),
  };
};

module.exports = {
  lineBatches,
  checkVoucher,
  describeCheck,
  rowErrorsError,
  assertOverrides,
  issuePayload,
  postVoucher,
  planForProduct,
  knownLocations,
  OVERRIDE_PERMISSION,
};
