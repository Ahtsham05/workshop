const httpStatus = require('http-status');
const { Bom, Product, ProductVariant, ProductionOrder } = require('../../models');
const ApiError = require('../../utils/ApiError');
const {
  MAX_BOM_DEPTH,
  MAX_OPERATIONS,
  EDITABLE_PRODUCTION_STATUSES,
  OPEN_PRODUCTION_STATUSES,
} = require('../../config/manufacturing');
const settingsService = require('./settings.service');
const { roundQty, requireBranch, scopeFilter, escapeRegex, idOf } = require('./common');

const findBomOrThrow = async ({ organizationId, branchId }, bomId) => {
  const bom = await Bom.findOne({ _id: bomId, ...scopeFilter({ organizationId, branchId }) });
  if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');
  return bom;
};

/** A deleted (archived) version is read-only until restored. */
const assertNotDeleted = (bom) => {
  if (bom.deletedAt) throw new ApiError(httpStatus.BAD_REQUEST, 'This BOM version is deleted — restore it first');
};

/** Loads the BOM's output product (and variant) from the same org + branch. */
const loadOutputProduct = async ({ organizationId, branchId, productId, variantId }) => {
  const product = await Product.findOne({ _id: productId, organizationId, branchId }).select(
    'name sku unit hasVariants productType'
  );
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');
  if (product.productType === 'service') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A service product cannot have a Bill of Materials');
  }
  let variant = null;
  if (variantId) {
    variant = await ProductVariant.findOne({ _id: variantId, productId, organizationId }).select('sku');
    if (!variant) throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found for this product');
  }
  return { product, variant };
};

/**
 * Validates and denormalizes component lines against the existing product catalog of the
 * same branch. Every product a BOM touches must already exist there — the manufacturing
 * module never creates products of its own.
 */
const normalizeComponents = async ({ organizationId, branchId, outputProductId, components }) => {
  if (!Array.isArray(components) || components.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A BOM needs at least one component');
  }

  const productIds = new Set();
  const variantIds = new Set();
  const childBomIds = new Set();
  components.forEach((line) => {
    productIds.add(String(line.productId));
    if (line.variantId) variantIds.add(String(line.variantId));
    if (line.childBomId) childBomIds.add(String(line.childBomId));
    (line.alternatives || []).forEach((alt) => {
      productIds.add(String(alt.productId));
      if (alt.variantId) variantIds.add(String(alt.variantId));
    });
  });

  const [products, variants, childBoms] = await Promise.all([
    Product.find({ _id: { $in: [...productIds] }, organizationId, branchId })
      .select('name sku unit productType')
      .lean(),
    variantIds.size
      ? ProductVariant.find({ _id: { $in: [...variantIds] }, organizationId })
          .select('productId sku')
          .lean()
      : [],
    childBomIds.size
      ? Bom.find({ _id: { $in: [...childBomIds] }, organizationId, branchId })
          .select('productId')
          .lean()
      : [],
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const variantById = new Map(variants.map((v) => [String(v._id), v]));
  const childBomById = new Map(childBoms.map((b) => [String(b._id), b]));

  const checkVariant = (variantId, productId, label) => {
    if (!variantId) return;
    const variant = variantById.get(String(variantId));
    if (!variant || String(variant.productId) !== String(productId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Variant does not belong to ${label}`);
    }
  };

  return components.map((line, index) => {
    const product = productById.get(String(line.productId));
    if (!product) throw new ApiError(httpStatus.BAD_REQUEST, `Component #${index + 1}: product not found in this branch`);
    if (String(line.productId) === String(outputProductId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, `A product cannot be a component of its own BOM ("${product.name}")`);
    }
    if (product.productType === 'service') {
      throw new ApiError(httpStatus.BAD_REQUEST, `"${product.name}" is a service and cannot be a BOM component`);
    }
    checkVariant(line.variantId, line.productId, `"${product.name}"`);
    if (line.childBomId) {
      const childBom = childBomById.get(String(line.childBomId));
      if (!childBom || String(childBom.productId) !== String(line.productId)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Component "${product.name}": the linked sub-BOM must be a BOM of that same product`
        );
      }
    }
    const alternatives = (line.alternatives || []).map((alt) => {
      const altProduct = productById.get(String(alt.productId));
      if (!altProduct) throw new ApiError(httpStatus.BAD_REQUEST, `Alternative for "${product.name}": product not found`);
      if (String(alt.productId) === String(line.productId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, `"${product.name}" cannot be an alternative to itself`);
      }
      checkVariant(alt.variantId, alt.productId, `"${altProduct.name}"`);
      return {
        productId: alt.productId,
        variantId: alt.variantId || null,
        productName: altProduct.name,
        ratio: alt.ratio > 0 ? alt.ratio : 1,
      };
    });
    const variant = line.variantId ? variantById.get(String(line.variantId)) : null;
    return {
      ...(line._id ? { _id: line._id } : {}),
      productId: line.productId,
      variantId: line.variantId || null,
      productName: product.name,
      sku: (variant && variant.sku) || product.sku || '',
      quantity: roundQty(line.quantity),
      unit: line.unit || product.unit,
      scrapPercent: line.scrapPercent || 0,
      isOptional: !!line.isOptional,
      childBomId: line.childBomId || null,
      alternatives,
      notes: line.notes || '',
      sequence: line.sequence ?? index,
    };
  });
};

/**
 * Which BOM a component expands into, if any: the line's pinned childBomId, else the
 * component product's default BOM. Resolved lazily with a per-call cache.
 */
const createBomResolver = ({ organizationId, branchId }) => {
  const bomCache = new Map();
  const defaultCache = new Map();

  const getBom = async (bomId) => {
    const key = String(bomId);
    if (!bomCache.has(key)) {
      bomCache.set(key, await Bom.findOne({ _id: bomId, organizationId, branchId }).lean());
    }
    return bomCache.get(key);
  };

  const getDefaultBomIdFor = async (productId) => {
    const key = String(productId);
    if (!defaultCache.has(key)) {
      const product = await Product.findOne({ _id: productId, organizationId, branchId }).select('defaultBomId').lean();
      defaultCache.set(key, product && product.defaultBomId ? product.defaultBomId : null);
    }
    return defaultCache.get(key);
  };

  const childBomFor = async (line) => {
    const bomId = line.childBomId || (await getDefaultBomIdFor(line.productId));
    if (!bomId) return null;
    const bom = await getBom(bomId);
    return bom && bom.isActive !== false ? bom : null;
  };

  return { getBom, childBomFor };
};

/**
 * Rejects a component set that would make the BOM (directly or through any depth of
 * sub-assemblies) contain its own output product.
 */
const assertNoCycle = async ({ organizationId, branchId, outputProductId, components }) => {
  const resolver = createBomResolver({ organizationId, branchId });
  const target = String(outputProductId);

  const walk = async (lines, path, depth) => {
    if (depth > MAX_BOM_DEPTH) {
      throw new ApiError(httpStatus.BAD_REQUEST, `BOM structure is deeper than ${MAX_BOM_DEPTH} levels`);
    }
    // eslint-disable-next-line no-restricted-syntax
    for (const line of lines) {
      if (String(line.productId) === target) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Circular BOM: ${[...path, line.productName || 'component'].join(' → ')} uses the product being built`
        );
      }
      // eslint-disable-next-line no-await-in-loop
      const child = await resolver.childBomFor(line);
      if (child) {
        // eslint-disable-next-line no-await-in-loop
        await walk(child.components || [], [...path, line.productName || child.productName], depth + 1);
      }
    }
  };

  await walk(components, [], 1);
};

const syncProductDefault = async ({ organizationId, branchId, productId, bomId }) => {
  if (bomId) {
    await Bom.updateMany(
      { organizationId, branchId, productId, _id: { $ne: bomId }, isDefault: true },
      { $set: { isDefault: false } }
    );
    await Bom.updateOne({ _id: bomId }, { $set: { isDefault: true } });
  }
  await Product.updateOne({ _id: productId, organizationId, branchId }, { $set: { defaultBomId: bomId || null } });
};

/**
 * Routing steps in the order given (sequence 10, 20, 30 … like a shop routing sheet).
 * A step sent without `costPerHour` keeps the rate of the step it replaces (same id, else
 * same name) — a role that cannot see manufacturing costs has the field stripped from its
 * request, and saving the routing must not wipe a rate it was never shown.
 */
const normalizeOperations = (operations, previous = []) => {
  if (!Array.isArray(operations)) return [];
  if (operations.length > MAX_OPERATIONS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `A routing can have at most ${MAX_OPERATIONS} operations`);
  }
  const previousRate = (op) => {
    const match =
      (op._id && previous.find((p) => p._id && String(p._id) === String(op._id))) ||
      previous.find((p) => p.name === String(op.name || '').trim());
    return match ? match.costPerHour || 0 : 0;
  };
  return operations.map((op, index) => ({
    ...(op._id ? { _id: op._id } : {}),
    name: String(op.name || '').trim(),
    workCenter: String(op.workCenter || '').trim(),
    setupMinutes: Math.max(0, Number(op.setupMinutes) || 0),
    runMinutesPerUnit: Math.max(0, Number(op.runMinutesPerUnit) || 0),
    costPerHour: op.costPerHour === undefined ? previousRate(op) : Math.max(0, Number(op.costPerHour) || 0),
    instructions: String(op.instructions || '').trim(),
    sequence: (index + 1) * 10,
  }));
};

const createBom = async ({ organizationId, branchId, createdBy }, body) => {
  requireBranch(branchId);
  const { product, variant } = await loadOutputProduct({
    organizationId,
    branchId,
    productId: body.productId,
    variantId: body.variantId,
  });
  const components = await normalizeComponents({
    organizationId,
    branchId,
    outputProductId: product._id,
    components: body.components,
  });
  await assertNoCycle({ organizationId, branchId, outputProductId: product._id, components });

  const bomNumber = await settingsService.nextDocumentNumber(organizationId, 'bom');
  const hasDefault = await Bom.exists({ organizationId, branchId, productId: product._id, isDefault: true });
  const makeDefault = body.isDefault === true || !hasDefault;

  const bom = await Bom.create({
    organizationId,
    branchId,
    bomNumber,
    version: 1,
    name: body.name || `${product.name}${variant && variant.sku ? ` (${variant.sku})` : ''}`,
    productId: product._id,
    variantId: variant ? variant._id : null,
    productName: product.name,
    quantity: roundQty(body.quantity || 1),
    unit: body.unit || product.unit,
    components,
    operations: normalizeOperations(body.operations),
    notes: body.notes || '',
    isActive: body.isActive !== false,
    isDefault: false,
    effectiveFrom: body.effectiveFrom || null,
    effectiveTo: body.effectiveTo || null,
    // Only the demo-data seeder sets this (the API validation doesn't accept it).
    isDemo: body.isDemo === true,
    createdBy,
    updatedBy: createdBy,
  });

  if (makeDefault && bom.isActive) {
    await syncProductDefault({ organizationId, branchId, productId: product._id, bomId: bom._id });
    bom.isDefault = true;
  }
  return bom;
};

const queryBoms = async ({ organizationId, branchId }, filter, options) => {
  const query = { ...scopeFilter({ organizationId, branchId }) };
  // Deleted versions only show in their own view.
  query.deletedAt = filter.deleted === true || filter.deleted === 'true' ? { $ne: null } : null;
  if (filter.productId) query.productId = filter.productId;
  if (filter.bomNumber) query.bomNumber = filter.bomNumber;
  if (filter.isActive !== undefined) query.isActive = filter.isActive === true || filter.isActive === 'true';
  if (filter.isDefault !== undefined) query.isDefault = filter.isDefault === true || filter.isDefault === 'true';
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [{ bomNumber: re }, { name: re }, { productName: re }];
  }
  return Bom.paginate(query, { sortBy: 'createdAt:desc', ...options });
};

const getBom = async (ctx, bomId) => findBomOrThrow(ctx, bomId);

const EDITABLE_FIELDS = ['name', 'quantity', 'unit', 'notes', 'effectiveFrom', 'effectiveTo'];

const updateBom = async ({ organizationId, branchId, createdBy }, bomId, body) => {
  requireBranch(branchId);
  const bom = await findBomOrThrow({ organizationId, branchId }, bomId);
  assertNotDeleted(bom);
  const touchesRecipe = body.components !== undefined || body.quantity !== undefined;
  if (bom.isLocked && touchesRecipe) {
    throw new ApiError(
      httpStatus.CONFLICT,
      'This BOM version is locked because a released production order uses it — create a new version to change it.'
    );
  }

  EDITABLE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) bom[field] = field === 'quantity' ? roundQty(body[field]) : body[field];
  });

  if (body.components !== undefined) {
    const components = await normalizeComponents({
      organizationId,
      branchId,
      outputProductId: bom.productId,
      components: body.components,
    });
    await assertNoCycle({ organizationId, branchId, outputProductId: bom.productId, components });
    bom.components = components;
  }
  // Allowed on a locked version too: orders keep their own copy of the routing.
  if (body.operations !== undefined) bom.operations = normalizeOperations(body.operations, bom.operations);
  bom.updatedBy = createdBy;
  await bom.save();

  if (body.isActive !== undefined && body.isActive !== bom.isActive) {
    return setBomActive({ organizationId, branchId }, bomId, body.isActive);
  }
  if (body.isDefault === true && !bom.isDefault) {
    return setDefaultBom({ organizationId, branchId }, bomId);
  }
  return bom;
};

/** Clones a version into the next version number (inactive defaults: not default, unlocked). */
const createNewVersion = async ({ organizationId, branchId, createdBy }, bomId, body = {}) => {
  requireBranch(branchId);
  const source = await findBomOrThrow({ organizationId, branchId }, bomId);
  assertNotDeleted(source);
  const latest = await Bom.findOne({ organizationId, bomNumber: source.bomNumber })
    .sort({ version: -1 })
    .select('version')
    .lean();
  const plain = source.toObject();

  const components = body.components
    ? await normalizeComponents({ organizationId, branchId, outputProductId: source.productId, components: body.components })
    : plain.components.map(({ _id, ...line }) => line);
  if (body.components) await assertNoCycle({ organizationId, branchId, outputProductId: source.productId, components });

  const created = await Bom.create({
    organizationId,
    branchId,
    bomNumber: source.bomNumber,
    version: (latest ? latest.version : source.version) + 1,
    name: body.name ?? source.name,
    productId: source.productId,
    variantId: source.variantId,
    productName: source.productName,
    quantity: body.quantity !== undefined ? roundQty(body.quantity) : source.quantity,
    unit: body.unit || source.unit,
    components,
    operations: normalizeOperations(
      body.operations !== undefined ? body.operations : plain.operations.map(({ _id, ...op }) => op),
      plain.operations
    ),
    notes: body.notes ?? source.notes,
    isActive: true,
    isDefault: false,
    isLocked: false,
    effectiveFrom: body.effectiveFrom ?? null,
    effectiveTo: body.effectiveTo ?? null,
    isDemo: !!source.isDemo,
    createdBy,
    updatedBy: createdBy,
  });

  if (body.isDefault === true) return setDefaultBom({ organizationId, branchId }, created._id);
  return created;
};

const listVersions = async ({ organizationId, branchId }, bomId) => {
  const bom = await findBomOrThrow({ organizationId, branchId }, bomId);
  return Bom.find({ organizationId, bomNumber: bom.bomNumber }).sort({ version: -1 });
};

const setDefaultBom = async ({ organizationId, branchId }, bomId) => {
  requireBranch(branchId);
  const bom = await findBomOrThrow({ organizationId, branchId }, bomId);
  assertNotDeleted(bom);
  if (!bom.isActive) throw new ApiError(httpStatus.BAD_REQUEST, 'Activate this BOM version before making it the default');
  await syncProductDefault({ organizationId, branchId: bom.branchId, productId: bom.productId, bomId: bom._id });
  return Bom.findById(bom._id);
};

const setBomActive = async ({ organizationId, branchId }, bomId, isActive) => {
  requireBranch(branchId);
  const bom = await findBomOrThrow({ organizationId, branchId }, bomId);
  assertNotDeleted(bom);
  bom.isActive = !!isActive;
  if (!bom.isActive && bom.isDefault) {
    bom.isDefault = false;
    await Product.updateOne(
      { _id: bom.productId, organizationId, branchId: bom.branchId, defaultBomId: bom._id },
      { $set: { defaultBomId: null } }
    );
  }
  await bom.save();
  return bom;
};

const orderRef = (o) => ({ id: String(o._id), orderNumber: o.orderNumber, status: o.status });
const bomRef = (b) => ({ id: String(b._id), bomNumber: b.bomNumber, version: b.version, productName: b.productName });

/**
 * What deleting a BOM version would do, shown before the user confirms:
 *  delete  — never used: removed for good
 *  archive — production used it: kept for the orders and reports that reference it, but
 *            inactive and hidden from lists and pickers (restorable from the Deleted view)
 *  blocked — something still depends on it (draft/planned orders that re-read the recipe,
 *            or BOMs that pin it as a sub-assembly)
 * Deleting the default version hands the default to the newest other active version.
 */
const getDeleteImpact = async ({ organizationId, branchId }, bomId) => {
  const bom = await findBomOrThrow({ organizationId, branchId }, bomId);
  const [orders, parentBoms, nextDefault, componentOf] = await Promise.all([
    ProductionOrder.find({ organizationId, bomId: bom._id }).select('orderNumber status').sort({ createdAt: -1 }).lean(),
    Bom.find({ organizationId, 'components.childBomId': bom._id, deletedAt: null })
      .select('bomNumber version productName')
      .sort({ bomNumber: 1, version: -1 })
      .lean(),
    bom.isDefault
      ? Bom.findOne({
          organizationId,
          branchId: bom.branchId,
          productId: bom.productId,
          _id: { $ne: bom._id },
          isActive: true,
          deletedAt: null,
        })
          .select('bomNumber version productName')
          .sort({ version: -1, createdAt: -1 })
          .lean()
      : null,
    bom.isDefault
      ? Bom.countDocuments({
          organizationId,
          branchId: bom.branchId,
          'components.productId': bom.productId,
          deletedAt: null,
        })
      : 0,
  ]);

  const draftOrders = orders.filter((o) => EDITABLE_PRODUCTION_STATUSES.includes(o.status));
  const blockers = [];
  if (draftOrders.length) {
    const numbers = draftOrders
      .slice(0, 3)
      .map((o) => o.orderNumber)
      .join(', ');
    blockers.push(
      `${draftOrders.length} draft/planned production order${draftOrders.length === 1 ? '' : 's'} (${numbers}${
        draftOrders.length > 3 ? ', …' : ''
      }) still take${draftOrders.length === 1 ? 's' : ''} materials from this BOM — cancel ${
        draftOrders.length === 1 ? 'it' : 'them'
      } or switch to another BOM first`
    );
  }
  if (parentBoms.length) {
    const names = parentBoms
      .slice(0, 3)
      .map((b) => `${b.bomNumber} v${b.version}`)
      .join(', ');
    blockers.push(
      `${names}${parentBoms.length > 3 ? ', …' : ''} use${
        parentBoms.length === 1 ? 's' : ''
      } this version as a sub-assembly — remove it from ${parentBoms.length === 1 ? 'that BOM' : 'those BOMs'} first`
    );
  }

  let mode = 'delete';
  if (bom.deletedAt) mode = 'deleted';
  else if (blockers.length) mode = 'blocked';
  else if (orders.length || bom.isLocked) mode = 'archive';

  return {
    bom: { ...bomRef(bom), isDefault: bom.isDefault, isLocked: bom.isLocked },
    mode,
    blockers,
    orders: {
      total: orders.length,
      open: orders.filter((o) => OPEN_PRODUCTION_STATUSES.includes(o.status)).length,
      recent: orders.slice(0, 5).map(orderRef),
      draft: draftOrders.slice(0, 10).map(orderRef),
    },
    parentBoms: parentBoms.slice(0, 10).map(bomRef),
    nextDefault: nextDefault ? bomRef(nextDefault) : null,
    // Other BOMs that consume this product and explode it through its default BOM.
    componentOf,
  };
};

const deleteBom = async ({ organizationId, branchId, createdBy }, bomId) => {
  requireBranch(branchId);
  const impact = await getDeleteImpact({ organizationId, branchId }, bomId);
  if (impact.mode === 'deleted') throw new ApiError(httpStatus.BAD_REQUEST, 'This BOM version is already deleted');
  if (impact.mode === 'blocked') throw new ApiError(httpStatus.CONFLICT, impact.blockers[0]);

  const bom = await findBomOrThrow({ organizationId, branchId }, bomId);
  const wasDefault = bom.isDefault;
  if (impact.mode === 'archive') {
    bom.isActive = false;
    bom.isDefault = false;
    bom.deletedAt = new Date();
    bom.deletedBy = createdBy || null;
    bom.updatedBy = createdBy || bom.updatedBy;
    await bom.save();
  } else {
    await bom.deleteOne();
  }
  if (wasDefault) {
    const next = impact.nextDefault ? impact.nextDefault.id : null;
    await syncProductDefault({ organizationId, branchId: bom.branchId, productId: bom.productId, bomId: next });
  }
  return { mode: impact.mode, bom: impact.bom, nextDefault: impact.nextDefault };
};

/** Brings back a deleted (archived) version — inactive, so it is reviewed before use. */
const restoreBom = async ({ organizationId, branchId, createdBy }, bomId) => {
  requireBranch(branchId);
  const bom = await findBomOrThrow({ organizationId, branchId }, bomId);
  if (!bom.deletedAt) throw new ApiError(httpStatus.BAD_REQUEST, 'This BOM version is not deleted');
  bom.deletedAt = null;
  bom.deletedBy = null;
  bom.updatedBy = createdBy || bom.updatedBy;
  await bom.save();
  return bom;
};

/**
 * Explodes a BOM for `quantity` units of output.
 *
 * Returns `{ tree, lines }`:
 *  - tree:  the nested multi-level structure (always fully expanded — for display)
 *  - lines: the flat material list a production order consumes. With `explode` off,
 *           sub-assemblies are leaf lines (issued from stock as-is); with it on, they're
 *           replaced by their own exploded components. Same product/variant lines merge.
 *
 * Per-line required = component qty × (output qty ÷ BOM qty) × (1 + scrap%).
 */
const explodeBom = async ({ organizationId, branchId }, bomId, quantity, { explode = false } = {}) => {
  const resolver = createBomResolver({ organizationId, branchId });
  const root = await resolver.getBom(bomId);
  if (!root) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');

  const merged = new Map();
  const addLine = (line) => {
    const key = `${line.productId}:${line.variantId || ''}:${line.isOptional ? 1 : 0}`;
    const existing = merged.get(key);
    if (existing) {
      existing.baseQuantity = roundQty(existing.baseQuantity + line.baseQuantity);
      existing.requiredQuantity = roundQty(existing.requiredQuantity + line.requiredQuantity);
      existing.level = Math.min(existing.level, line.level);
    } else {
      merged.set(key, { ...line });
    }
  };

  // `collect`: whether this level's leaf lines feed the material list. The tree is always
  // fully expanded for display; nested levels only contribute lines when exploding.
  const expand = async (bom, outputQty, level, path, collect) => {
    if (level > MAX_BOM_DEPTH)
      throw new ApiError(httpStatus.BAD_REQUEST, `BOM structure is deeper than ${MAX_BOM_DEPTH} levels`);
    const factor = outputQty / (bom.quantity || 1);
    const nodes = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const component of bom.components || []) {
      const baseQuantity = roundQty(component.quantity * factor);
      const requiredQuantity = roundQty(baseQuantity * (1 + (component.scrapPercent || 0) / 100));
      if (path.includes(String(component.productId))) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Circular BOM detected at "${component.productName}"`);
      }
      // eslint-disable-next-line no-await-in-loop
      const child = await resolver.childBomFor(component);
      // eslint-disable-next-line no-await-in-loop
      const children = child
        ? await expand(child, requiredQuantity, level + 1, [...path, String(component.productId)], collect && explode)
        : [];

      const line = {
        productId: component.productId,
        variantId: component.variantId || null,
        productName: component.productName,
        sku: component.sku,
        unit: component.unit,
        baseQuantity,
        requiredQuantity,
        isOptional: !!component.isOptional,
        level,
        sourceBomId: bom._id,
        alternatives: component.alternatives || [],
      };
      if (collect && !(explode && child)) addLine(line);

      nodes.push({
        ...line,
        componentId: component._id,
        scrapPercent: component.scrapPercent || 0,
        childBom: child ? { id: String(child._id), bomNumber: child.bomNumber, version: child.version } : null,
        children,
      });
    }
    return nodes;
  };

  const children = await expand(root, quantity, 1, [String(root.productId)], true);
  return {
    tree: {
      bomId: String(root._id),
      bomNumber: root.bomNumber,
      version: root.version,
      productId: String(root.productId),
      productName: root.productName,
      quantity: roundQty(quantity),
      unit: root.unit,
      children,
    },
    lines: [...merged.values()],
  };
};

/** BOMs (active or not) that consume the given product as a component. */
const whereUsed = async ({ organizationId, branchId }, productId) =>
  Bom.find({ ...scopeFilter({ organizationId, branchId }), 'components.productId': productId, deletedAt: null })
    .select(
      'bomNumber version name productId productName isActive isDefault components.productId components.quantity components.unit'
    )
    .sort({ bomNumber: 1, version: -1 })
    .lean()
    .then((boms) =>
      boms.map((bom) => {
        const line = bom.components.find((c) => idOf(c.productId) === String(productId));
        return {
          id: String(bom._id),
          bomNumber: bom.bomNumber,
          version: bom.version,
          name: bom.name,
          productId: String(bom.productId),
          productName: bom.productName,
          isActive: bom.isActive,
          isDefault: bom.isDefault,
          quantity: line ? line.quantity : 0,
          unit: line ? line.unit : undefined,
        };
      })
    );

module.exports = {
  createBom,
  queryBoms,
  getBom,
  updateBom,
  createNewVersion,
  listVersions,
  setDefaultBom,
  setBomActive,
  getDeleteImpact,
  deleteBom,
  restoreBom,
  explodeBom,
  whereUsed,
  findBomOrThrow,
  normalizeOperations,
};
