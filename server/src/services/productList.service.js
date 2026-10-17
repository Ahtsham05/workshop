const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { Product, ProductList } = require('../models');

/**
 * Product lists ("To order", "Do not order", "Online", "High value", custom) — see
 * models/productList.model.js. Everything is scoped to one organization + branch, the
 * same as the products the lists hold.
 */

const DEFAULT_LOW_STOCK = 10;
const MAX_ITEMS_PER_LIST = 5000;

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const scopeOf = ({ organizationId, branchId }) => ({ organizationId: oid(organizationId), branchId: oid(branchId) });

/** The presets offered when creating a list; a smart preset brings its rule along. */
const PRESETS = {
  to_order: { name: 'To order', color: '#2563eb', kind: 'manual' },
  do_not_order: { name: 'Do not order', color: '#dc2626', kind: 'manual' },
  online: { name: 'Online', color: '#7c3aed', kind: 'manual' },
  high_value: { name: 'High value items', color: '#d97706', kind: 'smart', rule: { type: 'top_stock_value', limit: 50 } },
};

const findListOrThrow = async (scope, listId) => {
  if (!mongoose.Types.ObjectId.isValid(String(listId))) throw new ApiError(httpStatus.NOT_FOUND, 'List not found');
  const list = await ProductList.findOne({ _id: listId, ...scopeOf(scope) });
  if (!list) throw new ApiError(httpStatus.NOT_FOUND, 'List not found');
  return list;
};

/** Product filter + order for a smart rule (evaluated now, against the branch's products). */
const ruleQuery = (scope, rule) => {
  const match = { ...scopeOf(scope) };
  if (rule.categoryId) match['categories._id'] = oid(rule.categoryId);
  const limit = Math.min(Math.max(1, Number(rule.limit) || 50), 1000);
  switch (rule.type) {
    case 'top_stock_value':
      return { match: { ...match, stockQuantity: { $gt: 0 } }, value: { $multiply: ['$stockQuantity', { $ifNull: ['$cost', 0] }] }, dir: -1, limit };
    case 'top_price':
      return { match: { ...match, isActive: { $ne: false } }, value: { $ifNull: ['$price', 0] }, dir: -1, limit };
    case 'low_stock': {
      const fallback = rule.threshold ?? DEFAULT_LOW_STOCK;
      return {
        match: {
          ...match,
          isActive: { $ne: false },
          // The product's own low-stock level when it has one, else the list's threshold.
          $expr: { $lte: ['$stockQuantity', { $ifNull: ['$lowStockThreshold', fallback] }] },
        },
        value: '$stockQuantity',
        dir: 1,
        limit,
      };
    }
    case 'out_of_stock':
      return { match: { ...match, isActive: { $ne: false }, stockQuantity: { $lte: 0 } }, value: '$name', dir: 1, limit };
    case 'inactive_with_stock':
      return { match: { ...match, isActive: false, stockQuantity: { $gt: 0 } }, value: { $multiply: ['$stockQuantity', { $ifNull: ['$cost', 0] }] }, dir: -1, limit };
    default:
      throw new ApiError(httpStatus.BAD_REQUEST, `Unknown list rule "${rule.type}"`);
  }
};

const evaluateRule = async (scope, rule) => {
  const { match, value, dir, limit } = ruleQuery(scope, rule);
  const rows = await Product.aggregate([
    { $match: match },
    { $addFields: { _ruleValue: value } },
    { $sort: { _ruleValue: dir, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 1 } },
  ]);
  return rows.map((r) => r._id);
};

/**
 * Ids of the products currently on a list, in list order: a manual list's items that still
 * exist in this branch (a deleted product simply drops off), or a smart list's live result.
 */
const resolveListProductIds = async (scope, listOrId) => {
  const list = listOrId instanceof ProductList ? listOrId : await findListOrThrow(scope, listOrId);
  if (list.kind === 'smart' && list.rule) return evaluateRule(scope, list.rule);
  const ids = (list.items || []).map((item) => item.productId);
  if (!ids.length) return [];
  const existing = await Product.find({ _id: { $in: ids }, ...scopeOf(scope) }).select('_id').lean();
  const present = new Set(existing.map((p) => String(p._id)));
  return ids.filter((id) => present.has(String(id)));
};

/** Count / quantity / cost value of a set of products. */
const summarize = (products) =>
  products.reduce(
    (acc, p) => {
      const qty = Number(p.stockQuantity) || 0;
      acc.productCount += 1;
      acc.stockQuantity += qty;
      acc.stockValue += qty > 0 ? qty * (Number(p.cost) || 0) : 0;
      acc.saleValue += qty > 0 ? qty * (Number(p.price) || 0) : 0;
      return acc;
    },
    { productCount: 0, stockQuantity: 0, stockValue: 0, saleValue: 0 }
  );

const serializeList = (list, summary) => {
  const json = list.toJSON();
  delete json.items;
  return { ...json, itemCount: (list.items || []).length, ...summary };
};

/** Every list in the branch with its live product count and stock value, pinned first. */
const listProductLists = async (scope) => {
  const lists = await ProductList.find(scopeOf(scope)).sort({ pinned: -1, createdAt: 1 });
  const manualIds = [...new Set(lists.filter((l) => l.kind !== 'smart').flatMap((l) => l.items.map((i) => String(i.productId))))];
  const manualProducts = manualIds.length
    ? await Product.find({ _id: { $in: manualIds }, ...scopeOf(scope) }).select('stockQuantity cost price').lean()
    : [];
  const productById = new Map(manualProducts.map((p) => [String(p._id), p]));

  return Promise.all(
    lists.map(async (list) => {
      if (list.kind === 'smart' && list.rule) {
        const ids = await evaluateRule(scope, list.rule);
        const products = ids.length ? await Product.find({ _id: { $in: ids } }).select('stockQuantity cost price').lean() : [];
        return serializeList(list, summarize(products));
      }
      const products = list.items.map((i) => productById.get(String(i.productId))).filter(Boolean);
      return serializeList(list, summarize(products));
    })
  );
};

const getProductList = async (scope, listId) => {
  const list = await findListOrThrow(scope, listId);
  const ids = await resolveListProductIds(scope, list);
  const products = ids.length ? await Product.find({ _id: { $in: ids } }).select('stockQuantity cost price').lean() : [];
  return { ...serializeList(list, summarize(products)), items: list.kind === 'smart' ? [] : list.toJSON().items };
};

const normalizeRule = (kind, rule) => {
  if (kind !== 'smart') return null;
  if (!rule || !rule.type) throw new ApiError(httpStatus.BAD_REQUEST, 'A smart list needs a rule');
  return {
    type: rule.type,
    limit: rule.limit ?? 50,
    threshold: rule.threshold ?? null,
    categoryId: rule.categoryId || null,
  };
};

const duplicateNameError = (error) =>
  error && error.code === 11000 ? new ApiError(httpStatus.CONFLICT, 'A list with this name already exists in this branch') : error;

const createProductList = async (scope, body, userId) => {
  const preset = PRESETS[body.purpose] || {};
  const kind = body.kind || preset.kind || 'manual';
  try {
    const list = await ProductList.create({
      ...scopeOf(scope),
      name: (body.name || preset.name || '').trim(),
      description: body.description || '',
      purpose: body.purpose || 'custom',
      color: body.color ?? preset.color ?? null,
      kind,
      rule: normalizeRule(kind, body.rule || preset.rule),
      pinned: !!body.pinned,
      createdBy: userId,
      updatedBy: userId,
    });
    return getProductList(scope, list._id);
  } catch (error) {
    throw duplicateNameError(error);
  }
};

const updateProductList = async (scope, listId, body, userId) => {
  const list = await findListOrThrow(scope, listId);
  ['name', 'description', 'purpose', 'color', 'pinned'].forEach((key) => {
    if (body[key] !== undefined) list[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
  });
  if (body.kind !== undefined) list.kind = body.kind;
  if (body.kind !== undefined || body.rule !== undefined) list.rule = normalizeRule(list.kind, body.rule ?? list.rule);
  list.updatedBy = userId;
  try {
    await list.save();
  } catch (error) {
    throw duplicateNameError(error);
  }
  return getProductList(scope, list._id);
};

const deleteProductList = async (scope, listId) => {
  const list = await findListOrThrow(scope, listId);
  await list.deleteOne();
};

/** Adds products to a manual list (already-listed ones are left as they are). */
const addProductsToList = async (scope, listId, { productIds, quantity, note }, userId) => {
  const list = await findListOrThrow(scope, listId);
  if (list.kind === 'smart') throw new ApiError(httpStatus.BAD_REQUEST, 'A smart list fills itself — products cannot be added by hand');
  const wanted = [...new Set((productIds || []).map(String))];
  const valid = await Product.find({ _id: { $in: wanted }, ...scopeOf(scope) }).select('_id').lean();
  const validIds = new Set(valid.map((p) => String(p._id)));
  const already = new Set(list.items.map((i) => String(i.productId)));
  const toAdd = wanted.filter((id) => validIds.has(id) && !already.has(id));
  if (list.items.length + toAdd.length > MAX_ITEMS_PER_LIST) {
    throw new ApiError(httpStatus.BAD_REQUEST, `A list can hold up to ${MAX_ITEMS_PER_LIST.toLocaleString()} products`);
  }
  const now = new Date();
  toAdd.forEach((id) => list.items.push({ productId: id, quantity: quantity ?? null, note: note || '', addedBy: userId, addedAt: now }));
  list.updatedBy = userId;
  await list.save();
  return { added: toAdd.length, alreadyOnList: wanted.filter((id) => already.has(id)).length, notFound: wanted.filter((id) => !validIds.has(id)).length };
};

const removeProductsFromList = async (scope, listId, { productIds }, userId) => {
  const list = await findListOrThrow(scope, listId);
  if (list.kind === 'smart') throw new ApiError(httpStatus.BAD_REQUEST, 'A smart list fills itself — change its rule instead');
  const remove = new Set((productIds || []).map(String));
  const before = list.items.length;
  list.items = list.items.filter((i) => !remove.has(String(i.productId)));
  list.updatedBy = userId;
  await list.save();
  return { removed: before - list.items.length };
};

const updateListItem = async (scope, listId, productId, { quantity, note }, userId) => {
  const list = await findListOrThrow(scope, listId);
  const item = list.items.find((i) => String(i.productId) === String(productId));
  if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'That product is not on this list');
  if (quantity !== undefined) item.quantity = quantity;
  if (note !== undefined) item.note = note;
  list.updatedBy = userId;
  await list.save();
  return item;
};

/** Which manual lists each product is on — the ticks in "Add to list". */
const getListMemberships = async (scope, productIds) => {
  const ids = (productIds || []).filter((id) => mongoose.Types.ObjectId.isValid(String(id))).map(oid);
  if (!ids.length) return {};
  const lists = await ProductList.find({ ...scopeOf(scope), kind: { $ne: 'smart' }, 'items.productId': { $in: ids } })
    .select('_id items.productId')
    .lean();
  const wanted = new Set(ids.map(String));
  const out = {};
  lists.forEach((list) =>
    list.items.forEach((item) => {
      const key = String(item.productId);
      if (wanted.has(key)) (out[key] = out[key] || []).push(String(list._id));
    })
  );
  return out;
};

/** Products on any "Do not order" list — the purchase screen warns before ordering them. */
const getDoNotOrderProducts = async (scope) => {
  const lists = await ProductList.find({ ...scopeOf(scope), purpose: 'do_not_order' }).select('name kind rule items.productId items.note');
  const out = {};
  for (const list of lists) {
    const ids = list.kind === 'smart' && list.rule ? await evaluateRule(scope, list.rule) : list.items.map((i) => i.productId);
    const notes = new Map(list.items.map((i) => [String(i.productId), i.note]));
    ids.forEach((id) => {
      const key = String(id);
      if (!out[key]) out[key] = { listId: String(list._id), listName: list.name, note: notes.get(key) || '' };
    });
  }
  return out;
};

/** A 'to_order' list as purchase lines: product + quantity to order (list qty, else 1). */
const getListOrderLines = async (scope, listId) => {
  const list = await findListOrThrow(scope, listId);
  const ids = await resolveListProductIds(scope, list);
  const qtyById = new Map(list.items.map((i) => [String(i.productId), i.quantity]));
  return ids.map((id) => ({ productId: String(id), quantity: qtyById.get(String(id)) || null }));
};

module.exports = {
  PRESETS,
  listProductLists,
  getProductList,
  createProductList,
  updateProductList,
  deleteProductList,
  addProductsToList,
  removeProductsFromList,
  updateListItem,
  resolveListProductIds,
  getListMemberships,
  getDoNotOrderProducts,
  getListOrderLines,
};
