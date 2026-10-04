const crypto = require('crypto');
const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/productMatchKey');
const { WebsiteConnection, Branch, Brand, Product, ProductVariant, Inventory } = require('../models');
const { tokenSearchClauses } = require('../utils/searchQuery');

/**
 * Website Connections: the shop's own website reads live inventory from here instead of
 * someone keeping a second copy of the catalog up to date by hand.
 *
 * What the website sees, per product:
 *   - One entry per product however many of the chosen branches carry it. Branches are
 *     matched on the shared catalog identity (masterProductId — see masterProduct.service.js),
 *     so the same item stocked in three branches is one website product.
 *   - `available`: the chosen branches' stock added up — a branch below zero counts as
 *     zero, never as a debt against the others — minus the connection's safety stock, and
 *     never below zero. Products switched off at a branch don't count there (by default).
 *   - Name, price, photos from the connection's price branch when it carries the product,
 *     else from another chosen branch.
 *   - Variant products list their variants, each with its own `available`.
 *
 * Read-only by design: a website key can never change anything in the shop.
 */

const KEY_PREFIX = 'lps_live_';
const KEY_BODY_LENGTH = 40;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const hashKey = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

const generateKey = () => {
  const bytes = crypto.randomBytes(KEY_BODY_LENGTH);
  let body = '';
  for (let i = 0; i < KEY_BODY_LENGTH; i += 1) body += BASE62[bytes[i] % BASE62.length];
  return `${KEY_PREFIX}${body}`;
};

const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

// --- keys -----------------------------------------------------------------------------------

// Resolved keys, briefly, so a website polling every few seconds costs one lookup a minute,
// not one per request. A disabled, rotated or deleted key stops working on this instance at
// once (see forgetCachedKeys) and on any other within KEY_CACHE_TTL_MS.
const KEY_CACHE_TTL_MS = 60 * 1000;
const keyCache = new Map(); // keyHash -> { connection, at }
// lastUsedAt is written at most this often per connection.
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

const forgetCachedKeys = (connectionId) => {
  for (const [hash, entry] of keyCache) {
    if (String(entry.connection._id) === String(connectionId)) keyCache.delete(hash);
  }
};

/**
 * The active connection a raw API key belongs to, or null. Only the key's hash is ever
 * looked up, so timing can't leak anything about stored keys.
 */
const authenticateKey = async (rawKey) => {
  if (typeof rawKey !== 'string' || !rawKey.startsWith(KEY_PREFIX) || rawKey.length !== KEY_PREFIX.length + KEY_BODY_LENGTH) {
    return null;
  }
  const keyHash = hashKey(rawKey);
  const cached = keyCache.get(keyHash);
  if (cached && Date.now() - cached.at < KEY_CACHE_TTL_MS) return cached.connection;

  const connection = await WebsiteConnection.findOne({ keyHash, isActive: true }).lean();
  if (!connection) {
    keyCache.delete(keyHash);
    return null;
  }
  keyCache.set(keyHash, { connection, at: Date.now() });
  if (!connection.lastUsedAt || Date.now() - new Date(connection.lastUsedAt).getTime() > LAST_USED_WRITE_INTERVAL_MS) {
    // Bookkeeping only — never fails or slows the request it rides on.
    WebsiteConnection.updateOne({ _id: connection._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return connection;
};

// --- managing connections --------------------------------------------------------------------

/** Every branch id must belong to the organization; the price branch must be one of them. */
const validateBranches = async (organizationId, { branchIds, priceBranchId }) => {
  const ids = [...new Set((branchIds || []).map(String))];
  if (!ids.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Choose at least one branch whose stock the website sells');
  const found = await Branch.countDocuments({ _id: { $in: ids }, organizationId });
  if (found !== ids.length) throw new ApiError(httpStatus.BAD_REQUEST, 'One of the chosen branches is not part of this business');
  const price = priceBranchId ? String(priceBranchId) : ids[0];
  if (!ids.includes(price)) throw new ApiError(httpStatus.BAD_REQUEST, 'The price branch must be one of the chosen branches');
  return { branchIds: ids, priceBranchId: price };
};

const listConnections = (organizationId) => WebsiteConnection.find({ organizationId }).sort({ createdAt: -1 });

const getConnection = async (organizationId, id) => {
  const connection = await WebsiteConnection.findOne({ _id: id, organizationId });
  if (!connection) throw new ApiError(httpStatus.NOT_FOUND, 'Website connection not found');
  return connection;
};

/** Creates a connection. The returned `apiKey` is the only time the key is ever available. */
const createConnection = async (organizationId, userId, body) => {
  const branches = await validateBranches(organizationId, body);
  const apiKey = generateKey();
  const connection = await WebsiteConnection.create({
    organizationId,
    name: body.name,
    websiteUrl: body.websiteUrl || '',
    ...branches,
    safetyStock: body.safetyStock || 0,
    activeProductsOnly: body.activeProductsOnly !== false,
    keyHash: hashKey(apiKey),
    keyPrefix: apiKey.slice(0, KEY_PREFIX.length + 6),
    createdBy: userId,
  });
  return { connection, apiKey };
};

const updateConnection = async (organizationId, userId, id, body) => {
  const connection = await getConnection(organizationId, id);
  if (body.branchIds || body.priceBranchId) {
    Object.assign(
      connection,
      await validateBranches(organizationId, {
        branchIds: body.branchIds || connection.branchIds,
        priceBranchId: body.priceBranchId || (body.branchIds ? null : connection.priceBranchId),
      })
    );
  }
  ['name', 'websiteUrl', 'safetyStock', 'activeProductsOnly', 'isActive'].forEach((field) => {
    if (body[field] !== undefined) connection[field] = body[field];
  });
  connection.updatedBy = userId;
  await connection.save();
  forgetCachedKeys(connection._id);
  return connection;
};

/** Replaces the key; the old one stops working. Returns the new key (shown once). */
const rotateKey = async (organizationId, userId, id) => {
  const connection = await getConnection(organizationId, id);
  const apiKey = generateKey();
  connection.keyHash = hashKey(apiKey);
  connection.keyPrefix = apiKey.slice(0, KEY_PREFIX.length + 6);
  connection.updatedBy = userId;
  await connection.save();
  forgetCachedKeys(connection._id);
  return { connection, apiKey };
};

const deleteConnection = async (organizationId, id) => {
  const connection = await getConnection(organizationId, id);
  await connection.deleteOne();
  forgetCachedKeys(connection._id);
  return connection;
};

// --- the feed --------------------------------------------------------------------------------

const MAX_PAGE_SIZE = 200;
const MAX_LOOKUP_CODES = 200;

/** The products a connection sells from, before merging branches. */
const productScope = (connection) => ({
  organizationId: toObjectId(connection.organizationId),
  branchId: { $in: connection.branchIds.map(toObjectId) },
  ...(connection.activeProductsOnly !== false ? { isActive: { $ne: false } } : {}),
});

const priceBranchOf = (connection) => toObjectId(connection.priceBranchId || connection.branchIds[0]);

/**
 * Merges the connection's branches' products into website products (one per catalog
 * identity), optionally filtered and paged, all inside MongoDB. Each group carries the
 * price-branch copy (`doc`), the simple-product stock sum, and every branch copy's id.
 */
const groupProducts = async (connection, { match = {}, skip = 0, limit = null, fields }) => {
  const pipeline = [
    { $match: { ...productScope(connection), ...match } },
    {
      $addFields: {
        _key: { $ifNull: ['$masterProductId', '$_id'] },
        _pref: { $cond: [{ $eq: ['$branchId', priceBranchOf(connection)] }, 0, 1] },
      },
    },
    { $sort: { _pref: 1, _id: 1 } },
    {
      $group: {
        _id: '$_key',
        doc: { $first: '$$ROOT' },
        // A branch below zero adds nothing rather than cancelling another branch's stock.
        stock: { $sum: { $cond: ['$hasVariants', 0, { $max: [{ $ifNull: ['$stockQuantity', 0] }, 0] }] } },
        productIds: { $push: '$_id' },
        hasVariants: { $max: { $ifNull: ['$hasVariants', false] } },
        updatedAt: { $max: '$updatedAt' },
      },
    },
    { $sort: { 'doc.name': 1, _id: 1 } },
  ];
  const project = { $project: { doc: fields, stock: 1, productIds: 1, hasVariants: 1, updatedAt: 1 } };
  if (limit === null) {
    const groups = await Product.aggregate([...pipeline, project]).allowDiskUse(true).option({ batchSize: 100000 });
    return { groups, total: groups.length };
  }
  const [result] = await Product.aggregate([
    ...pipeline,
    { $facet: { items: [{ $skip: skip }, { $limit: limit }, project], total: [{ $count: 'n' }] } },
  ]).allowDiskUse(true);
  return { groups: result.items, total: result.total[0] ? result.total[0].n : 0 };
};

const FULL_FIELDS = {
  name: '$doc.name',
  nameUrdu: '$doc.nameUrdu',
  description: '$doc.description',
  sku: '$doc.sku',
  barcode: '$doc.barcode',
  unit: '$doc.unit',
  price: '$doc.price',
  categories: '$doc.categories',
  brandId: '$doc.brandId',
  image: '$doc.image',
  images: '$doc.images',
  tags: '$doc.tags',
  _id: '$doc._id',
};
const STOCK_FIELDS = { sku: '$doc.sku', barcode: '$doc.barcode', _id: '$doc._id' };

/**
 * Variants of the variant products among `groups`, merged across branches the same way as
 * products (by their catalog identity, masterVariantId), with stock summed per variant.
 * Returns groupId -> [website variant].
 */
const variantsFor = async (connection, groups) => {
  const variantGroups = groups.filter((g) => g.hasVariants);
  const byGroup = new Map();
  if (!variantGroups.length) return byGroup;

  const productToGroup = new Map();
  variantGroups.forEach((g) => g.productIds.forEach((pid) => productToGroup.set(String(pid), g)));
  const variants = await ProductVariant.find({
    productId: { $in: [...productToGroup.keys()] },
    isDefault: false,
    isActive: { $ne: false },
  })
    .select('productId masterVariantId sku barcode attributes price')
    .lean();
  const inventory = variants.length
    ? await Inventory.find({ variantId: { $in: variants.map((v) => v._id) } }).select('variantId quantity').lean()
    : [];
  const qtyByVariant = new Map(inventory.map((row) => [String(row.variantId), Math.max(Number(row.quantity) || 0, 0)]));

  const safety = connection.safetyStock || 0;
  for (const g of variantGroups) byGroup.set(String(g._id), new Map());
  for (const v of variants) {
    const group = productToGroup.get(String(v.productId));
    const merged = byGroup.get(String(group._id));
    const key = String(v.masterVariantId || v._id);
    const fromPriceCopy = String(v.productId) === String(group.doc._id);
    const entry = merged.get(key) || { id: key, stock: 0 };
    entry.stock += qtyByVariant.get(String(v._id)) || 0;
    // Name/price/codes from the price-branch copy when it has this variant.
    if (!entry.fromPriceCopy) {
      Object.assign(entry, {
        sku: v.sku || null,
        barcode: v.barcode || null,
        attributes: v.attributes || {},
        price: v.price,
        fromPriceCopy,
      });
    }
    merged.set(key, entry);
  }
  const result = new Map();
  for (const [groupId, merged] of byGroup) {
    result.set(
      groupId,
      [...merged.values()].map(({ stock, fromPriceCopy, ...variant }) => {
        const available = Math.max(stock - safety, 0);
        return { ...variant, available, inStock: available > 0 };
      })
    );
  }
  return result;
};

const photosOf = (doc) => {
  const gallery = (doc.images || []).map((img) => img && img.url).filter(Boolean);
  if (gallery.length) return gallery;
  return doc.image && doc.image.url ? [doc.image.url] : [];
};

/** A merged group, as the website sees it. */
const toWebsiteProduct = (connection, group, variants, brandNameById) => {
  const { doc } = group;
  const safety = connection.safetyStock || 0;
  const productVariants = group.hasVariants ? variants.get(String(group._id)) || [] : undefined;
  const available = group.hasVariants
    ? productVariants.reduce((sum, v) => sum + v.available, 0)
    : Math.max(group.stock - safety, 0);
  return {
    id: String(group._id),
    name: doc.name,
    nameUrdu: doc.nameUrdu || null,
    description: doc.description || null,
    sku: doc.sku || null,
    barcode: doc.barcode || null,
    unit: doc.unit || null,
    price: doc.price,
    category: (doc.categories && doc.categories[0] && doc.categories[0].name) || null,
    brand: doc.brandId ? brandNameById.get(String(doc.brandId)) || null : null,
    tags: doc.tags || [],
    // The same photos the app shows, as ready-to-use URLs: `image` is the main one (first of
    // the gallery), `images` the whole gallery in order.
    image: photosOf(doc)[0] || null,
    images: photosOf(doc),
    available,
    inStock: available > 0,
    hasVariants: !!group.hasVariants,
    ...(productVariants ? { variants: productVariants } : {}),
    updatedAt: group.updatedAt || null,
  };
};

const brandNames = async (organizationId, groups) => {
  const ids = [...new Set(groups.map((g) => g.doc.brandId).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const brands = await Brand.find({ _id: { $in: ids }, organizationId }).select('name').lean();
  return new Map(brands.map((b) => [String(b._id), b.name]));
};

/** GET /storefront/products — the catalog, paged, optionally searched. */
const listProducts = async (connection, { page = 1, limit = 50, search = '', inStockOnly = false } = {}) => {
  const size = Math.min(Math.max(Number(limit) || 50, 1), MAX_PAGE_SIZE);
  const current = Math.max(Number(page) || 1, 1);
  const q = String(search || '').trim();
  const match = q ? { $or: [{ $and: tokenSearchClauses(q, ['name']) }, { barcode: q }, { sku: q }] } : {};
  if (inStockOnly) {
    // Whole-catalog pass: whether a variant product is in stock needs its variants' stock.
    const { groups } = await groupProducts(connection, { match, fields: FULL_FIELDS });
    const [variants, names] = await Promise.all([variantsFor(connection, groups), brandNames(connection.organizationId, groups)]);
    const all = groups.map((g) => toWebsiteProduct(connection, g, variants, names)).filter((p) => p.inStock);
    return {
      results: all.slice((current - 1) * size, current * size),
      page: current,
      limit: size,
      totalResults: all.length,
      totalPages: Math.ceil(all.length / size),
    };
  }
  const { groups, total } = await groupProducts(connection, { match, skip: (current - 1) * size, limit: size, fields: FULL_FIELDS });
  const [variants, names] = await Promise.all([variantsFor(connection, groups), brandNames(connection.organizationId, groups)]);
  return {
    results: groups.map((g) => toWebsiteProduct(connection, g, variants, names)),
    page: current,
    limit: size,
    totalResults: total,
    totalPages: Math.ceil(total / size),
  };
};

/**
 * GET /storefront/stock — just ids, codes and availability, for the whole catalog or the
 * given ids/codes. The cheap call a website polls to keep its stock right, and the one to
 * make at checkout before taking payment.
 */
const listStock = async (connection, { ids = [], codes = [] } = {}) => {
  if (ids.length + codes.length > MAX_LOOKUP_CODES) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Ask for at most ${MAX_LOOKUP_CODES} products at a time`);
  }
  let match = {};
  if (ids.length || codes.length) {
    const validIds = ids.filter((id) => mongoose.isValidObjectId(id)).map(toObjectId);
    // A code may be a variant's: find the products those variants belong to.
    const variantOwners = codes.length
      ? await ProductVariant.find({
          organizationId: toObjectId(connection.organizationId),
          branchId: { $in: connection.branchIds.map(toObjectId) },
          isDefault: false,
          $or: [{ sku: { $in: codes } }, { barcode: { $in: codes } }],
        }).distinct('productId')
      : [];
    match = {
      $or: [
        ...(validIds.length ? [{ masterProductId: { $in: validIds } }, { _id: { $in: validIds } }] : []),
        ...(codes.length ? [{ sku: { $in: codes } }, { barcode: { $in: codes } }] : []),
        ...(variantOwners.length ? [{ _id: { $in: variantOwners } }] : []),
      ],
    };
    if (!match.$or.length) return { results: [] };
  }
  const { groups } = await groupProducts(connection, { match, fields: STOCK_FIELDS });
  const variants = await variantsFor(connection, groups);
  return {
    results: groups.map((g) => {
      const safety = connection.safetyStock || 0;
      const productVariants = g.hasVariants ? variants.get(String(g._id)) || [] : undefined;
      const available = g.hasVariants ? productVariants.reduce((s, v) => s + v.available, 0) : Math.max(g.stock - safety, 0);
      return {
        id: String(g._id),
        sku: g.doc.sku || null,
        barcode: g.doc.barcode || null,
        available,
        inStock: available > 0,
        ...(productVariants
          ? { variants: productVariants.map((v) => ({ id: v.id, sku: v.sku, barcode: v.barcode, available: v.available, inStock: v.inStock })) }
          : {}),
      };
    }),
  };
};

/** GET /storefront/products/:ref — one product by its website id, SKU or barcode. */
const getProduct = async (connection, ref) => {
  const value = String(ref || '').trim();
  const match = mongoose.isValidObjectId(value)
    ? { $or: [{ masterProductId: toObjectId(value) }, { _id: toObjectId(value) }, { sku: value }, { barcode: value }] }
    : { $or: [{ sku: value }, { barcode: value }] };
  const { groups } = await groupProducts(connection, { match, fields: FULL_FIELDS });
  if (!groups.length) throw new ApiError(httpStatus.NOT_FOUND, 'No such product on this website');
  const [variants, names] = await Promise.all([variantsFor(connection, groups), brandNames(connection.organizationId, groups)]);
  return toWebsiteProduct(connection, groups[0], variants, names);
};

module.exports = {
  KEY_PREFIX,
  hashKey,
  authenticateKey,
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  rotateKey,
  deleteConnection,
  listProducts,
  listStock,
  getProduct,
  __resetKeyCacheForTests: () => keyCache.clear(),
};
