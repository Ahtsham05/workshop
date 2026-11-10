/**
 * Multi-warehouse inventory (Settings → Warehouses).
 *
 * HOW STOCK IS HELD — read models/warehouse.model.js first. In short:
 *   branch total (Product.stockQuantity / Inventory.quantity)  — unchanged, every flow writes it
 *   stored positions (WarehouseStock)                           — non-default warehouses + all bins
 *   default warehouse, top level                                — branch total − all stored positions
 *
 * Consequences that keep this safe for the rest of the app:
 *   • Nothing outside this file has to know warehouses exist. A sale/purchase/return/adjustment
 *     that names no warehouse lands in the default one automatically.
 *   • An internal transfer never touches the branch total, only stored positions.
 *   • An invoice/purchase that names a warehouse is mirrored into WarehouseMove by
 *     syncInvoice/syncPurchase AFTER it is saved (and again on every edit/delete). That
 *     mirror is rebuilt from the document each time, so it can be re-run safely and never
 *     throws into the invoice/purchase flow.
 *   • Turning the module off only hides it. Documents that already name a warehouse keep
 *     syncing, so turning it back on finds everything where it was.
 */
const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const {
  Organization,
  Branch,
  Product,
  ProductVariant,
  Inventory,
  Invoice,
  Purchase,
  Warehouse,
  WarehouseLocation,
  WarehouseStock,
  WarehouseMove,
  WarehouseTransfer,
  WarehouseReorderRule,
  InventoryTransaction,
  InstallmentPlan,
  SimSale,
  PhoneBuyback,
  SalesReturn,
  PurchaseReturn,
  StockAdjustment,
  InventoryTransfer,
} = require('../models');

const { ObjectId } = mongoose.Types;
const oid = (v) => (v instanceof ObjectId ? v : new ObjectId(String(v)));
const idStr = (v) => (v ? String(v._id || v.id || v) : '');
const isId = (v) => Boolean(v) && mongoose.isValidObjectId(String(v));
const round = (n) => Math.round(Number(n || 0) * 10000) / 10000;

// ── Settings ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  // Bins / shelves inside warehouses.
  useLocations: true,
  // Refuse an internal transfer that would take a position below zero.
  blockNegativeTransfers: true,
  // Show a warehouse picker on new invoices / purchases (else the default warehouse is used).
  askOnSales: true,
  askOnPurchases: true,
  // Print "Warehouse: …" on invoices / receipts (internal info, off by default).
  showOnPrints: false,
});

const normalizeSettings = (raw = {}) => {
  const out = { ...DEFAULT_SETTINGS };
  Object.keys(DEFAULT_SETTINGS).forEach((key) => {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  });
  return out;
};

const getSettings = async (organizationId) => {
  if (!organizationId) return { ...DEFAULT_SETTINGS };
  const org = await Organization.findById(organizationId).select('warehouseSettings').lean();
  return normalizeSettings(org?.warehouseSettings || {});
};

const updateSettings = async (organizationId, body = {}, userId) => {
  const current = await getSettings(organizationId);
  const next = normalizeSettings({ ...current, ...body });
  await Organization.updateOne({ _id: organizationId }, { $set: { warehouseSettings: next } });
  // Turning it on: every branch gets its main warehouse right away, holding all its stock.
  if (next.enabled && !current.enabled) {
    const branches = await Branch.find({ organizationId }).select('_id').lean();
    await Promise.all(branches.map((b) => ensureDefaultWarehouse(organizationId, b._id, userId)));
  }
  return next;
};

// ── Warehouses ───────────────────────────────────────────────────────────────────────────

const requireBranch = (branchId) => {
  if (!branchId) throw new ApiError(httpStatus.BAD_REQUEST, 'Select a branch first — warehouses belong to a branch');
};

/** The branch's default warehouse, created ("Main Warehouse") when the branch has none. */
const ensureDefaultWarehouse = async (organizationId, branchId, userId) => {
  const scope = { organizationId: oid(organizationId), branchId: oid(branchId) };
  const existing = await Warehouse.findOne({ ...scope, isDefault: true });
  if (existing) return existing;
  // A branch whose default was lost (data fix, race) — promote its oldest active warehouse.
  const oldest = await Warehouse.findOne({ ...scope, isActive: true }).sort({ createdAt: 1 });
  if (oldest) {
    oldest.isDefault = true;
    await oldest.save();
    return oldest;
  }
  try {
    return await Warehouse.create({
      ...scope,
      name: 'Main Warehouse',
      code: 'WH',
      type: 'main',
      isDefault: true,
      description: 'Holds all stock that is not in another warehouse.',
      createdBy: userId,
    });
  } catch (error) {
    if (error && error.code === 11000) return Warehouse.findOne({ ...scope, isDefault: true });
    throw error;
  }
};

/** Default-warehouse id for each branch in `branchIds` (only branches that have one). */
const defaultWarehouseByBranch = async (organizationId, branchIds) => {
  const rows = await Warehouse.find({
    organizationId: oid(organizationId),
    branchId: { $in: branchIds.map(oid) },
    isDefault: true,
  })
    .select('_id branchId')
    .lean();
  return new Map(rows.map((r) => [String(r.branchId), String(r._id)]));
};

const getWarehouse = async (organizationId, warehouseId) => {
  if (!isId(warehouseId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid warehouse');
  const wh = await Warehouse.findOne({ _id: warehouseId, organizationId });
  if (!wh) throw new ApiError(httpStatus.NOT_FOUND, 'Warehouse not found');
  return wh;
};

const listWarehouses = async ({ organizationId, branchId, includeInactive = true }) => {
  const filter = { organizationId: oid(organizationId) };
  if (branchId) {
    filter.branchId = oid(branchId);
    await ensureDefaultWarehouse(organizationId, branchId);
  }
  if (!includeInactive) filter.isActive = true;
  return Warehouse.find(filter)
    .populate('managerId', 'name email')
    .populate('branchId', 'name')
    .sort({ isDefault: -1, sortOrder: 1, name: 1 });
};

const suggestCode = async (organizationId, branchId, name) => {
  const base = (String(name || 'WH').replace(/[^A-Za-z0-9]/g, '').slice(0, 3) || 'WH').toUpperCase();
  const taken = new Set(
    (await Warehouse.find({ organizationId, branchId }).select('code').lean()).map((w) => w.code)
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  }
  return `${base}${Date.now() % 100000}`;
};

const WAREHOUSE_FIELDS = [
  'name',
  'code',
  'type',
  'description',
  'address',
  'city',
  'phone',
  'managerId',
  'isActive',
  'allowSales',
  'allowReceipts',
  'color',
  'sortOrder',
  'isMaterialsStore',
  'isGoodsStore',
];

/** Production stores are one-per-branch: setting the flag on one clears it elsewhere. */
const enforceSingleFlags = async (wh) => {
  const others = { organizationId: wh.organizationId, branchId: wh.branchId, _id: { $ne: wh._id } };
  if (wh.isMaterialsStore) await Warehouse.updateMany({ ...others, isMaterialsStore: true }, { $set: { isMaterialsStore: false } });
  if (wh.isGoodsStore) await Warehouse.updateMany({ ...others, isGoodsStore: true }, { $set: { isGoodsStore: false } });
};

const pickFields = (body, fields) =>
  fields.reduce((acc, key) => {
    if (body[key] !== undefined) acc[key] = body[key];
    return acc;
  }, {});

const createWarehouse = async ({ organizationId, branchId, body, userId }) => {
  requireBranch(branchId);
  await ensureDefaultWarehouse(organizationId, branchId, userId);
  const data = pickFields(body, WAREHOUSE_FIELDS);
  if (!data.managerId) data.managerId = null;
  data.code = (data.code || '').trim().toUpperCase() || (await suggestCode(organizationId, branchId, data.name));
  try {
    const wh = await Warehouse.create({ ...data, organizationId, branchId, isDefault: false, createdBy: userId });
    await enforceSingleFlags(wh);
    if (body.isDefault) await setDefaultWarehouse({ organizationId, warehouseId: wh._id, userId });
    return Warehouse.findById(wh._id);
  } catch (error) {
    if (error && error.code === 11000) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Warehouse code "${data.code}" is already used in this branch`);
    }
    throw error;
  }
};

const updateWarehouse = async ({ organizationId, warehouseId, body, userId }) => {
  const wh = await getWarehouse(organizationId, warehouseId);
  const data = pickFields(body, WAREHOUSE_FIELDS);
  if ('managerId' in data && !data.managerId) data.managerId = null;
  if (data.code) data.code = data.code.trim().toUpperCase();
  if (data.isActive === false && wh.isDefault) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'The default warehouse cannot be archived — make another warehouse the default first');
  }
  if (data.isActive === false && wh.isActive) {
    const held = await storedQuantityIn(wh._id);
    if (held !== 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'This warehouse still holds stock — transfer it out before archiving');
    }
  }
  Object.assign(wh, data, { updatedBy: userId });
  try {
    await wh.save();
  } catch (error) {
    if (error && error.code === 11000) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Warehouse code "${data.code}" is already used in this branch`);
    }
    throw error;
  }
  await enforceSingleFlags(wh);
  if (body.isDefault === true && !wh.isDefault) await setDefaultWarehouse({ organizationId, warehouseId: wh._id, userId });
  return Warehouse.findById(wh._id);
};

const storedQuantityIn = async (warehouseId) => {
  const [row] = await WarehouseStock.aggregate([
    { $match: { warehouseId: oid(warehouseId), quantity: { $ne: 0 } } },
    { $group: { _id: null, n: { $sum: { $abs: '$quantity' } } } },
  ]);
  return round(row?.n || 0);
};

/**
 * Make `warehouseId` its branch's default. The old default's top-level stock (derived until
 * now) is written down as stored stock, and the new default's stored top-level rows are
 * dropped (they become derived). Totals are identical before and after.
 */
const setDefaultWarehouse = async ({ organizationId, warehouseId, userId }) => {
  const target = await getWarehouse(organizationId, warehouseId);
  if (!target.isActive) throw new ApiError(httpStatus.BAD_REQUEST, 'Activate the warehouse before making it the default');
  if (target.isDefault) return target;
  const { branchId } = target;
  const oldDefault = await ensureDefaultWarehouse(organizationId, branchId, userId);

  // Old default's derived top-level quantities, per product/variant.
  const matrix = await computeBranchStock({ organizationId, branchId, includeZero: false });
  const writes = [];
  matrix.rows.forEach((row) => {
    const qty = row.derivedRoot;
    if (!qty) return;
    writes.push({
      updateOne: {
        filter: { warehouseId: oldDefault._id, locationId: null, productId: oid(row.productId), variantId: row.variantId ? oid(row.variantId) : null },
        update: { $inc: { quantity: qty }, $setOnInsert: { organizationId: oid(organizationId), branchId: oid(branchId) } },
        upsert: true,
      },
    });
  });
  if (writes.length) await WarehouseStock.bulkWrite(writes, { ordered: false });
  await WarehouseStock.deleteMany({ warehouseId: target._id, locationId: null });

  await Warehouse.updateOne({ _id: oldDefault._id }, { $set: { isDefault: false, updatedBy: userId } });
  await Warehouse.updateOne({ _id: target._id }, { $set: { isDefault: true, updatedBy: userId } });
  return Warehouse.findById(target._id);
};

const deleteWarehouse = async ({ organizationId, warehouseId }) => {
  const wh = await getWarehouse(organizationId, warehouseId);
  if (wh.isDefault) throw new ApiError(httpStatus.BAD_REQUEST, 'The default warehouse cannot be deleted');
  const [held, moves, transfers] = await Promise.all([
    storedQuantityIn(wh._id),
    WarehouseMove.countDocuments({ warehouseId: wh._id }),
    WarehouseTransfer.countDocuments({ $or: [{ fromWarehouseId: wh._id }, { toWarehouseId: wh._id }] }),
  ]);
  if (held !== 0) throw new ApiError(httpStatus.BAD_REQUEST, 'This warehouse still holds stock — transfer it out first');
  if (moves || transfers) {
    // Has history: keep it readable, just archive.
    wh.isActive = false;
    await wh.save();
    return { archived: true };
  }
  await WarehouseStock.deleteMany({ warehouseId: wh._id });
  await WarehouseLocation.deleteMany({ warehouseId: wh._id });
  await wh.deleteOne();
  return { deleted: true };
};

// ── Locations (bins) ─────────────────────────────────────────────────────────────────────

const listLocations = async ({ organizationId, warehouseId }) => {
  await getWarehouse(organizationId, warehouseId);
  return WarehouseLocation.find({ warehouseId }).sort({ path: 1 });
};

const buildPath = async (parentId, name) => {
  if (!parentId) return name;
  const parent = await WarehouseLocation.findById(parentId).select('path').lean();
  return parent ? `${parent.path} / ${name}` : name;
};

const refreshChildPaths = async (location) => {
  const children = await WarehouseLocation.find({ parentId: location._id });
  for (const child of children) {
    child.path = `${location.path} / ${child.name}`;
    await child.save();
    await refreshChildPaths(child);
  }
};

const createLocation = async ({ organizationId, warehouseId, body, userId }) => {
  const wh = await getWarehouse(organizationId, warehouseId);
  let parentId = null;
  if (body.parentId) {
    const parent = await WarehouseLocation.findOne({ _id: body.parentId, warehouseId: wh._id });
    if (!parent) throw new ApiError(httpStatus.BAD_REQUEST, 'Parent location not found in this warehouse');
    parentId = parent._id;
  }
  const name = String(body.name || '').trim();
  const loc = await WarehouseLocation.create({
    organizationId: wh.organizationId,
    branchId: wh.branchId,
    warehouseId: wh._id,
    parentId,
    name,
    type: body.type || 'bin',
    barcode: body.barcode || '',
    notes: body.notes || '',
    path: await buildPath(parentId, name),
    createdBy: userId,
  });
  return loc;
};

/** Creates many bins at once, e.g. rack A, shelves 1–10 → "A-01" … "A-10". */
const createLocationsBulk = async ({ organizationId, warehouseId, body, userId }) => {
  const { prefix = '', from = 1, to = 1, pad = 2, type = 'bin', parentId = null } = body;
  const count = Number(to) - Number(from) + 1;
  if (!(count >= 1 && count <= 200)) throw new ApiError(httpStatus.BAD_REQUEST, 'Create between 1 and 200 locations at a time');
  const created = [];
  for (let n = Number(from); n <= Number(to); n += 1) {
    created.push(
      await createLocation({
        organizationId,
        warehouseId,
        body: { name: `${prefix}${String(n).padStart(Number(pad) || 0, '0')}`, type, parentId },
        userId,
      })
    );
  }
  return created;
};

const updateLocation = async ({ organizationId, locationId, body }) => {
  const loc = await WarehouseLocation.findOne({ _id: locationId, organizationId });
  if (!loc) throw new ApiError(httpStatus.NOT_FOUND, 'Location not found');
  ['name', 'type', 'barcode', 'notes', 'isActive', 'sortOrder'].forEach((key) => {
    if (body[key] !== undefined) loc[key] = body[key];
  });
  if (body.parentId !== undefined) {
    const parentId = body.parentId || null;
    if (parentId && String(parentId) === String(loc._id)) throw new ApiError(httpStatus.BAD_REQUEST, 'A location cannot be inside itself');
    if (parentId) {
      // Refuse moving a location under one of its own descendants.
      let cursor = await WarehouseLocation.findOne({ _id: parentId, warehouseId: loc.warehouseId }).lean();
      if (!cursor) throw new ApiError(httpStatus.BAD_REQUEST, 'Parent location not found in this warehouse');
      while (cursor) {
        if (String(cursor._id) === String(loc._id)) throw new ApiError(httpStatus.BAD_REQUEST, 'A location cannot be inside its own sub-location');
        cursor = cursor.parentId ? await WarehouseLocation.findById(cursor.parentId).lean() : null;
      }
    }
    loc.parentId = parentId;
  }
  loc.path = await buildPath(loc.parentId, loc.name);
  await loc.save();
  await refreshChildPaths(loc);
  return loc;
};

const deleteLocation = async ({ organizationId, locationId }) => {
  const loc = await WarehouseLocation.findOne({ _id: locationId, organizationId });
  if (!loc) throw new ApiError(httpStatus.NOT_FOUND, 'Location not found');
  const [children, stock] = await Promise.all([
    WarehouseLocation.countDocuments({ parentId: loc._id }),
    WarehouseStock.countDocuments({ locationId: loc._id, quantity: { $ne: 0 } }),
  ]);
  if (children) throw new ApiError(httpStatus.BAD_REQUEST, 'Delete or move the locations inside it first');
  if (stock) throw new ApiError(httpStatus.BAD_REQUEST, 'This location still holds stock — move it out first');
  const used = await WarehouseMove.countDocuments({ locationId: loc._id });
  if (used) {
    loc.isActive = false;
    await loc.save();
    return { archived: true };
  }
  await WarehouseStock.deleteMany({ locationId: loc._id });
  await loc.deleteOne();
  return { deleted: true };
};

// ── Stock computation ────────────────────────────────────────────────────────────────────

const PRODUCT_PROJECTION = 'name sku barcode unit cost price stockQuantity category hasVariants isActive lowStockThreshold';

/**
 * Every product of the branch with its quantity per warehouse (and per bin of stored
 * positions). One pass; used by the stock list, the matrix report, the overview and
 * setDefaultWarehouse.
 */
const computeBranchStock = async ({ organizationId, branchId, includeZero = true, productIds = null }) => {
  const org = oid(organizationId);
  const branch = oid(branchId);
  const defaultWh = await ensureDefaultWarehouse(organizationId, branchId);
  const warehouses = await Warehouse.find({ organizationId: org, branchId: branch }).sort({ isDefault: -1, sortOrder: 1, name: 1 }).lean();

  const quantMatch = { organizationId: org, branchId: branch, quantity: { $ne: 0 } };
  const productFilter = { organizationId: org, branchId: branch };
  if (productIds) {
    const ids = productIds.filter(isId).map(oid);
    quantMatch.productId = { $in: ids };
    productFilter._id = { $in: ids };
  }
  const [quants, products] = await Promise.all([
    WarehouseStock.find(quantMatch).lean(),
    Product.find(productFilter).select(PRODUCT_PROJECTION).lean(),
  ]);

  // Products with real variants hold their stock per variant (Inventory.quantity); their
  // Product.stockQuantity is only a display fallback. So they get one row per active
  // variant, plus any variant a document put into a warehouse.
  const variantProductIds = products.filter((p) => p.hasVariants).map((p) => p._id);
  const variants = variantProductIds.length
    ? await ProductVariant.find({ productId: { $in: variantProductIds }, isDefault: { $ne: true }, isActive: { $ne: false } })
        .select('productId sku barcode attributes cost price unit')
        .lean()
    : [];
  const variantById = new Map(variants.map((v) => [String(v._id), v]));
  const variantIds = [...new Set([...variants.map((v) => String(v._id)), ...quants.filter((q) => q.variantId).map((q) => String(q.variantId))])];
  const inventories = variantIds.length
    ? await Inventory.find({ variantId: { $in: variantIds.map(oid) } }).select('variantId quantity').lean()
    : [];
  const variantTotal = new Map(inventories.map((i) => [String(i.variantId), Number(i.quantity || 0)]));
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const labelOf = (v) => {
    if (!v || !v.attributes) return '';
    const attrs = v.attributes instanceof Map ? Object.fromEntries(v.attributes) : v.attributes;
    return Object.values(attrs).filter(Boolean).join(' / ');
  };

  const rowsByKey = new Map();
  const ensureRow = (productId, variantId) => {
    const key = `${productId}|${variantId || ''}`;
    if (!rowsByKey.has(key)) {
      const p = productById.get(productId);
      if (!p) return null;
      const v = variantId ? variantById.get(variantId) : null;
      const branchQty = variantId ? variantTotal.get(variantId) || 0 : Number(p.stockQuantity || 0);
      const variantLabel = labelOf(v);
      rowsByKey.set(key, {
        key,
        productId,
        variantId: variantId || null,
        variantLabel,
        name: variantLabel ? `${p.name} — ${variantLabel}` : p.name,
        sku: (v && v.sku) || p.sku || '',
        barcode: (v && v.barcode) || p.barcode || '',
        unit: (v && v.unit) || p.unit || '',
        category: p.category || '',
        cost: Number((v && v.cost) ?? p.cost ?? 0),
        price: Number((v && v.price) ?? p.price ?? 0),
        isActive: p.isActive !== false,
        lowStockThreshold: p.lowStockThreshold ?? null,
        branchQty,
        stored: 0,
        byWarehouse: {},
        byLocation: {}, // `${warehouseId}|${locationId||''}` → qty (stored positions only)
      });
    }
    return rowsByKey.get(key);
  };

  products.forEach((p) => {
    if (!p.hasVariants) ensureRow(String(p._id), null);
  });
  variants.forEach((v) => ensureRow(String(v.productId), String(v._id)));
  quants.forEach((q) => {
    const row = ensureRow(String(q.productId), q.variantId ? String(q.variantId) : null);
    if (!row) return;
    const wid = String(q.warehouseId);
    const qty = Number(q.quantity || 0);
    row.stored += qty;
    row.byWarehouse[wid] = (row.byWarehouse[wid] || 0) + qty;
    const lk = `${wid}|${q.locationId ? String(q.locationId) : ''}`;
    row.byLocation[lk] = (row.byLocation[lk] || 0) + qty;
  });

  const defaultId = String(defaultWh._id);
  const rows = [];
  rowsByKey.forEach((row) => {
    const derivedRoot = round(row.branchQty - row.stored);
    row.derivedRoot = derivedRoot;
    row.byWarehouse[defaultId] = round((row.byWarehouse[defaultId] || 0) + derivedRoot);
    const dk = `${defaultId}|`;
    row.byLocation[dk] = round((row.byLocation[dk] || 0) + derivedRoot);
    Object.keys(row.byWarehouse).forEach((k) => {
      row.byWarehouse[k] = round(row.byWarehouse[k]);
    });
    if (!includeZero && !Object.values(row.byWarehouse).some((v) => v !== 0)) return;
    rows.push(row);
  });
  return { warehouses, defaultWarehouseId: defaultId, rows };
};

const publicWarehouse = (w) => ({
  id: String(w._id),
  name: w.name,
  code: w.code,
  type: w.type,
  isDefault: Boolean(w.isDefault),
  isActive: w.isActive !== false,
  color: w.color || 'blue',
});

/**
 * Stock list / matrix.
 *  warehouseId set  → rows that have stock (or any, with filter=all) in that warehouse,
 *                     with a per-bin breakdown.
 *  warehouseId unset → product × warehouse matrix.
 */
const getStock = async ({ organizationId, branchId, query = {}, showCost }) => {
  requireBranch(branchId);
  const { warehouseId, locationId, search = '', filter = 'in_stock', sortBy = 'name', page = 1, limit = 50 } = query;
  const { warehouses, defaultWarehouseId, rows } = await computeBranchStock({ organizationId, branchId });
  const locations = await WarehouseLocation.find({ organizationId: oid(organizationId), branchId: oid(branchId) })
    .select('path warehouseId')
    .lean();
  const locationPath = new Map(locations.map((l) => [String(l._id), l.path]));

  const term = String(search).trim().toLowerCase();
  const qtyOf = (row) => {
    if (!warehouseId) return Object.values(row.byWarehouse).reduce((s, v) => s + v, 0);
    if (locationId) return row.byLocation[`${warehouseId}|${locationId}`] || 0;
    return row.byWarehouse[String(warehouseId)] || 0;
  };

  let list = rows.filter((row) => {
    if (term && !`${row.name} ${row.sku} ${row.barcode}`.toLowerCase().includes(term)) return false;
    const qty = qtyOf(row);
    if (filter === 'in_stock') {
      return warehouseId ? qty !== 0 : Object.values(row.byWarehouse).some((v) => v !== 0);
    }
    if (filter === 'negative') {
      return warehouseId ? qty < 0 : Object.values(row.byWarehouse).some((v) => v < 0);
    }
    if (filter === 'split') return Object.values(row.byWarehouse).filter((v) => v !== 0).length > 1;
    return true;
  });

  const totals = {
    products: list.length,
    quantity: round(list.reduce((s, r) => s + qtyOf(r), 0)),
    value: showCost ? round(list.reduce((s, r) => s + qtyOf(r) * r.cost, 0)) : undefined,
    negative: list.filter((r) => qtyOf(r) < 0).length,
  };

  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name),
    qty_desc: (a, b) => qtyOf(b) - qtyOf(a),
    qty_asc: (a, b) => qtyOf(a) - qtyOf(b),
    value_desc: (a, b) => qtyOf(b) * b.cost - qtyOf(a) * a.cost,
  };
  list.sort(sorters[sortBy] || sorters.name);

  const lim = Math.min(Math.max(Number(limit) || 50, 1), 1000);
  const pg = Math.max(Number(page) || 1, 1);
  const pageRows = list.slice((pg - 1) * lim, pg * lim).map((row) => {
    const quantity = round(qtyOf(row));
    const out = {
      productId: row.productId,
      variantId: row.variantId,
      variantLabel: row.variantLabel || '',
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      unit: row.unit,
      category: row.category,
      price: row.price,
      branchQty: round(row.branchQty),
      quantity,
      byWarehouse: row.byWarehouse,
      lowStockThreshold: row.lowStockThreshold,
    };
    if (showCost) {
      out.cost = row.cost;
      out.value = round(quantity * row.cost);
    }
    if (warehouseId) {
      out.locations = Object.entries(row.byLocation)
        .filter(([k, v]) => k.startsWith(`${warehouseId}|`) && v !== 0)
        .map(([k, v]) => {
          const lid = k.split('|')[1] || null;
          return { locationId: lid, path: lid ? locationPath.get(lid) || '—' : null, quantity: round(v) };
        })
        .sort((a, b) => (a.path || '').localeCompare(b.path || ''));
    }
    return out;
  });

  return {
    warehouses: warehouses.map(publicWarehouse),
    defaultWarehouseId,
    results: pageRows,
    page: pg,
    limit: lim,
    totalResults: list.length,
    totalPages: Math.max(1, Math.ceil(list.length / lim)),
    totals,
  };
};

/** Per-warehouse KPIs for the overview cards. */
const getOverview = async ({ organizationId, branchId, showCost }) => {
  requireBranch(branchId);
  const { warehouses, defaultWarehouseId, rows } = await computeBranchStock({ organizationId, branchId });
  const [locationCounts, draftTransfers, recentTransfers, lastMoves] = await Promise.all([
    WarehouseLocation.aggregate([
      { $match: { organizationId: oid(organizationId), branchId: oid(branchId), isActive: true } },
      { $group: { _id: '$warehouseId', n: { $sum: 1 } } },
    ]),
    WarehouseTransfer.countDocuments({ organizationId, branchId, status: 'draft' }),
    WarehouseTransfer.find({ organizationId, branchId })
      .sort({ createdAt: -1 })
      .limit(6)
      .populate('fromWarehouseId', 'name code')
      .populate('toWarehouseId', 'name code')
      .lean(),
    WarehouseMove.aggregate([
      { $match: { organizationId: oid(organizationId), branchId: oid(branchId) } },
      { $group: { _id: '$warehouseId', last: { $max: '$date' }, n: { $sum: 1 } } },
    ]),
  ]);
  const locMap = new Map(locationCounts.map((r) => [String(r._id), r.n]));
  const moveMap = new Map(lastMoves.map((r) => [String(r._id), r]));

  const cards = warehouses.map((w) => {
    const id = String(w._id);
    let products = 0;
    let quantity = 0;
    let value = 0;
    let negative = 0;
    let low = 0;
    rows.forEach((row) => {
      const q = row.byWarehouse[id] || 0;
      if (q === 0) return;
      if (q > 0) products += 1;
      if (q < 0) negative += 1;
      if (q > 0 && row.lowStockThreshold != null && q <= row.lowStockThreshold) low += 1;
      quantity += q;
      value += q * row.cost;
    });
    return {
      ...publicWarehouse(w),
      description: w.description || '',
      address: w.address || '',
      city: w.city || '',
      phone: w.phone || '',
      allowSales: w.allowSales !== false,
      allowReceipts: w.allowReceipts !== false,
      isMaterialsStore: Boolean(w.isMaterialsStore),
      isGoodsStore: Boolean(w.isGoodsStore),
      products,
      quantity: round(quantity),
      value: showCost ? round(value) : undefined,
      negative,
      low,
      locations: locMap.get(id) || 0,
      moves: moveMap.get(id)?.n || 0,
      lastMoveAt: moveMap.get(id)?.last || null,
    };
  });

  return {
    defaultWarehouseId,
    warehouses: cards,
    totals: {
      warehouses: cards.filter((c) => c.isActive).length,
      products: rows.filter((r) => Object.values(r.byWarehouse).some((v) => v > 0)).length,
      quantity: round(cards.reduce((s, c) => s + c.quantity, 0)),
      value: showCost ? round(cards.reduce((s, c) => s + (c.value || 0), 0)) : undefined,
      split: rows.filter((r) => Object.values(r.byWarehouse).filter((v) => v !== 0).length > 1).length,
      negative: rows.filter((r) => Object.values(r.byWarehouse).some((v) => v < 0)).length,
      draftTransfers,
    },
    recentTransfers: recentTransfers.map((t) => ({
      id: String(t._id),
      number: t.number,
      status: t.status,
      date: t.date,
      totalQuantity: t.totalQuantity,
      lineCount: (t.lines || []).length,
      from: t.fromWarehouseId ? { id: String(t.fromWarehouseId._id), name: t.fromWarehouseId.name, code: t.fromWarehouseId.code } : null,
      to: t.toWarehouseId ? { id: String(t.toWarehouseId._id), name: t.toWarehouseId.name, code: t.toWarehouseId.code } : null,
    })),
  };
};

/**
 * Quantity of each product at one position — the warehouse's top level unless locationId
 * is given — plus the warehouse total. Used by the transfer screen and pickers.
 */
const getAvailability = async ({ organizationId, branchId, warehouseId, locationId, productIds }) => {
  requireBranch(branchId);
  const ids = (productIds || []).filter(isId);
  if (!ids.length) return {};
  const { rows } = await computeBranchStock({ organizationId, branchId, productIds: ids });
  const out = {};
  // Key: productId for a simple product, `v:<variantId>` for a variant row.
  rows.forEach((row) => {
    out[row.variantId ? `v:${row.variantId}` : row.productId] = {
      branch: round(row.branchQty),
      warehouse: round(row.byWarehouse[String(warehouseId)] || 0),
      position: round(row.byLocation[`${warehouseId}|${locationId || ''}`] || 0),
      byWarehouse: row.byWarehouse,
    };
  });
  return out;
};

/** One product: quantity in each warehouse and bin of its branch. */
const getProductBreakdown = async ({ organizationId, productId, variantId = null }) => {
  const product = await Product.findOne({ _id: productId, organizationId }).select('branchId name').lean();
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  const { warehouses, rows } = await computeBranchStock({ organizationId, branchId: product.branchId, productIds: [productId] });
  // One variant when asked for (and it has its own row), else the product — a product
  // with variants adds its variant rows up.
  const own = variantId ? rows.find((r) => r.variantId === String(variantId)) : null;
  const picked = own ? [own] : rows;
  const row = picked.length
    ? picked.reduce(
        (acc, r) => {
          acc.branchQty += r.branchQty;
          Object.entries(r.byWarehouse).forEach(([k, v]) => {
            acc.byWarehouse[k] = (acc.byWarehouse[k] || 0) + v;
          });
          Object.entries(r.byLocation).forEach(([k, v]) => {
            acc.byLocation[k] = (acc.byLocation[k] || 0) + v;
          });
          return acc;
        },
        { branchQty: 0, byWarehouse: {}, byLocation: {} }
      )
    : null;
  const locations = await WarehouseLocation.find({ branchId: product.branchId }).select('path').lean();
  const locationPath = new Map(locations.map((l) => [String(l._id), l.path]));
  return {
    productId: String(productId),
    name: product.name,
    branchQty: row ? round(row.branchQty) : 0,
    warehouses: warehouses.map((w) => ({
      ...publicWarehouse(w),
      quantity: row ? round(row.byWarehouse[String(w._id)] || 0) : 0,
      locations: row
        ? Object.entries(row.byLocation)
            .filter(([k, v]) => k.startsWith(`${w._id}|`) && k !== `${w._id}|` && v !== 0)
            .map(([k, v]) => ({ locationId: k.split('|')[1], path: locationPath.get(k.split('|')[1]) || '—', quantity: round(v) }))
        : [],
    })),
  };
};

/**
 * Returns `(productId, variantId) => quantity held in this warehouse` (top level + bins) for
 * a whole branch in three queries. Used by stock counts of one warehouse.
 */
const quantityReader = async ({ organizationId, branchId, warehouseId }) => {
  const wh = await Warehouse.findOne({ _id: warehouseId, organizationId, branchId }).lean();
  if (!wh) throw new ApiError(httpStatus.BAD_REQUEST, 'Warehouse not found in this branch');
  const key = (p, v) => `${p}|${v || ''}`;
  const stored = await WarehouseStock.find({ organizationId: oid(organizationId), branchId: oid(branchId), quantity: { $ne: 0 } }).lean();
  const atWh = new Map();
  const all = new Map();
  stored.forEach((q) => {
    const k = key(q.productId, q.variantId);
    all.set(k, (all.get(k) || 0) + q.quantity);
    if (String(q.warehouseId) === String(wh._id)) atWh.set(k, (atWh.get(k) || 0) + q.quantity);
  });
  if (!wh.isDefault) return (p, v) => round(atWh.get(key(p, v)) || 0);
  const [products, inventories] = await Promise.all([
    Product.find({ organizationId, branchId }).select('stockQuantity').lean(),
    Inventory.find({ organizationId, branchId }).select('variantId quantity').lean(),
  ]);
  const productTotal = new Map(products.map((p) => [String(p._id), Number(p.stockQuantity) || 0]));
  const variantTotal = new Map(inventories.map((i) => [String(i.variantId), Number(i.quantity) || 0]));
  return (p, v) => {
    const k = key(p, v);
    const total = v ? variantTotal.get(String(v)) || 0 : productTotal.get(String(p)) || 0;
    return round((atWh.get(k) || 0) + total - (all.get(k) || 0));
  };
};

// ── Moves: apply / sync ──────────────────────────────────────────────────────────────────

/** Applies (sign=+1) or reverses (sign=−1) moves on stored positions. */
const applyMoves = async (moves, sign) => {
  if (!moves.length) return;
  const branchIds = [...new Set(moves.map((m) => String(m.branchId)))];
  const defaults = await defaultWarehouseByBranch(moves[0].organizationId, branchIds);
  const writes = [];
  moves.forEach((m) => {
    const isDerived = !m.locationId && defaults.get(String(m.branchId)) === String(m.warehouseId);
    if (isDerived || !m.quantity) return;
    writes.push({
      updateOne: {
        filter: {
          warehouseId: oid(m.warehouseId),
          locationId: m.locationId ? oid(m.locationId) : null,
          productId: oid(m.productId),
          variantId: m.variantId ? oid(m.variantId) : null,
        },
        update: {
          $inc: { quantity: sign * Number(m.quantity) },
          $setOnInsert: { organizationId: oid(m.organizationId), branchId: oid(m.branchId) },
        },
        upsert: true,
      },
    });
  });
  if (writes.length) await WarehouseStock.bulkWrite(writes, { ordered: false });
};

/**
 * Replace the moves of one document with `buildMoves()`'s result. Old moves are reversed
 * first so buildMoves sees stock as if the document never existed (it allocates deliveries
 * across bins from that state).
 */
const syncChains = new Map();
const syncDocumentMoves = (refType, refId, buildMoves) => {
  // One rebuild per document at a time (within this process): two overlapping rebuilds
  // would both reverse the same old moves.
  const key = `${refType}|${refId}`;
  const run = async () => {
    const existing = await WarehouseMove.find({ refType, refId: oid(refId) }).lean();
    if (existing.length) {
      await applyMoves(existing, -1);
      await WarehouseMove.deleteMany({ refType, refId: oid(refId) });
    }
    const next = (await buildMoves()) || [];
    if (next.length) {
      await WarehouseMove.insertMany(next, { ordered: false });
      await applyMoves(next, +1);
    }
    return next.length;
  };
  const prev = syncChains.get(key) || Promise.resolve();
  const current = prev.catch(() => {}).then(run);
  syncChains.set(key, current);
  current.finally(() => {
    if (syncChains.get(key) === current) syncChains.delete(key);
  }).catch(() => {});
  return current;
};

/**
 * Split an outgoing quantity across a non-default warehouse's positions: its top level
 * first, then bins in path order; whatever is left comes from the top level (may go
 * negative). The default warehouse always delivers from its (derived) top level.
 */
const allocateOut = async ({ warehouseId, isDefault, productId, variantId, quantity }) => {
  if (isDefault || quantity <= 0) return [{ locationId: null, quantity }];
  const positions = await WarehouseStock.find({
    warehouseId: oid(warehouseId),
    productId: oid(productId),
    variantId: variantId ? oid(variantId) : null,
    quantity: { $gt: 0 },
  }).lean();
  const paths = new Map(
    (await WarehouseLocation.find({ _id: { $in: positions.filter((p) => p.locationId).map((p) => p.locationId) } }).select('path').lean()).map(
      (l) => [String(l._id), l.path]
    )
  );
  positions.sort((a, b) => {
    if (!a.locationId) return -1;
    if (!b.locationId) return 1;
    return (paths.get(String(a.locationId)) || '').localeCompare(paths.get(String(b.locationId)) || '');
  });
  let left = quantity;
  const out = [];
  positions.forEach((p) => {
    if (left <= 0) return;
    const take = Math.min(left, Number(p.quantity));
    out.push({ locationId: p.locationId || null, quantity: take });
    left = round(left - take);
  });
  if (left > 0) {
    const root = out.find((o) => !o.locationId);
    if (root) root.quantity = round(root.quantity + left);
    else out.push({ locationId: null, quantity: left });
  }
  return out;
};

/**
 * Resolve the warehouse a document uses, or null when nothing should be recorded.
 * `fallbackWarehouseId` is used when the document names none (e.g. a sales return goes back
 * to the warehouse its invoice delivered from).
 */
const resolveDocWarehouse = async (doc, fallbackWarehouseId = null) => {
  const chosen = doc.warehouseId || fallbackWarehouseId;
  const settings = await getSettings(doc.organizationId);
  if (!chosen && !settings.enabled) return null;
  if (chosen) {
    const wh = await Warehouse.findOne({ _id: chosen, organizationId: doc.organizationId, branchId: doc.branchId }).lean();
    if (wh) return wh;
  }
  return (await ensureDefaultWarehouse(doc.organizationId, doc.branchId)).toObject();
};

const buildDocMoves = async ({ doc, wh, refType, moveType, sign, lines, date, number }) => {
  const merged = new Map();
  lines.forEach((l) => {
    if (!isId(l.productId)) return;
    const qty = Number(l.quantity || 0);
    if (!qty) return;
    const key = `${l.productId}|${l.variantId || ''}`;
    merged.set(key, { productId: String(l.productId), variantId: l.variantId ? String(l.variantId) : null, quantity: (merged.get(key)?.quantity || 0) + qty });
  });
  const moves = [];
  for (const line of merged.values()) {
    const parts = sign < 0 ? await allocateOut({ warehouseId: wh._id, isDefault: wh.isDefault, ...line }) : [{ locationId: null, quantity: line.quantity }];
    parts.forEach((part) => {
      if (!part.quantity) return;
      moves.push({
        organizationId: doc.organizationId,
        branchId: doc.branchId,
        warehouseId: wh._id,
        locationId: part.locationId,
        productId: line.productId,
        variantId: line.variantId,
        moveType,
        quantity: round(sign * part.quantity),
        refType,
        refId: doc._id,
        refNumber: number || '',
        date: date || doc.createdAt || new Date(),
        createdBy: doc.updatedBy || doc.createdBy,
      });
    });
  }
  return moves;
};

/** Mirror an invoice into warehouse moves. Never throws. */
const syncInvoice = async (invoiceId) => {
  try {
    await syncDocumentMoves('Invoice', invoiceId, async () => {
      const doc = await Invoice.findById(invoiceId).lean();
      if (!doc || doc.type === 'quotation') return [];
      const wh = await resolveDocWarehouse(doc);
      if (!wh) return [];
      return buildDocMoves({
        doc,
        wh,
        refType: 'Invoice',
        moveType: 'delivery',
        sign: -1,
        date: doc.invoiceDate,
        number: doc.invoiceNumber,
        lines: (doc.items || []).map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: Number(i.stockQuantity || i.quantity || 0) })),
      });
    });
  } catch (error) {
    logger.error(`warehouse sync failed for Invoice ${invoiceId}: ${error.message}`);
  }
};

/** Mirror a purchase into warehouse moves. Never throws. */
const syncPurchase = async (purchaseId) => {
  try {
    await syncDocumentMoves('Purchase', purchaseId, async () => {
      const doc = await Purchase.findById(purchaseId).lean();
      if (!doc) return [];
      const wh = await resolveDocWarehouse(doc);
      if (!wh) return [];
      return buildDocMoves({
        doc,
        wh,
        refType: 'Purchase',
        moveType: 'receipt',
        sign: +1,
        date: doc.purchaseDate,
        number: doc.invoiceNumber,
        lines: (doc.items || []).map((i) => ({ productId: i.product, variantId: i.variantId, quantity: Number(i.stockQuantity || i.quantity || 0) })),
      });
    });
  } catch (error) {
    logger.error(`warehouse sync failed for Purchase ${purchaseId}: ${error.message}`);
  }
};

/** Runs a document mirror and logs instead of throwing (warehouses never block a flow). */
const safeSync = async (refType, refId, build) => {
  try {
    await syncDocumentMoves(refType, refId, build);
  } catch (error) {
    logger.error(`warehouse sync failed for ${refType} ${refId}: ${error.message}`);
  }
};

const returnLines = (doc) =>
  (doc.items || []).map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: Number(i.stockQuantity || i.quantity || 0) }));

/** Sales return: goods come back in (unless rejected) — by default into the invoice's warehouse. */
const syncSalesReturn = (returnId) =>
  safeSync('SalesReturn', returnId, async () => {
    const doc = await SalesReturn.findById(returnId).lean();
    if (!doc || doc.status === 'rejected') return [];
    const invoice = doc.invoiceId ? await Invoice.findById(doc.invoiceId).select('warehouseId').lean() : null;
    const wh = await resolveDocWarehouse(doc, invoice?.warehouseId);
    if (!wh) return [];
    return buildDocMoves({ doc, wh, refType: 'SalesReturn', moveType: 'return_in', sign: +1, date: doc.createdAt, number: doc.returnNumber, lines: returnLines(doc) });
  });

/** Purchase return: goods go back to the supplier (unless rejected) — by default from the purchase's warehouse. */
const syncPurchaseReturn = (returnId) =>
  safeSync('PurchaseReturn', returnId, async () => {
    const doc = await PurchaseReturn.findById(returnId).lean();
    if (!doc || doc.status === 'rejected') return [];
    const purchase = doc.purchaseId ? await Purchase.findById(doc.purchaseId).select('warehouseId').lean() : null;
    const wh = await resolveDocWarehouse(doc, purchase?.warehouseId);
    if (!wh) return [];
    return buildDocMoves({ doc, wh, refType: 'PurchaseReturn', moveType: 'return_out', sign: -1, date: doc.createdAt, number: doc.returnNumber, lines: returnLines(doc) });
  });

/**
 * Stock adjustment (manual, stock count, warranty, repair part). A reversal is its own
 * adjustment with the opposite direction and lands in the original's warehouse.
 */
const syncAdjustment = (adjustmentId) =>
  safeSync('StockAdjustment', adjustmentId, async () => {
    const doc = await StockAdjustment.findById(adjustmentId).lean();
    if (!doc) return [];
    let fallback = null;
    if (!doc.warehouseId && doc.reversalOf) {
      const original = await StockAdjustment.findById(doc.reversalOf).select('warehouseId').lean();
      fallback = original?.warehouseId || null;
      if (fallback) await StockAdjustment.updateOne({ _id: doc._id }, { $set: { warehouseId: fallback } });
    }
    const wh = await resolveDocWarehouse(doc, fallback);
    if (!wh) return [];
    const sign = doc.direction === 'increase' ? +1 : -1;
    return buildDocMoves({
      doc,
      wh,
      refType: 'StockAdjustment',
      moveType: 'adjustment',
      sign,
      date: doc.createdAt,
      number: `${doc.reversalOf ? 'Reversal · ' : ''}${String(doc.type || 'adjustment').replace(/_/g, ' ')}`,
      lines: [{ productId: doc.productId, variantId: doc.variantId, quantity: Number(doc.quantity || 0) }],
    });
  });

/**
 * Branch → branch transfer (Stock Transfer page). The sending branch loses the stock while
 * it is in transit or once completed; the receiving branch gains it when completed.
 */
const syncBranchTransfer = (transferId) =>
  safeSync('InventoryTransfer', transferId, async () => {
    const doc = await InventoryTransfer.findById(transferId).lean();
    if (!doc) return [];
    const moves = [];
    const number = doc.transferNumber || '';
    const date = doc.transferDate || doc.createdAt;
    if (['in_transit', 'completed'].includes(doc.status)) {
      const side = { ...doc, branchId: doc.fromBranchId, warehouseId: doc.fromWarehouseId };
      const wh = await resolveDocWarehouse(side);
      if (wh) {
        const out = await buildDocMoves({
          doc: side,
          wh,
          refType: 'InventoryTransfer',
          moveType: 'branch_out',
          sign: -1,
          date,
          number,
          lines: [{ productId: doc.fromProductId, variantId: doc.fromVariantId, quantity: doc.quantity }],
        });
        moves.push(...out);
      }
    }
    if (doc.status === 'completed') {
      const side = { ...doc, branchId: doc.toBranchId, warehouseId: doc.toWarehouseId };
      const wh = await resolveDocWarehouse(side);
      if (wh) {
        const inn = await buildDocMoves({
          doc: side,
          wh,
          refType: 'InventoryTransfer',
          moveType: 'branch_in',
          sign: +1,
          date: doc.completedAt || date,
          number,
          lines: [{ productId: doc.toProductId, variantId: doc.toVariantId, quantity: doc.quantity }],
        });
        moves.push(...inn);
      }
    }
    return moves;
  });

// ── Manufacturing (ledger mirror) ────────────────────────────────────────────────────────
// Manufacturing writes one InventoryTransaction per stock move, tagged with its document.
// After its transaction ends, the document's "available" rows are mirrored here: material
// issues / returns through the branch's production materials store, finished goods,
// scrap and packing through its finished goods store (each: the default when not set).

const MFG_MATERIAL_TYPES = new Set(['production_issue', 'production_return', 'floor_issue', 'floor_restock']);
const MFG_GOODS_TYPES = new Set(['production_receipt', 'production_scrap', 'packing_out', 'packing_in']);
const MFG_TYPES = new Set([...MFG_MATERIAL_TYPES, ...MFG_GOODS_TYPES]);

const syncManufacturingRef = (refType, refId) =>
  safeSync(refType, refId, async () => {
    const rows = await InventoryTransaction.find({ refType, refId: oid(refId), stockBucket: 'available', type: { $in: [...MFG_TYPES] } }).lean();
    if (!rows.length) return [];
    const { organizationId, branchId } = rows[0];
    const settings = await getSettings(organizationId);
    if (!settings.enabled) return [];
    const defaultWh = (await ensureDefaultWarehouse(organizationId, branchId)).toObject();
    const stores = await Warehouse.find({ organizationId, branchId, isActive: true, $or: [{ isMaterialsStore: true }, { isGoodsStore: true }] }).lean();
    const materialsWh = stores.find((w) => w.isMaterialsStore) || defaultWh;
    const goodsWh = stores.find((w) => w.isGoodsStore) || defaultWh;
    // A product's own default (legacy) variant is the product itself here.
    const variantIds = [...new Set(rows.filter((r) => r.variantId).map((r) => String(r.variantId)))];
    const realVariants = new Set(
      variantIds.length ? (await ProductVariant.find({ _id: { $in: variantIds }, isDefault: { $ne: true } }).select('_id').lean()).map((v) => String(v._id)) : []
    );
    // Net per warehouse / product / variant, so an issue and its return cancel out.
    const net = new Map();
    rows.forEach((r) => {
      const wh = MFG_MATERIAL_TYPES.has(r.type) ? materialsWh : goodsWh;
      const variantId = r.variantId && realVariants.has(String(r.variantId)) ? r.variantId : null;
      const key = `${wh._id}|${r.productId}|${variantId || ''}`;
      const cur = net.get(key) || { wh, productId: r.productId, variantId, qty: 0, date: r.createdAt };
      cur.qty = round(cur.qty + Number(r.quantityDelta || 0));
      net.set(key, cur);
    });
    const doc = { _id: refId, organizationId, branchId, createdBy: rows[0].createdBy, createdAt: rows[0].createdAt };
    const moves = [];
    for (const n of net.values()) {
      if (!n.qty) continue;
      const { variantId } = n;
      const sign = n.qty > 0 ? 1 : -1;
      moves.push(
        ...(await buildDocMoves({
          doc,
          wh: n.wh,
          refType,
          moveType: sign > 0 ? 'production_in' : 'production_out',
          sign,
          date: n.date,
          number: refType.replace(/([a-z])([A-Z])/g, '$1 $2'),
          lines: [{ productId: n.productId, variantId, quantity: Math.abs(n.qty) }],
        }))
      );
    }
    return moves;
  });

/**
 * Called from InventoryTransaction's post-save hook. Inside a transaction the mirror waits
 * for the session to end (commit or abort — either way the rebuild reads what is really
 * there); otherwise it runs on the next tick.
 */
const queueLedgerSync = (txDoc) => {
  if (!txDoc || !MFG_TYPES.has(txDoc.type) || txDoc.stockBucket !== 'available' || !txDoc.refType || !txDoc.refId) return;
  const key = `${txDoc.refType}|${txDoc.refId}`;
  const session = typeof txDoc.$session === 'function' ? txDoc.$session() : null;
  const flush = (keys) => keys.forEach((k) => {
    const [refType, refId] = k.split('|');
    syncManufacturingRef(refType, refId);
  });
  if (session && typeof session.once === 'function' && !session.hasEnded) {
    if (!session.__warehouseKeys) {
      session.__warehouseKeys = new Set();
      session.once('ended', () => flush([...session.__warehouseKeys]));
    }
    session.__warehouseKeys.add(key);
    return;
  }
  setImmediate(() => flush([key]));
};

// ── Small stock documents (mobile shop) ──────────────────────────────────────────────────

/** Installment sale: the product leaves the warehouse while the plan exists. */
const syncInstallmentPlan = (planId) =>
  safeSync('InstallmentPlan', planId, async () => {
    const doc = await InstallmentPlan.findById(planId).lean();
    if (!doc || !doc.productId) return [];
    const wh = await resolveDocWarehouse(doc);
    if (!wh) return [];
    return buildDocMoves({ doc, wh, refType: 'InstallmentPlan', moveType: 'delivery', sign: -1, date: doc.startDate || doc.createdAt, number: doc.planNumber || 'Installment', lines: [{ productId: doc.productId, quantity: Number(doc.quantity || 1) }] });
  });

/** SIM sale: one SIM leaves the warehouse while the sale exists. */
const syncSimSale = (saleId) =>
  safeSync('SimSale', saleId, async () => {
    const doc = await SimSale.findById(saleId).lean();
    if (!doc || !doc.productId) return [];
    const wh = await resolveDocWarehouse(doc);
    if (!wh) return [];
    return buildDocMoves({ doc, wh, refType: 'SimSale', moveType: 'delivery', sign: -1, date: doc.createdAt, number: doc.jobNumber || 'SIM sale', lines: [{ productId: doc.productId, quantity: 1 }] });
  });

/** Used phone bought from a customer: one unit comes in while the buyback exists. */
const syncBuyback = (buybackId) =>
  safeSync('PhoneBuyback', buybackId, async () => {
    const doc = await PhoneBuyback.findById(buybackId).lean();
    if (!doc || !doc.productId) return [];
    const wh = await resolveDocWarehouse(doc);
    if (!wh) return [];
    return buildDocMoves({ doc, wh, refType: 'PhoneBuyback', moveType: 'receipt', sign: +1, date: doc.purchaseDate || doc.createdAt, number: doc.buybackNumber || 'Buyback', lines: [{ productId: doc.productId, quantity: 1 }] });
  });

/** Quantity of every product (and variant, as `v:<id>`) in one warehouse — for sale pickers. */
const getWarehouseQuantities = async ({ organizationId, branchId, warehouseId }) => {
  requireBranch(branchId);
  const read = await quantityReader({ organizationId, branchId, warehouseId });
  const { rows } = await computeBranchStock({ organizationId, branchId });
  const out = {};
  rows.forEach((r) => {
    out[r.variantId ? `v:${r.variantId}` : r.productId] = read(r.productId, r.variantId);
  });
  return out;
};

/**
 * Opening stock typed on a new product goes into the default warehouse (the branch total);
 * when another warehouse was picked, it is moved there with a posted transfer, so the
 * history shows where it went.
 */
const placeOpeningStock = async ({ product, warehouseId, userId }) => {
  try {
    const qty = Number(product.stockQuantity || 0);
    if (!warehouseId || !(qty > 0) || product.hasVariants) return null;
    const def = await ensureDefaultWarehouse(product.organizationId, product.branchId, userId);
    if (String(def._id) === String(warehouseId)) return null;
    return await createTransfer({
      organizationId: product.organizationId,
      branchId: product.branchId,
      userId,
      body: { fromWarehouseId: def._id, toWarehouseId: warehouseId, reference: 'Opening stock', lines: [{ productId: product._id, quantity: qty }], validate: true },
    });
  } catch (error) {
    logger.error(`opening stock placement failed for product ${product && product._id}: ${error.message}`);
    return null;
  }
};

/**
 * A product's stock number typed directly (product form, bulk edit, a new product's opening
 * stock) changes the branch total, so it lands in the default warehouse. It moves no stored
 * stock — this only writes the history row, so warehouse ledgers and reports reconcile.
 */
const recordStockEdit = async ({ product, delta, reason = 'Stock edited on product', userId }) => {
  try {
    const qty = round(delta);
    if (!product || !qty || product.hasVariants) return;
    const settings = await getSettings(product.organizationId);
    if (!settings.enabled) return;
    const wh = await ensureDefaultWarehouse(product.organizationId, product.branchId);
    await WarehouseMove.create({
      organizationId: product.organizationId,
      branchId: product.branchId,
      warehouseId: wh._id,
      locationId: null,
      productId: product._id,
      moveType: 'adjustment',
      quantity: qty,
      refType: 'ProductStockEdit',
      refId: new ObjectId(),
      refNumber: reason,
      date: new Date(),
      createdBy: userId,
    });
  } catch (error) {
    logger.error(`warehouse stock-edit record failed for product ${product && product._id}: ${error.message}`);
  }
};

/** Checks a picked warehouse belongs to the branch and accepts the document type. */
const assertDocWarehouse = async ({ organizationId, branchId, warehouseId, kind }) => {
  if (!warehouseId) return;
  const wh = await Warehouse.findOne({ _id: warehouseId, organizationId }).lean();
  if (!wh) throw new ApiError(httpStatus.BAD_REQUEST, 'Selected warehouse not found');
  if (branchId && String(wh.branchId) !== String(branchId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected warehouse belongs to another branch');
  }
  if (!wh.isActive) throw new ApiError(httpStatus.BAD_REQUEST, `Warehouse "${wh.name}" is archived`);
  if (kind === 'sale' && wh.allowSales === false) throw new ApiError(httpStatus.BAD_REQUEST, `Warehouse "${wh.name}" does not allow sales`);
  if (kind === 'receipt' && wh.allowReceipts === false) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Warehouse "${wh.name}" does not accept purchases`);
  }
};

// ── Internal transfers ───────────────────────────────────────────────────────────────────

const TRANSFER_POPULATE = [
  { path: 'fromWarehouseId', select: 'name code isDefault' },
  { path: 'toWarehouseId', select: 'name code isDefault' },
  { path: 'fromLocationId', select: 'path' },
  { path: 'toLocationId', select: 'path' },
  { path: 'lines.fromLocationId', select: 'path' },
  { path: 'lines.toLocationId', select: 'path' },
  { path: 'createdBy', select: 'name' },
  { path: 'doneBy', select: 'name' },
  { path: 'cancelledBy', select: 'name' },
];

const getTransfer = async ({ organizationId, transferId, populate = true }) => {
  if (!isId(transferId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid transfer');
  const q = WarehouseTransfer.findOne({ _id: transferId, organizationId });
  if (populate) q.populate(TRANSFER_POPULATE);
  const t = await q;
  if (!t) throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  return t;
};

const queryTransfers = async ({ organizationId, branchId, query = {} }) => {
  const filter = { organizationId: oid(organizationId) };
  if (branchId) filter.branchId = oid(branchId);
  if (query.status) filter.status = query.status;
  if (query.warehouseId && isId(query.warehouseId)) {
    filter.$or = [{ fromWarehouseId: oid(query.warehouseId) }, { toWarehouseId: oid(query.warehouseId) }];
  }
  if (query.search) {
    const re = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$and = [{ $or: [{ number: re }, { reference: re }, { 'lines.productName': re }] }];
  }
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = new Date(query.from);
    if (query.to) filter.date.$lte = new Date(query.to);
  }
  return WarehouseTransfer.paginate(filter, {
    sortBy: query.sortBy || 'createdAt:desc',
    limit: query.limit || 20,
    page: query.page || 1,
    populate: [
      { path: 'fromWarehouseId', select: 'name code isDefault' },
      { path: 'toWarehouseId', select: 'name code isDefault' },
      { path: 'fromLocationId', select: 'path' },
      { path: 'toLocationId', select: 'path' },
      { path: 'createdBy', select: 'name' },
    ],
  });
};

/** Validates header + lines and returns a clean body (names/SKUs snapshotted). */
const prepareTransfer = async ({ organizationId, branchId, body }) => {
  const [from, to] = await Promise.all([getWarehouse(organizationId, body.fromWarehouseId), getWarehouse(organizationId, body.toWarehouseId)]);
  if (String(from.branchId) !== String(branchId) || String(to.branchId) !== String(branchId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Both warehouses must be in the current branch — use Stock Transfer to move stock between branches');
  }
  if (!from.isActive || !to.isActive) throw new ApiError(httpStatus.BAD_REQUEST, 'One of the warehouses is archived');

  const locIds = [body.fromLocationId, body.toLocationId, ...(body.lines || []).flatMap((l) => [l.fromLocationId, l.toLocationId])].filter(isId);
  const locations = await WarehouseLocation.find({ _id: { $in: locIds } }).select('warehouseId isActive').lean();
  const locById = new Map(locations.map((l) => [String(l._id), l]));
  const checkLoc = (id, wh, label) => {
    if (!id) return null;
    const loc = locById.get(String(id));
    if (!loc || String(loc.warehouseId) !== String(wh._id)) throw new ApiError(httpStatus.BAD_REQUEST, `${label} location is not in ${wh.name}`);
    return oid(id);
  };
  const fromLocationId = checkLoc(body.fromLocationId, from, 'Source');
  const toLocationId = checkLoc(body.toLocationId, to, 'Destination');

  const productIds = (body.lines || []).map((l) => l.productId).filter(isId);
  const products = await Product.find({ _id: { $in: productIds }, organizationId, branchId }).select('name sku unit hasVariants').lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const variantIds = (body.lines || []).map((l) => l.variantId).filter(isId);
  const variants = variantIds.length
    ? await ProductVariant.find({ _id: { $in: variantIds }, organizationId }).select('productId sku unit attributes').lean()
    : [];
  const variantById = new Map(variants.map((v) => [String(v._id), v]));
  const lines = (body.lines || [])
    .filter((l) => Number(l.quantity) > 0)
    .map((l) => {
      const p = productById.get(String(l.productId));
      if (!p) throw new ApiError(httpStatus.BAD_REQUEST, 'A product on this transfer is not in the current branch');
      const v = l.variantId ? variantById.get(String(l.variantId)) : null;
      if (l.variantId && (!v || String(v.productId) !== String(p._id))) {
        throw new ApiError(httpStatus.BAD_REQUEST, `${p.name}: that variant does not belong to this product`);
      }
      if (!v && p.hasVariants) throw new ApiError(httpStatus.BAD_REQUEST, `${p.name}: pick which variant to move`);
      const attrs = v && v.attributes ? Object.values(v.attributes instanceof Map ? Object.fromEntries(v.attributes) : v.attributes).filter(Boolean).join(' / ') : '';
      return {
        productId: p._id,
        variantId: v ? v._id : null,
        productName: attrs ? `${p.name} — ${attrs}` : p.name,
        sku: (v && v.sku) || p.sku || '',
        unit: (v && v.unit) || p.unit || '',
        quantity: round(l.quantity),
        fromLocationId: checkLoc(l.fromLocationId, from, 'Source'),
        toLocationId: checkLoc(l.toLocationId, to, 'Destination'),
        note: l.note || '',
      };
    });

  lines.forEach((l) => {
    const src = `${from._id}|${l.fromLocationId || fromLocationId || ''}`;
    const dst = `${to._id}|${l.toLocationId || toLocationId || ''}`;
    if (src === dst) throw new ApiError(httpStatus.BAD_REQUEST, `${l.productName}: source and destination are the same place`);
  });

  return {
    from,
    to,
    data: {
      fromWarehouseId: from._id,
      toWarehouseId: to._id,
      fromLocationId,
      toLocationId,
      date: body.date ? new Date(body.date) : new Date(),
      reference: body.reference || '',
      notes: body.notes || '',
      lines,
      totalQuantity: round(lines.reduce((s, l) => s + l.quantity, 0)),
    },
  };
};

const nextTransferSeq = async (organizationId, branchId) => {
  const last = await WarehouseTransfer.findOne({ organizationId, branchId }).sort({ seq: -1 }).select('seq').lean();
  return (last?.seq || 0) + 1;
};

const createTransfer = async ({ organizationId, branchId, body, userId }) => {
  requireBranch(branchId);
  const { from, data } = await prepareTransfer({ organizationId, branchId, body });
  if (!data.lines.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Add at least one product with a quantity');
  let transfer;
  for (let attempt = 0; attempt < 5 && !transfer; attempt += 1) {
    const seq = await nextTransferSeq(organizationId, branchId);
    try {
      transfer = await WarehouseTransfer.create({
        ...data,
        organizationId,
        branchId,
        seq,
        number: `${from.code}/INT/${String(seq).padStart(5, '0')}`,
        status: 'draft',
        createdBy: userId,
      });
    } catch (error) {
      if (!(error && error.code === 11000)) throw error;
    }
  }
  if (!transfer) throw new ApiError(httpStatus.CONFLICT, 'Could not number the transfer — please try again');
  if (body.validate) return validateTransfer({ organizationId, transferId: transfer._id, userId });
  return getTransfer({ organizationId, transferId: transfer._id });
};

const updateTransfer = async ({ organizationId, transferId, body, userId }) => {
  const transfer = await getTransfer({ organizationId, transferId, populate: false });
  if (transfer.status !== 'draft') throw new ApiError(httpStatus.BAD_REQUEST, 'Only a draft transfer can be edited');
  const { data } = await prepareTransfer({
    organizationId,
    branchId: transfer.branchId,
    body: {
      fromWarehouseId: transfer.fromWarehouseId,
      toWarehouseId: transfer.toWarehouseId,
      fromLocationId: transfer.fromLocationId,
      toLocationId: transfer.toLocationId,
      date: transfer.date,
      reference: transfer.reference,
      notes: transfer.notes,
      lines: transfer.lines.map((l) => l.toObject()),
      ...body,
    },
  });
  Object.assign(transfer, data, { updatedBy: userId });
  await transfer.save();
  if (body.validate) return validateTransfer({ organizationId, transferId: transfer._id, userId });
  return getTransfer({ organizationId, transferId: transfer._id });
};

/** Post a draft: checks availability at the source, then writes the moves. */
const validateTransfer = async ({ organizationId, transferId, userId }) => {
  const transfer = await getTransfer({ organizationId, transferId, populate: false });
  if (transfer.status !== 'draft') throw new ApiError(httpStatus.BAD_REQUEST, `This transfer is already ${transfer.status}`);
  if (!transfer.lines.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Add at least one product with a quantity');
  const settings = await getSettings(organizationId);

  if (settings.blockNegativeTransfers) {
    const { rows } = await computeBranchStock({
      organizationId,
      branchId: transfer.branchId,
      productIds: transfer.lines.map((l) => String(l.productId)),
    });
    const rowByKey = new Map(rows.map((r) => [r.key, r]));
    const need = new Map();
    transfer.lines.forEach((l) => {
      const pos = `${transfer.fromWarehouseId}|${l.fromLocationId || transfer.fromLocationId || ''}`;
      const rowKey = `${l.productId}|${l.variantId || ''}`;
      const key = `${rowKey}@${pos}`;
      need.set(key, { productName: l.productName, unit: l.unit, pos, rowKey, qty: (need.get(key)?.qty || 0) + l.quantity });
    });
    const short = [];
    need.forEach((n) => {
      const have = rowByKey.get(n.rowKey)?.byLocation[n.pos] || 0;
      if (have < n.qty - 1e-9) short.push(`${n.productName}: need ${n.qty}, available ${round(have)}`);
    });
    if (short.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Not enough stock at the source — ${short.slice(0, 5).join('; ')}${short.length > 5 ? ` (+${short.length - 5} more)` : ''}`);
    }
  }

  const claimed = await WarehouseTransfer.findOneAndUpdate(
    { _id: transfer._id, status: 'draft' },
    { $set: { status: 'done', doneAt: new Date(), doneBy: userId } },
    { new: true }
  );
  if (!claimed) throw new ApiError(httpStatus.CONFLICT, 'This transfer was just posted by someone else');

  try {
    await syncDocumentMoves('WarehouseTransfer', claimed._id, async () => buildTransferMoves(claimed, userId));
  } catch (error) {
    await WarehouseTransfer.updateOne({ _id: claimed._id }, { $set: { status: 'draft' }, $unset: { doneAt: 1, doneBy: 1 } });
    throw error;
  }
  return getTransfer({ organizationId, transferId: claimed._id });
};

const buildTransferMoves = (t, userId) => {
  const moves = [];
  t.lines.forEach((l) => {
    const fromLoc = l.fromLocationId || t.fromLocationId || null;
    const toLoc = l.toLocationId || t.toLocationId || null;
    const base = {
      organizationId: t.organizationId,
      branchId: t.branchId,
      productId: l.productId,
      variantId: l.variantId || null,
      refType: 'WarehouseTransfer',
      refId: t._id,
      refNumber: t.number,
      date: t.date || new Date(),
      createdBy: userId,
    };
    moves.push({
      ...base,
      warehouseId: t.fromWarehouseId,
      locationId: fromLoc,
      moveType: 'transfer_out',
      quantity: -l.quantity,
      counterpartWarehouseId: t.toWarehouseId,
      counterpartLocationId: toLoc,
    });
    moves.push({
      ...base,
      warehouseId: t.toWarehouseId,
      locationId: toLoc,
      moveType: 'transfer_in',
      quantity: l.quantity,
      counterpartWarehouseId: t.fromWarehouseId,
      counterpartLocationId: fromLoc,
    });
  });
  return moves;
};

/** Cancel: a draft is just closed; a done transfer has its moves reversed. */
const cancelTransfer = async ({ organizationId, transferId, userId }) => {
  const transfer = await getTransfer({ organizationId, transferId, populate: false });
  if (transfer.status === 'cancelled') return getTransfer({ organizationId, transferId });
  if (transfer.status === 'done') await syncDocumentMoves('WarehouseTransfer', transfer._id, async () => []);
  transfer.status = 'cancelled';
  transfer.cancelledAt = new Date();
  transfer.cancelledBy = userId;
  await transfer.save();
  return getTransfer({ organizationId, transferId });
};

const deleteTransfer = async ({ organizationId, transferId }) => {
  const transfer = await getTransfer({ organizationId, transferId, populate: false });
  if (transfer.status === 'done') throw new ApiError(httpStatus.BAD_REQUEST, 'A posted transfer cannot be deleted — cancel it instead');
  await transfer.deleteOne();
  return { deleted: true };
};

// ── Reorder rules & replenishment ────────────────────────────────────────────────────────

const RULE_POPULATE = [
  { path: 'warehouseId', select: 'name code isDefault' },
  { path: 'sourceWarehouseId', select: 'name code isDefault' },
];

/** Rules with each one's current quantity and state (ok / low / empty). */
const listRules = async ({ organizationId, branchId, warehouseId }) => {
  requireBranch(branchId);
  const filter = { organizationId: oid(organizationId), branchId: oid(branchId) };
  if (isId(warehouseId)) filter.warehouseId = oid(warehouseId);
  const rules = await WarehouseReorderRule.find(filter).populate(RULE_POPULATE).lean();
  if (!rules.length) return [];
  const { rows } = await computeBranchStock({ organizationId, branchId, productIds: [...new Set(rules.map((r) => String(r.productId)))] });
  const rowByKey = new Map(rows.map((r) => [r.key, r]));
  return rules
    .map((r) => {
      const row = rowByKey.get(`${r.productId}|${r.variantId || ''}`);
      const quantity = row ? round(row.byWarehouse[String(r.warehouseId?._id || r.warehouseId)] || 0) : 0;
      return {
        id: String(r._id),
        warehouse: r.warehouseId ? { id: String(r.warehouseId._id), name: r.warehouseId.name, code: r.warehouseId.code } : null,
        source: r.sourceWarehouseId ? { id: String(r.sourceWarehouseId._id), name: r.sourceWarehouseId.name, code: r.sourceWarehouseId.code } : null,
        productId: String(r.productId),
        variantId: r.variantId ? String(r.variantId) : null,
        name: row?.name || '(deleted product)',
        sku: row?.sku || '',
        unit: row?.unit || '',
        minQty: r.minQty,
        maxQty: r.maxQty,
        isActive: r.isActive !== false,
        quantity,
        state: quantity <= 0 ? 'empty' : quantity <= r.minQty ? 'low' : 'ok',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** Creates or updates rules for one warehouse (upsert by product/variant). */
const upsertRules = async ({ organizationId, branchId, warehouseId, rules, userId }) => {
  const wh = await getWarehouse(organizationId, warehouseId);
  if (String(wh.branchId) !== String(branchId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Warehouse is not in this branch');
  const productIds = [...new Set(rules.map((r) => String(r.productId)))];
  const products = await Product.find({ _id: { $in: productIds }, organizationId, branchId }).select('_id').lean();
  const known = new Set(products.map((p) => String(p._id)));
  const sources = [...new Set(rules.map((r) => r.sourceWarehouseId).filter(isId).map(String))];
  const srcDocs = sources.length ? await Warehouse.find({ _id: { $in: sources }, organizationId, branchId }).select('_id').lean() : [];
  const knownSrc = new Set(srcDocs.map((w) => String(w._id)));
  const writes = rules.map((r) => {
    if (!known.has(String(r.productId))) throw new ApiError(httpStatus.BAD_REQUEST, 'A product is not in this branch');
    const minQty = Number(r.minQty);
    const maxQty = Number(r.maxQty);
    if (!(minQty >= 0) || !(maxQty >= minQty) || maxQty <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Max must be above zero and at least the min');
    const source = isId(r.sourceWarehouseId) ? String(r.sourceWarehouseId) : null;
    if (source && !knownSrc.has(source)) throw new ApiError(httpStatus.BAD_REQUEST, 'Refill-from warehouse not found in this branch');
    if (source && source === String(wh._id)) throw new ApiError(httpStatus.BAD_REQUEST, 'A warehouse cannot refill from itself');
    return {
      updateOne: {
        filter: { warehouseId: wh._id, productId: oid(r.productId), variantId: isId(r.variantId) ? oid(r.variantId) : null },
        update: {
          $set: { minQty, maxQty, sourceWarehouseId: source ? oid(source) : null, isActive: r.isActive !== false, updatedBy: userId },
          $setOnInsert: { organizationId: wh.organizationId, branchId: wh.branchId, createdBy: userId },
        },
        upsert: true,
      },
    };
  });
  if (writes.length) await WarehouseReorderRule.bulkWrite(writes, { ordered: false });
  return listRules({ organizationId, branchId, warehouseId });
};

const deleteRule = async ({ organizationId, ruleId }) => {
  const res = await WarehouseReorderRule.deleteOne({ _id: ruleId, organizationId });
  if (!res.deletedCount) throw new ApiError(httpStatus.NOT_FOUND, 'Rule not found');
  return { deleted: true };
};

/**
 * What to do for every warehouse at or below its min: bring it up to max, by transfer from
 * the rule's source warehouse (default: the branch default) as far as that has stock — shared
 * fairly between rules drawing on the same source — and the rest "to buy".
 */
const getReplenishment = async ({ organizationId, branchId }) => {
  requireBranch(branchId);
  const rules = await WarehouseReorderRule.find({ organizationId: oid(organizationId), branchId: oid(branchId), isActive: true }).populate(RULE_POPULATE).lean();
  if (!rules.length) return { items: [], totals: { rules: 0, triggered: 0, toTransfer: 0, toBuy: 0 } };
  const { rows, defaultWarehouseId } = await computeBranchStock({ organizationId, branchId, productIds: [...new Set(rules.map((r) => String(r.productId)))] });
  const rowByKey = new Map(rows.map((r) => [r.key, r]));
  const remaining = new Map(); // `${rowKey}@${warehouseId}` → qty a source can still give
  const items = [];
  rules
    .filter((r) => r.warehouseId)
    .sort((a, b) => a.minQty - b.minQty)
    .forEach((r) => {
      const rowKey = `${r.productId}|${r.variantId || ''}`;
      const row = rowByKey.get(rowKey);
      const whId = String(r.warehouseId._id);
      const quantity = row ? round(row.byWarehouse[whId] || 0) : 0;
      if (quantity > r.minQty) return;
      const need = round(r.maxQty - quantity);
      if (need <= 0) return;
      const sourceId = r.sourceWarehouseId ? String(r.sourceWarehouseId._id) : whId === defaultWarehouseId ? null : defaultWarehouseId;
      let transferQty = 0;
      let sourceQty = 0;
      if (sourceId && row) {
        const rk = `${rowKey}@${sourceId}`;
        if (!remaining.has(rk)) remaining.set(rk, Math.max(0, round(row.byWarehouse[sourceId] || 0)));
        sourceQty = remaining.get(rk);
        transferQty = Math.min(need, sourceQty);
        remaining.set(rk, round(sourceQty - transferQty));
      }
      items.push({
        ruleId: String(r._id),
        productId: String(r.productId),
        variantId: r.variantId ? String(r.variantId) : null,
        name: row?.name || '(deleted product)',
        sku: row?.sku || '',
        unit: row?.unit || '',
        warehouse: { id: whId, name: r.warehouseId.name, code: r.warehouseId.code },
        source: sourceId ? { id: sourceId, name: r.sourceWarehouseId?.name || 'Default warehouse', code: r.sourceWarehouseId?.code || '' } : null,
        quantity,
        minQty: r.minQty,
        maxQty: r.maxQty,
        need,
        sourceQty: round(sourceQty),
        transferQty: round(transferQty),
        buyQty: round(need - transferQty),
      });
    });
  // Fill in the default warehouse's name for rules that refill from it implicitly.
  const defaultWh = await Warehouse.findById(defaultWarehouseId).select('name code').lean();
  items.forEach((i) => {
    if (i.source && !i.source.code && defaultWh) i.source = { id: String(defaultWh._id), name: defaultWh.name, code: defaultWh.code };
  });
  items.sort((a, b) => a.warehouse.name.localeCompare(b.warehouse.name) || a.name.localeCompare(b.name));
  return {
    items,
    totals: {
      rules: rules.length,
      triggered: items.length,
      toTransfer: items.filter((i) => i.transferQty > 0).length,
      toBuy: items.filter((i) => i.buyQty > 0).length,
    },
  };
};

/** Turns chosen replenishment lines into draft transfers, one per source → destination. */
const createReplenishmentTransfers = async ({ organizationId, branchId, lines, userId }) => {
  const { items } = await getReplenishment({ organizationId, branchId });
  const byRule = new Map(items.map((i) => [i.ruleId, i]));
  const groups = new Map();
  lines.forEach((l) => {
    const item = byRule.get(String(l.ruleId));
    if (!item || !item.source) return;
    const qty = round(l.quantity ?? item.transferQty);
    if (!(qty > 0)) return;
    const key = `${item.source.id}>${item.warehouse.id}`;
    if (!groups.has(key)) groups.set(key, { fromWarehouseId: item.source.id, toWarehouseId: item.warehouse.id, lines: [] });
    groups.get(key).lines.push({ productId: item.productId, variantId: item.variantId, quantity: qty });
  });
  if (!groups.size) throw new ApiError(httpStatus.BAD_REQUEST, 'Nothing to transfer — pick lines that have stock at their source');
  const created = [];
  for (const g of groups.values()) {
    created.push(
      await createTransfer({ organizationId, branchId, userId, body: { ...g, reference: 'Replenishment', notes: 'Created from reorder rules' } })
    );
  }
  return created;
};

// ── Moves history ────────────────────────────────────────────────────────────────────────

const queryMoves = async ({ organizationId, branchId, query = {} }) => {
  const filter = { organizationId: oid(organizationId) };
  if (branchId) filter.branchId = oid(branchId);
  if (isId(query.warehouseId)) filter.warehouseId = oid(query.warehouseId);
  if (isId(query.locationId)) filter.locationId = oid(query.locationId);
  if (isId(query.productId)) filter.productId = oid(query.productId);
  if (query.moveType) filter.moveType = query.moveType;
  if (query.refType) filter.refType = query.refType;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = new Date(query.from);
    if (query.to) filter.date.$lte = new Date(query.to);
  }
  if (query.search) {
    const re = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const products = await Product.find({ organizationId, ...(branchId ? { branchId } : {}), $or: [{ name: re }, { sku: re }, { barcode: re }] })
      .select('_id')
      .limit(500)
      .lean();
    filter.$or = [{ refNumber: re }, { productId: { $in: products.map((p) => p._id) } }];
  }
  return WarehouseMove.paginate(filter, {
    sortBy: 'date:desc,createdAt:desc',
    limit: Math.min(Number(query.limit) || 50, 200),
    page: query.page || 1,
    populate: [
      { path: 'productId', select: 'name sku barcode unit' },
      { path: 'warehouseId', select: 'name code isDefault' },
      { path: 'locationId', select: 'path' },
      { path: 'counterpartWarehouseId', select: 'name code' },
      { path: 'counterpartLocationId', select: 'path' },
      { path: 'createdBy', select: 'name' },
    ],
  });
};

module.exports = {
  DEFAULT_SETTINGS,
  normalizeSettings,
  getSettings,
  updateSettings,
  ensureDefaultWarehouse,
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  setDefaultWarehouse,
  deleteWarehouse,
  suggestCode,
  listLocations,
  createLocation,
  createLocationsBulk,
  updateLocation,
  deleteLocation,
  computeBranchStock,
  getStock,
  getOverview,
  getAvailability,
  getProductBreakdown,
  syncInvoice,
  syncPurchase,
  syncSalesReturn,
  syncPurchaseReturn,
  syncAdjustment,
  syncBranchTransfer,
  quantityReader,
  queueLedgerSync,
  syncManufacturingRef,
  syncInstallmentPlan,
  syncSimSale,
  syncBuyback,
  getWarehouseQuantities,
  placeOpeningStock,
  recordStockEdit,
  assertDocWarehouse,
  queryTransfers,
  getTransfer,
  createTransfer,
  updateTransfer,
  validateTransfer,
  cancelTransfer,
  deleteTransfer,
  queryMoves,
  listRules,
  upsertRules,
  deleteRule,
  getReplenishment,
  createReplenishmentTransfers,
};
