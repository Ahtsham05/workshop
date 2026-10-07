const httpStatus = require('http-status');
const logger = require('../../config/logger');
const {
  Organization,
  Category,
  Product,
  ProductVariant,
  Inventory,
  InventoryTransaction,
  Bom,
  ProductionOrder,
  MaterialIssue,
  ProductionReceipt,
  ProductionOutput,
  ScrapRecord,
  ManufacturingSettings,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const bomService = require('./bom.service');
const productionOrderService = require('./productionOrder.service');
const executionService = require('./execution.service');
const settingsService = require('./settings.service');
const { roundQty, requireBranch, scopeFilter } = require('./common');

/**
 * Manufacturing demo data — a small ceiling-fan factory loaded into one branch so every
 * screen of the module has something real to show: a 3-level BOM (Ceiling Fan → Motor
 * Assembly → Stator Winding → copper wire), a batch BOM (10 exhaust fans), a locked v1
 * with a newer default v2, an inactive trial version, optional and alternative
 * components, and production orders in every status, exercising the full Phase 2 flow —
 * material issue (including a scrap-and-replace cycle, a permission-gated over-issue, and
 * a material return), output reporting, quality inspection (good/rejected, scrap and
 * rework dispositions), the rework queue, manual material/finished-good scrap, overdue
 * orders and material shortages.
 *
 * Everything goes through the real BOM / production-order / execution services (not raw
 * inserts) so stock, cost roll-ups, BOM locking, WIP/QC bucket balances and the inventory
 * ledger behave exactly as if someone had worked through it by hand; only the timestamps
 * are then moved back onto the scenario's timeline (last ~5 weeks) so the dashboard trend
 * and history read naturally.
 *
 * Products are tagged `isDemo` + DEMO_TAG, manufacturing documents `isDemo`, so
 * clearDemoData can remove exactly this set without touching anything the user made.
 */

const DEMO_TAG = 'manufacturing-demo';
const DEMO_CATEGORY = 'Manufacturing Demo';

// Prices below are in USD; scaled to the organization's base currency so the demo looks
// plausible whatever currency the business runs in (null = the app's PKR default).
const CURRENCY_FACTOR = {
  USD: 1,
  GBP: 0.8,
  EUR: 0.9,
  PKR: 280,
  INR: 85,
  BDT: 120,
  AED: 3.7,
  SAR: 3.75,
  CAD: 1.35,
  AUD: 1.5,
};

const PRODUCTS = [
  // Raw materials
  {
    key: 'copper',
    name: 'Copper Enamelled Wire 0.35mm',
    sku: 'DEMO-RM-CU35',
    type: 'raw_material',
    unit: 'kg',
    cost: 12,
    price: 15,
    stock: 40,
  },
  {
    key: 'lam',
    name: 'Silicon Steel Laminations',
    sku: 'DEMO-RM-LAM',
    type: 'raw_material',
    unit: 'kg',
    cost: 2.5,
    price: 3.2,
    stock: 150,
  },
  {
    key: 'alu',
    name: 'Aluminium Sheet 1mm',
    sku: 'DEMO-RM-AL1',
    type: 'raw_material',
    unit: 'kg',
    cost: 3.2,
    price: 4,
    stock: 300,
  },
  {
    key: 'paper',
    name: 'Insulation Paper Sheet',
    sku: 'DEMO-RM-INS',
    type: 'raw_material',
    unit: 'sheet',
    cost: 0.15,
    price: 0.25,
    stock: 400,
  },
  {
    key: 'paint',
    name: 'Powder Coating Paint (White)',
    sku: 'DEMO-RM-PNT',
    type: 'raw_material',
    unit: 'kg',
    cost: 6,
    price: 8,
    stock: 18,
    low: 10,
  },
  {
    key: 'shaft',
    name: 'Steel Shaft Rod 12mm',
    sku: 'DEMO-RM-SFT',
    type: 'raw_material',
    unit: 'm',
    cost: 2,
    price: 2.8,
    stock: 60,
  },
  // Bought-in components
  {
    key: 'bearing',
    name: 'Ball Bearing 6201',
    sku: 'DEMO-CP-B6201',
    type: 'component',
    unit: 'pcs',
    cost: 0.8,
    price: 1.2,
    stock: 180,
  },
  {
    key: 'bearingImp',
    name: 'Ball Bearing 6201 (Imported)',
    sku: 'DEMO-CP-B6201I',
    type: 'component',
    unit: 'pcs',
    cost: 1.2,
    price: 1.8,
    stock: 60,
  },
  {
    key: 'cap',
    name: 'Fan Capacitor 2.5µF',
    sku: 'DEMO-CP-CAP25',
    type: 'component',
    unit: 'pcs',
    cost: 0.6,
    price: 1,
    stock: 70,
  },
  {
    key: 'canopy',
    name: 'Canopy & Down-rod Kit',
    sku: 'DEMO-CP-CNPY',
    type: 'component',
    unit: 'set',
    cost: 2.5,
    price: 3.5,
    stock: 130,
  },
  {
    key: 'screws',
    name: 'Screw & Fastener Pack',
    sku: 'DEMO-CP-SCRW',
    type: 'component',
    unit: 'pack',
    cost: 0.3,
    price: 0.5,
    stock: 400,
  },
  {
    key: 'stand',
    name: 'Pedestal Stand Base',
    sku: 'DEMO-CP-STND',
    type: 'component',
    unit: 'pcs',
    cost: 6,
    price: 8,
    stock: 25,
    low: 5,
  },
  {
    key: 'grill',
    name: 'Safety Guard Grill',
    sku: 'DEMO-CP-GRL',
    type: 'component',
    unit: 'pcs',
    cost: 2.2,
    price: 3,
    stock: 150,
  },
  {
    key: 'remote',
    name: 'Remote Control Kit',
    sku: 'DEMO-CP-RMT',
    type: 'component',
    unit: 'set',
    cost: 3,
    price: 5,
    stock: 25,
  },
  // Packaging
  {
    key: 'carton',
    name: 'Fan Carton Box',
    sku: 'DEMO-PK-CTN',
    type: 'packaging_material',
    unit: 'pcs',
    cost: 0.9,
    price: 1.2,
    stock: 260,
  },
  {
    key: 'thermocol',
    name: 'Thermocol Packing Set',
    sku: 'DEMO-PK-THM',
    type: 'packaging_material',
    unit: 'set',
    cost: 0.4,
    price: 0.6,
    stock: 200,
  },
  {
    key: 'manual',
    name: 'User Manual & Warranty Card',
    sku: 'DEMO-PK-MNL',
    type: 'packaging_material',
    unit: 'pcs',
    cost: 0.05,
    price: 0.1,
    stock: 500,
  },
  // Made in-house
  {
    key: 'stator',
    name: 'Stator Winding Assembly',
    sku: 'DEMO-SA-STR',
    type: 'sub_assembly',
    proc: 'make',
    unit: 'pcs',
    cost: 9,
    price: 12,
    stock: 25,
    lead: 2,
  },
  {
    key: 'motor',
    name: 'Motor Assembly (Fan)',
    sku: 'DEMO-SA-MTR',
    type: 'sub_assembly',
    proc: 'make',
    unit: 'pcs',
    cost: 18,
    price: 24,
    stock: 50,
    lead: 2,
  },
  {
    key: 'blades',
    name: 'Blade Set (3 pcs)',
    sku: 'DEMO-SA-BLD',
    type: 'sub_assembly',
    proc: 'make',
    unit: 'set',
    cost: 5,
    price: 7,
    stock: 40,
    lead: 1,
  },
  {
    key: 'ceiling',
    name: 'Ceiling Fan 56" Deluxe',
    sku: 'DEMO-FG-CF56',
    type: 'finished_good',
    proc: 'make',
    unit: 'pcs',
    cost: 35,
    price: 55,
    stock: 6,
    lead: 3,
  },
  {
    key: 'pedestal',
    name: 'Pedestal Fan 24"',
    sku: 'DEMO-FG-PF24',
    type: 'finished_good',
    proc: 'make',
    unit: 'pcs',
    cost: 30,
    price: 48,
    stock: 4,
    lead: 3,
  },
  {
    key: 'exhaust',
    name: 'Exhaust Fan 12"',
    sku: 'DEMO-FG-EF12',
    type: 'finished_good',
    proc: 'make',
    unit: 'pcs',
    cost: 12,
    price: 20,
    stock: 10,
    lead: 2,
  },
  // Recovered from rewinding — classified only, no flow in Phase 1
  {
    key: 'copperScrap',
    name: 'Copper Scrap',
    sku: 'DEMO-SC-CU',
    type: 'scrap',
    proc: null,
    unit: 'kg',
    cost: 6,
    price: 7,
    stock: 0,
  },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Progress steps the scenario reports (products + every BOM / order / status / issue /
// return / output / rework / scrap) — only drives the progress bar, so being off by a few
// is harmless.
const TOTAL_STEPS = 80;
// A running load whose heartbeat is older than this was cut short (e.g. a server restart).
const STALE_JOB_MS = 90 * 1000;

const isDemoProductFilter = (ctx) => ({ ...scopeFilter(ctx), isDemo: true, tags: DEMO_TAG });

/** The org's demo-load job as the client sees it — only when it concerns this branch. */
const jobView = (job, branchId) => {
  if (!job || !job.state || (branchId && String(job.branchId) !== String(branchId))) return null;
  const stale = job.state === 'running' && (!job.heartbeatAt || Date.now() - job.heartbeatAt.getTime() > STALE_JOB_MS);
  const total = job.total || TOTAL_STEPS;
  return {
    state: stale ? 'interrupted' : job.state,
    action: job.action,
    step: job.step || 0,
    total,
    percent: job.state === 'done' ? 100 : Math.min(99, Math.round(((job.step || 0) / total) * 100)),
    message: job.message || '',
    error: job.error || '',
    result: job.result || null,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
};

const isJobLive = (job) =>
  !!job && job.state === 'running' && !!job.heartbeatAt && Date.now() - job.heartbeatAt.getTime() <= STALE_JOB_MS;

/** Counts of this branch's (or org's) manufacturing demo records. */
const getDemoStatus = async (ctx) => {
  const docFilter = { ...scopeFilter(ctx), isDemo: true };
  const [products, boms, orders, issues, returns, outputs, receipts, scrap] = await Promise.all([
    Product.countDocuments(isDemoProductFilter(ctx)),
    Bom.countDocuments(docFilter),
    ProductionOrder.countDocuments(docFilter),
    MaterialIssue.countDocuments({ ...docFilter, kind: { $ne: 'return' } }),
    MaterialIssue.countDocuments({ ...docFilter, kind: 'return' }),
    ProductionOutput.countDocuments(docFilter),
    ProductionReceipt.countDocuments(docFilter),
    ScrapRecord.countDocuments(docFilter),
  ]);
  const settings = await ManufacturingSettings.findOne({ organizationId: ctx.organizationId }).select('demoJob').lean();
  return {
    hasDemoData: products + boms + orders > 0,
    products,
    boms,
    orders,
    issues,
    returns,
    outputs,
    receipts,
    scrap,
    job: jobView(settings && settings.demoJob, ctx.branchId),
  };
};

const currencyFactor = async (organizationId) => {
  const org = await Organization.findById(organizationId).select('baseCurrency').lean();
  return CURRENCY_FACTOR[(org && org.baseCurrency) || 'PKR'] || 1;
};

const scaleMoney = (usd, factor) => {
  const value = usd * factor;
  return value >= 20 ? Math.round(value) : Math.round(value * 100) / 100;
};

const seedProducts = async ({ organizationId, branchId, createdBy }) => {
  const factor = await currencyFactor(organizationId);
  // SKUs are unique per branch — drop ours rather than fail if one is already taken.
  const taken = new Set(
    await Product.distinct('sku', { organizationId, branchId, sku: { $in: PRODUCTS.map((p) => p.sku) } })
  );
  let category = null;
  try {
    category = await Category.create({ organizationId, branchId, createdBy, isDemo: true, name: DEMO_CATEGORY });
  } catch (err) {
    logger.warn(`Manufacturing demo: category not created — ${err.message}`);
  }
  const docs = await Product.insertMany(
    PRODUCTS.map((p) => ({
      organizationId,
      branchId,
      createdBy,
      isDemo: true,
      tags: [DEMO_TAG],
      name: p.name,
      ...(taken.has(p.sku) ? {} : { sku: p.sku }),
      unit: p.unit,
      cost: scaleMoney(p.cost, factor),
      price: scaleMoney(p.price, factor),
      stockQuantity: p.stock,
      lowStockThreshold: p.low ?? null,
      category: category ? category.name : undefined,
      categories: category ? [{ _id: category._id, name: category.name }] : [],
      productType: p.type,
      procurementType: p.proc === undefined ? 'buy' : p.proc,
      manufacturingLeadTimeDays: p.lead ?? null,
      description: 'Manufacturing demo data — remove it from Manufacturing → Settings.',
    }))
  );
  return Object.fromEntries(PRODUCTS.map((p, i) => [p.key, docs[i]]));
};

/**
 * Runs the scenario. `at(day, hour)` is a point on the timeline (day 0 = today, -3 = three
 * days ago), never later than a few minutes before now.
 */
const runScenario = async (ctx, P, step) => {
  const now = Date.now();
  const seedStartedAt = new Date(now);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const latest = now - 30 * 60 * 1000;
  const at = (day, hour = 10, minute = 0) => {
    const date = new Date(todayStart.getTime() + day * MS_PER_DAY);
    date.setHours(hour, minute, 0, 0);
    if (day > 0 || date.getTime() <= latest) return date;
    // Today's events that haven't "happened" yet: squeeze them into the half hour before
    // now, keeping their order (later hour → closer to now).
    return new Date(latest + ((hour * 60 + minute) / (24 * 60)) * 25 * 60 * 1000);
  };
  const id = (key) => P[key]._id;
  const counts = { boms: 0, orders: 0, issues: 0, returns: 0, outputs: 0, receipts: 0, scrap: 0 };

  // Moves everything stamped with the real clock during this run onto the scenario date.
  const backdate = (Model, docId, date) =>
    Model.collection.updateOne({ _id: docId }, { $set: { createdAt: date, updatedAt: date } });

  // One round trip: any history entry / start / completion date written by the real clock
  // since the run began (i.e. by the call just made) moves to `date`.
  const fresh = (field) => ({ $gte: [field, seedStartedAt] });
  const stampOrder = (orderId, date) =>
    ProductionOrder.collection.updateOne({ _id: orderId }, [
      {
        $set: {
          updatedAt: date,
          actualStartDate: { $cond: [fresh('$actualStartDate'), date, '$actualStartDate'] },
          actualCompletionDate: { $cond: [fresh('$actualCompletionDate'), date, '$actualCompletionDate'] },
          statusHistory: {
            $map: {
              input: '$statusHistory',
              in: { $cond: [fresh('$$this.at'), { $mergeObjects: ['$$this', { at: date }] }, '$$this'] },
            },
          },
        },
      },
    ]);

  // ── BOMs ──────────────────────────────────────────────────────────────────────
  const createBom = async (day, body) => {
    const bom = await bomService.createBom(ctx, { ...body, isDemo: true });
    await backdate(Bom, bom._id, at(day, 11));
    counts.boms += 1;
    step(`Bill of materials — ${bom.productName}`);
    return bom;
  };
  const line = (key, quantity, extra = {}) => ({ productId: id(key), quantity, ...extra });

  const statorBom = await createBom(-35, {
    productId: id('stator'),
    quantity: 1,
    name: 'Stator winding — 56" fan motor',
    notes: '320 turns, 0.35mm wire. Varnish and bake 2h at 120°C.',
    components: [
      line('copper', 0.35, { scrapPercent: 5, notes: 'Includes lead-out wire' }),
      line('lam', 1.2, { scrapPercent: 2 }),
      line('paper', 4),
    ],
  });
  const motorBom = await createBom(-35, {
    productId: id('motor'),
    quantity: 1,
    name: 'Fan motor assembly',
    components: [
      line('stator', 1, { childBomId: statorBom._id, notes: 'Pinned to stator BOM v1' }),
      line('bearing', 2, { alternatives: [{ productId: id('bearingImp'), ratio: 1 }] }),
      line('shaft', 0.35),
      line('alu', 0.8, { scrapPercent: 3, notes: 'Die-cast rotor body' }),
      line('cap', 1),
      line('screws', 1),
    ],
  });
  const bladesBom = await createBom(-35, {
    productId: id('blades'),
    quantity: 1,
    name: 'Blade set — 3 blades',
    components: [line('alu', 1.5, { scrapPercent: 4 }), line('paint', 0.15, { scrapPercent: 5 }), line('screws', 1)],
  });
  const ceilingV1 = await createBom(-34, {
    productId: id('ceiling'),
    quantity: 1,
    components: [
      line('motor', 1),
      line('blades', 1),
      line('canopy', 1),
      line('paint', 0.05),
      line('carton', 1),
      line('thermocol', 1),
      line('manual', 1),
    ],
  });
  const pedestalBom = await createBom(-34, {
    productId: id('pedestal'),
    quantity: 1,
    components: [
      line('motor', 1),
      line('blades', 1),
      line('stand', 1),
      line('grill', 2),
      line('carton', 1),
      line('thermocol', 1),
      line('manual', 1),
    ],
  });
  const exhaustBom = await createBom(-33, {
    productId: id('exhaust'),
    quantity: 10,
    name: 'Exhaust fan — batch of 10',
    notes: 'Motor wound in-line; built in batches of 10.',
    components: [
      line('copper', 1.2, { scrapPercent: 5 }),
      line('lam', 5, { scrapPercent: 2 }),
      line('bearing', 20, { alternatives: [{ productId: id('bearingImp'), ratio: 1 }] }),
      line('alu', 6, { scrapPercent: 3 }),
      line('grill', 10),
      line('screws', 10),
      line('carton', 10),
      line('manual', 10),
    ],
  });

  // ── Production orders ─────────────────────────────────────────────────────────
  const createOrder = async (day, body) => {
    const order = await productionOrderService.createOrder(ctx, { ...body, isDemo: true });
    const date = at(day, 9, 15);
    await Promise.all([backdate(ProductionOrder, order._id, date), stampOrder(order._id, date)]);
    counts.orders += 1;
    step(`Production order ${order.orderNumber} — ${order.productName}`);
    return order;
  };
  const setStatus = async (order, status, day, hour = 9, note, wipDisposition) => {
    await productionOrderService.changeStatus(ctx, order._id, { status, note, wipDisposition });
    await stampOrder(order._id, at(day, hour, 30));
    step(`${order.orderNumber} → ${status.replace('_', ' ')}`);
  };
  const keyOf = (productId) => Object.keys(P).find((k) => String(P[k]._id) === String(productId));

  /**
   * Still to be issued for a line, mirroring execution/wip.js#lineRemaining: requirement
   * minus what's issued, plus what's been returned or scrapped (scrapped WIP has to be
   * replaced before the order can be fully output).
   */
  const lineRemaining = (m) =>
    Math.max(0, roundQty(m.requiredQuantity - m.issuedQuantity + (m.returnedQuantity || 0) + (m.scrappedQuantity || 0)));

  /**
   * Issues material into the order's WIP. `fraction[key]` scales a line's still-remaining
   * quantity (default 1 for a required line, 0 for an optional one, so a bare call tops up
   * every required line to exactly what's still needed — including after a scrap).
   * `extra[key]` issues an exact quantity instead, regardless of what's remaining — how a
   * deliberate over-issue is demonstrated (with `allowOverIssue`/`canOverIssue`).
   * `alternative[key]` substitutes part of a line with one of its listed alternatives.
   */
  const issue = async (
    order,
    day,
    {
      fraction = {},
      extra = {},
      alternative = {},
      allowOverIssue = false,
      canOverIssue = false,
      notes,
      hour = 10,
      minute = 20,
    } = {}
  ) => {
    const current = await ProductionOrder.findById(order._id);
    const lines = [];
    // A material line may only appear once per issue (the server rejects a repeat), so a
    // line sourced partly from its alternative needs two separate issue() calls — one for
    // each product. When `alternative[key]` is set, this call issues ONLY that alternative
    // quantity for that line; the primary portion is a plain call (see order 8, below).
    current.materials.forEach((m) => {
      const key = keyOf(m.productId);
      const alt = alternative[key];
      if (alt) {
        lines.push({ materialLineId: m._id, quantity: roundQty(alt.quantity), alternativeProductId: id(alt.key) });
        return;
      }
      const qty =
        extra[key] !== undefined
          ? roundQty(extra[key])
          : roundQty(lineRemaining(m) * (fraction[key] ?? (m.isOptional ? 0 : 1)));
      if (qty <= 0) return;
      lines.push({ materialLineId: m._id, quantity: qty });
    });
    const date = at(day, hour, minute);
    const doc = await executionService.issueMaterials(
      ctx,
      order._id,
      { lines, allowOverIssue, issueDate: date, notes },
      { canOverIssue }
    );
    await Promise.all([backdate(MaterialIssue, doc._id, date), stampOrder(order._id, date)]);
    counts.issues += 1;
    step(`Material issue ${doc.issueNumber} for ${order.orderNumber}`);
    return doc;
  };

  /** Returns part of a WIP lot (as named by a prior issue's own `lines[].wipLotId`) to stock. */
  const returnMaterial = async (order, day, wipLotId, quantity, { notes, hour = 11, minute = 30 } = {}) => {
    const doc = await executionService.returnMaterials(ctx, order._id, { lines: [{ wipLotId, quantity }], notes });
    const date = at(day, hour, minute);
    await Promise.all([backdate(MaterialIssue, doc._id, date), stampOrder(order._id, date)]);
    counts.returns += 1;
    step(`Material return ${doc.issueNumber} for ${order.orderNumber}`);
    return doc;
  };

  /**
   * Reports `quantity` of output and inspects it straight away (quality checks stay on
   * throughout the demo, as they default to): `good`/`rejected` split all-good unless
   * given. `disposition` ('scrap' | 'rework') and `reason` only matter when something is
   * rejected — scrap posts a `qc_reject` scrap record automatically, rework joins the
   * order's rework queue (see `rework()` below).
   */
  const produce = async (order, day, quantity, { good, rejected = 0, disposition, reason, notes, hour = 15 } = {}) => {
    const goodQuantity = good ?? roundQty(quantity - rejected);
    const output = await executionService.reportOutput(ctx, order._id, { producedQuantity: quantity, notes });
    const reportDate = at(day, hour, 0);
    await backdate(ProductionOutput, output._id, reportDate);
    const inspected = await executionService.inspectOutput(ctx, output._id, {
      goodQuantity,
      rejectedQuantity: rejected,
      rejectDisposition: rejected > 0 ? disposition : undefined,
      rejectReason: reason,
      inspectionNotes: notes,
    });
    const inspectDate = at(day, hour, 40);
    await Promise.all([
      backdate(ProductionOutput, inspected._id, inspectDate),
      inspected.receiptId ? backdate(ProductionReceipt, inspected.receiptId, inspectDate) : null,
      inspected.scrapId ? backdate(ScrapRecord, inspected.scrapId, inspectDate) : null,
      stampOrder(order._id, inspectDate),
    ]);
    if (inspected.receiptId) counts.receipts += 1;
    if (inspected.scrapId) counts.scrap += 1;
    counts.outputs += 1;
    step(`Output ${output.outputNumber} for ${order.orderNumber}`);
    return inspected;
  };

  /** Resolves the order's rework queue: `good` units pass to finished stock, `scrap` fail. */
  const rework = async (order, day, { good = 0, scrap: scrapQty = 0, notes, hour = 16 } = {}) => {
    const result = await executionService.resolveRework(ctx, order._id, {
      goodQuantity: good,
      scrapQuantity: scrapQty,
      notes,
    });
    const date = at(day, hour, 0);
    await Promise.all([
      result.receipt ? backdate(ProductionReceipt, result.receipt._id, date) : null,
      result.scrap ? backdate(ScrapRecord, result.scrap._id, date) : null,
      stampOrder(order._id, date),
    ]);
    if (result.receipt) counts.receipts += 1;
    if (result.scrap) counts.scrap += 1;
    step(`Rework resolved on ${order.orderNumber}`);
    return result;
  };

  /**
   * Manual scrap: `stage: 'material'` takes it out of an order's WIP (`materialKey` names
   * the line); `stage: 'finished_good'` writes off available stock (`productId`).
   */
  const scrap = async (order, day, { stage, materialKey, productId, quantity, reason, notes, hour = 14 }) => {
    let materialLineId;
    if (stage === 'material') {
      const current = await ProductionOrder.findById(order._id);
      materialLineId = current.materials.find((m) => String(m.productId) === String(id(materialKey)))._id;
    }
    const date = at(day, hour, 10);
    const doc = await executionService.recordScrap(ctx, {
      productionOrderId: order ? order._id : undefined,
      stage,
      materialLineId,
      productId,
      quantity,
      reason,
      notes,
      scrapDate: date,
    });
    await Promise.all([backdate(ScrapRecord, doc._id, date), order ? stampOrder(order._id, date) : null]);
    counts.scrap += 1;
    step(`Scrap ${doc.scrapNumber} on ${order ? order.orderNumber : doc.productName}`);
    return doc;
  };

  const plan = (day, days) => ({ plannedStartDate: at(day, 8), plannedCompletionDate: at(day + days, 18) });

  // 1. Stator windings — completed four weeks ago
  const o1 = await createOrder(-27, {
    productId: id('stator'),
    plannedQuantity: 40,
    ...plan(-26, 2),
    notes: 'Stock build for motor line',
  });
  await setStatus(o1, 'released', -26, 8);
  await issue(o1, -26);
  await produce(o1, -25, 25);
  await produce(o1, -24, 15);
  await setStatus(o1, 'completed', -24, 17, undefined, 'return');

  // 2. Motor assemblies — completed. Demonstrates the full WIP lifecycle: material
  //    scrapped out of WIP, a top-up issue that exactly replaces it, a deliberate
  //    over-issue (needs allowOverIssue + the overIssueMaterials permission), and that
  //    extra unit returned to stock before output.
  const o2 = await createOrder(-24, { productId: id('motor'), plannedQuantity: 30, ...plan(-23, 3), priority: 'high' });
  await setStatus(o2, 'released', -23, 8);
  await issue(o2, -23);
  await scrap(o2, -22, {
    stage: 'material',
    materialKey: 'bearing',
    quantity: 2,
    reason: 'defect',
    notes: 'Noisy bearings rejected at test',
    hour: 14,
  });
  await issue(o2, -22, { notes: 'Replacing the 2 scrapped bearings', hour: 15, minute: 0 });
  const overIssue = await issue(o2, -22, {
    extra: { bearing: 1 },
    allowOverIssue: true,
    canOverIssue: true,
    notes: 'Extra bearing pulled by mistake',
    hour: 15,
    minute: 30,
  });
  await returnMaterial(o2, -22, overIssue.lines[0].wipLotId, overIssue.lines[0].quantity, {
    notes: 'Unused extra bearing returned to stock',
    hour: 16,
  });
  await produce(o2, -21, 18);
  await produce(o2, -20, 12);
  await setStatus(o2, 'completed', -20, 17, undefined, 'return');

  // 3. Blade sets — completed short: two sets failed quality inspection in the second
  //    batch and were scrapped (a `qc_reject` scrap record, posted automatically).
  const o3 = await createOrder(-20, { productId: id('blades'), plannedQuantity: 40, ...plan(-19, 2) });
  await setStatus(o3, 'released', -19, 8);
  await issue(o3, -19);
  await produce(o3, -18, 20);
  await produce(o3, -17, 20, {
    rejected: 2,
    disposition: 'scrap',
    reason: 'Failed dynamic balancing',
  });
  await setStatus(o3, 'completed', -17, 18, 'Closed at 38 good — 2 sets rejected at QC', 'return');

  // 4. Ceiling fans on recipe v1 — releasing it locks v1
  const o4 = await createOrder(-16, {
    productId: id('ceiling'),
    bomId: ceilingV1._id,
    plannedQuantity: 25,
    ...plan(-15, 4),
    notes: 'Dealer order — Hassan Electric',
  });
  await setStatus(o4, 'released', -15, 8);
  await issue(o4, -15);
  await produce(o4, -13, 10);
  await produce(o4, -12, 10);
  await produce(o4, -11, 5);
  await setStatus(o4, 'completed', -11, 17, undefined, 'return');

  // Cancelled before release
  const o15 = await createOrder(-12, { productId: id('pedestal'), plannedQuantity: 15, ...plan(-8, 3), status: 'planned' });
  await setStatus(o15, 'cancelled', -10, 11, 'Customer order withdrawn');

  // 5. Exhaust fans — batch BOM (10 per batch); a setup loss of copper, topped back up.
  const o5 = await createOrder(-12, { productId: id('exhaust'), plannedQuantity: 30, ...plan(-10, 3) });
  await setStatus(o5, 'released', -10, 8);
  await issue(o5, -10);
  await scrap(o5, -10, {
    stage: 'material',
    materialKey: 'copper',
    quantity: 0.2,
    reason: 'setup',
    notes: 'Winding machine set-up',
    hour: 14,
  });
  await issue(o5, -10, { notes: 'Topping up copper after the set-up loss', hour: 15, minute: 0 });
  await produce(o5, -9, 20);
  await produce(o5, -8, 10);
  await setStatus(o5, 'completed', -8, 17, undefined, 'return');

  // 6. Pedestal fans — completed; one later dropped in the store and written off.
  const o6 = await createOrder(-9, { productId: id('pedestal'), plannedQuantity: 10, ...plan(-8, 3) });
  await setStatus(o6, 'released', -8, 8);
  await issue(o6, -8);
  await produce(o6, -6, 6);
  await produce(o6, -5, 4);
  await setStatus(o6, 'completed', -5, 17, undefined, 'return');
  await scrap(o6, -4, {
    stage: 'finished_good',
    productId: id('pedestal'),
    quantity: 1,
    reason: 'damage',
    notes: 'Dropped during loading — guard and blade bent',
  });

  // Recipe change: v1 is locked, so the change goes into v2 (now the default)
  const ceilingV2 = await bomService.createNewVersion(ctx, ceilingV1._id, {
    isDefault: true,
    notes: 'v2: second paint coat, optional remote-control kit for the Deluxe+ variant.',
    components: [
      line('motor', 1),
      line('blades', 1),
      line('canopy', 1),
      line('paint', 0.06),
      line('remote', 1, { isOptional: true, notes: 'Deluxe+ only' }),
      line('carton', 1),
      line('thermocol', 1),
      line('manual', 1),
    ],
  });
  await backdate(Bom, ceilingV2._id, at(-6, 12));
  counts.boms += 1;
  step('Bill of materials — Ceiling Fan v2');

  // A trial recipe that was parked: a second, inactive version of the exhaust BOM
  const exhaustTrial = await bomService.createNewVersion(ctx, exhaustBom._id, {
    notes: 'Trial: thinner winding to save copper — on hold until motor temperature tests pass.',
    components: [
      line('copper', 1.05, { scrapPercent: 5 }),
      line('lam', 5, { scrapPercent: 2 }),
      line('bearing', 20),
      line('alu', 6, { scrapPercent: 3 }),
      line('grill', 10),
      line('screws', 10),
      line('carton', 10),
      line('manual', 10),
    ],
  });
  await bomService.setBomActive(ctx, exhaustTrial._id, false);
  await backdate(Bom, exhaustTrial._id, at(-7, 15));
  counts.boms += 1;
  step('Bill of materials — Exhaust Fan trial version');

  // 7. Pedestal fans — paused and overdue, waiting for stand bases
  const o9 = await createOrder(-7, { productId: id('pedestal'), plannedQuantity: 20, ...plan(-6, 4), priority: 'high' });
  await setStatus(o9, 'released', -6, 8);
  await issue(o9, -6, { fraction: { motor: 0.5, blades: 0.5, stand: 0.3 } });
  await produce(o9, -4, 5);
  await setStatus(o9, 'paused', -3, 12, 'Waiting for pedestal stand bases from supplier');

  // 8. Ceiling fans on v2 — in production. Demonstrates the rework queue: one unit fails
  //    inspection for a fixable defect, goes to rework, and passes on retest.
  const o7 = await createOrder(-5, {
    productId: id('ceiling'),
    plannedQuantity: 40,
    ...plan(-3, 6),
    notes: 'Summer stock — retail chain',
  });
  await setStatus(o7, 'released', -4, 8);
  await issue(o7, -3, { fraction: { motor: 0.6, blades: 0.6, remote: 0.25 } });
  await produce(o7, -2, 8);
  await produce(o7, -1, 8, {
    rejected: 1,
    disposition: 'rework',
    reason: 'Motor hum on test run',
  });
  await rework(o7, -1, { good: 1, notes: 'Re-wound and re-tested — hum gone, unit passed', hour: 17 });
  await produce(o7, 0, 5, { hour: 9 });

  // 9. Motor assemblies — in production, overdue; imported bearings used as substitute
  const o8 = await createOrder(-4, { productId: id('motor'), plannedQuantity: 25, ...plan(-3, 2), priority: 'urgent' });
  await setStatus(o8, 'released', -3, 8);
  await issue(o8, -2, { extra: { bearing: 30 }, notes: 'Local bearings issued' });
  await issue(o8, -2, {
    alternative: { bearing: { key: 'bearingImp', quantity: 20 } },
    notes: 'Local bearings short — 20 imported used',
    hour: 10,
    minute: 21,
  });
  await scrap(o8, -1, {
    stage: 'material',
    materialKey: 'alu',
    quantity: 0.5,
    reason: 'process_loss',
    notes: 'Casting flash',
  });
  await produce(o8, -1, 10);

  // 10–14. Upcoming work
  const o10 = await createOrder(-2, { productId: id('blades'), plannedQuantity: 60, ...plan(1, 3), priority: 'high' });
  await setStatus(o10, 'released', -1, 15);
  await createOrder(-1, {
    productId: id('ceiling'),
    plannedQuantity: 60,
    ...plan(4, 6),
    status: 'planned',
    notes: 'Pre-season build',
  });
  await createOrder(-1, { productId: id('exhaust'), plannedQuantity: 50, ...plan(2, 4), status: 'planned' });
  await createOrder(0, { productId: id('stator'), plannedQuantity: 50, ...plan(3, 5), priority: 'urgent' });
  await createOrder(0, {
    productId: id('ceiling'),
    plannedQuantity: 20,
    ...plan(8, 6),
    priority: 'low',
    notes: 'Deluxe+ with remote kits',
  });

  return counts;
};

/**
 * Removes this scope's manufacturing demo data: everything tagged demo, plus BOMs and
 * production orders (with their issues, receipts and scrap) that build a demo product —
 * e.g. an order someone created while trying the demo out. Demo products still consumed by
 * other BOMs or orders are kept, since deleting them would leave those dangling.
 */
const clearDemoData = async (ctx) => {
  const { organizationId } = ctx;
  const demoProductIds = await Product.distinct('_id', isDemoProductFilter(ctx));
  const docFilter = {
    ...scopeFilter(ctx),
    $or: [{ isDemo: true }, { productId: { $in: demoProductIds } }],
  };
  const demoOrderIds = await ProductionOrder.distinct('_id', docFilter);

  await Promise.all([
    MaterialIssue.deleteMany({ ...scopeFilter(ctx), $or: [{ isDemo: true }, { productionOrderId: { $in: demoOrderIds } }] }),
    ProductionOutput.deleteMany({
      ...scopeFilter(ctx),
      $or: [{ isDemo: true }, { productionOrderId: { $in: demoOrderIds } }],
    }),
    ProductionReceipt.deleteMany({
      ...scopeFilter(ctx),
      $or: [{ isDemo: true }, { productionOrderId: { $in: demoOrderIds } }],
    }),
    ScrapRecord.deleteMany({ ...scopeFilter(ctx), $or: [{ isDemo: true }, { productionOrderId: { $in: demoOrderIds } }] }),
  ]);
  const [{ deletedCount: orders }, { deletedCount: boms }] = await Promise.all([
    ProductionOrder.deleteMany(docFilter),
    Bom.deleteMany(docFilter),
  ]);

  const demoProducts = await Product.find(isDemoProductFilter(ctx)).select('_id branchId').lean();
  const demoIds = demoProducts.map((p) => p._id);
  const [bomRefs, bomComponentRefs, orderRefs, orderMaterialRefs] = demoIds.length
    ? await Promise.all([
        Bom.distinct('productId', { organizationId, productId: { $in: demoIds } }),
        Bom.distinct('components.productId', { organizationId, 'components.productId': { $in: demoIds } }),
        ProductionOrder.distinct('productId', { organizationId, productId: { $in: demoIds } }),
        ProductionOrder.distinct('materials.productId', { organizationId, 'materials.productId': { $in: demoIds } }),
      ])
    : [[], [], [], []];
  const stillUsed = new Set([...bomRefs, ...bomComponentRefs, ...orderRefs, ...orderMaterialRefs].map(String));
  const removable = demoIds.filter((pid) => !stillUsed.has(String(pid)));

  if (removable.length) {
    const variantIds = await ProductVariant.distinct('_id', { productId: { $in: removable } });
    await Promise.all([
      variantIds.length ? InventoryTransaction.deleteMany({ variantId: { $in: variantIds } }) : null,
      Inventory.deleteMany({ productId: { $in: removable } }),
      ProductVariant.deleteMany({ productId: { $in: removable } }),
      Product.deleteMany({ _id: { $in: removable } }),
    ]);
  }

  // The demo category goes once nothing points at it any more.
  const categories = await Category.find({ ...scopeFilter(ctx), isDemo: true, name: DEMO_CATEGORY })
    .select('_id')
    .lean();
  // eslint-disable-next-line no-restricted-syntax
  for (const category of categories) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await Product.exists({ organizationId, 'categories._id': category._id }))) {
      // eslint-disable-next-line no-await-in-loop
      await Category.deleteOne({ _id: category._id });
    }
  }

  // With nothing left of a document type in the org, restart its numbering at 1.
  const counterChecks = {
    bom: () => Bom.exists({ organizationId }),
    productionOrder: () => ProductionOrder.exists({ organizationId }),
    materialIssue: () => MaterialIssue.exists({ organizationId, kind: { $ne: 'return' } }),
    materialReturn: () => MaterialIssue.exists({ organizationId, kind: 'return' }),
    productionOutput: () => ProductionOutput.exists({ organizationId }),
    productionReceipt: () => ProductionReceipt.exists({ organizationId }),
    scrap: () => ScrapRecord.exists({ organizationId }),
  };
  const $set = {};
  await Promise.all(
    Object.entries(counterChecks).map(async ([key, exists]) => {
      if (!(await exists())) $set[`counters.${key}`] = 0;
    })
  );
  if (Object.keys($set).length) await ManufacturingSettings.updateOne({ organizationId }, { $set });

  return { products: removable.length, productsKept: demoIds.length - removable.length, boms, orders };
};

/**
 * Loads the demo factory into the current branch. Refuses when demo data is already
 * there; on any failure removes whatever it managed to create before rethrowing.
 */
const seedDemoData = async (ctx, { onStep = () => {} } = {}) => {
  requireBranch(ctx.branchId);
  const status = await getDemoStatus({ organizationId: ctx.organizationId, branchId: ctx.branchId });
  if (status.hasDemoData) {
    throw new ApiError(
      httpStatus.CONFLICT,
      'Demo data is already loaded in this branch — remove it first to load it again.'
    );
  }
  try {
    const products = await seedProducts(ctx);
    onStep('Products and opening stock');
    const counts = await runScenario(ctx, products, onStep);
    return { products: Object.keys(products).length, ...counts };
  } catch (err) {
    logger.error(`Manufacturing demo: seeding failed, rolling back — ${err.message}`);
    await clearDemoData({ organizationId: ctx.organizationId, branchId: ctx.branchId }).catch((cleanupErr) =>
      logger.error(`Manufacturing demo: rollback failed — ${cleanupErr.message}`)
    );
    throw err;
  }
};

/**
 * Starts loading (or, with `reload`, clearing and re-loading) the demo factory in the
 * background and returns at once — against a remote database the load takes a minute or
 * two, far too long to hold an HTTP request open. Progress lives on the org's
 * ManufacturingSettings.demoJob; the client polls getDemoStatus.
 */
const startDemoLoad = async (ctx, { reload = false } = {}) => {
  const { organizationId, branchId, createdBy } = ctx;
  requireBranch(branchId);
  if (!reload) {
    const status = await getDemoStatus({ organizationId, branchId });
    if (status.hasDemoData) {
      throw new ApiError(httpStatus.CONFLICT, 'Demo data is already loaded in this branch — use Reload for a fresh copy.');
    }
  }

  await settingsService.getSettings(organizationId);
  const now = new Date();
  // Claim the single per-org job slot unless a live load already holds it.
  const claimed = await ManufacturingSettings.findOneAndUpdate(
    {
      organizationId,
      $or: [
        { demoJob: null },
        { 'demoJob.state': { $ne: 'running' } },
        { 'demoJob.heartbeatAt': { $lt: new Date(now.getTime() - STALE_JOB_MS) } },
      ],
    },
    {
      $set: {
        demoJob: {
          state: 'running',
          action: reload ? 'reload' : 'load',
          branchId,
          step: 0,
          total: TOTAL_STEPS,
          message: reload ? 'Removing the previous demo data' : 'Starting',
          error: '',
          result: null,
          startedBy: createdBy,
          startedAt: now,
          heartbeatAt: now,
          finishedAt: null,
        },
      },
    },
    { new: true }
  ).lean();
  if (!claimed) {
    throw new ApiError(httpStatus.CONFLICT, 'Demo data is already being loaded — wait for it to finish.');
  }

  const update = (fields) =>
    ManufacturingSettings.updateOne({ organizationId }, fields).catch((err) =>
      logger.warn(`Manufacturing demo: progress update failed — ${err.message}`)
    );
  let stepCount = 0;
  const onStep = (message) => {
    stepCount += 1;
    // Fire-and-forget: $max keeps the counter monotonic if writes land out of order.
    update({ $max: { 'demoJob.step': stepCount }, $set: { 'demoJob.heartbeatAt': new Date(), 'demoJob.message': message } });
  };

  setImmediate(async () => {
    try {
      if (reload) await clearDemoData({ organizationId, branchId });
      const result = await seedDemoData(ctx, { onStep });
      await update({
        $set: {
          'demoJob.state': 'done',
          'demoJob.step': TOTAL_STEPS,
          'demoJob.message': 'Done',
          'demoJob.result': result,
          'demoJob.heartbeatAt': new Date(),
          'demoJob.finishedAt': new Date(),
        },
      });
      logger.info(`Manufacturing demo: loaded into branch ${branchId} — ${JSON.stringify(result)}`);
    } catch (err) {
      logger.error(`Manufacturing demo: load failed — ${err.message}`);
      await update({
        $set: {
          'demoJob.state': 'failed',
          'demoJob.error': err.message,
          'demoJob.heartbeatAt': new Date(),
          'demoJob.finishedAt': new Date(),
        },
      });
    }
  });

  return jobView(claimed.demoJob, branchId);
};

/** Removes the branch's demo data — refused while a load is still running. */
const removeDemoData = async (ctx) => {
  requireBranch(ctx.branchId);
  const settings = await ManufacturingSettings.findOne({ organizationId: ctx.organizationId }).select('demoJob').lean();
  if (settings && isJobLive(settings.demoJob)) {
    throw new ApiError(httpStatus.CONFLICT, 'Demo data is still loading — wait for it to finish, then remove it.');
  }
  return clearDemoData({ organizationId: ctx.organizationId, branchId: ctx.branchId });
};

module.exports = { seedDemoData, clearDemoData, getDemoStatus, startDemoLoad, removeDemoData, DEMO_TAG };
