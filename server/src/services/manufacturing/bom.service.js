const httpStatus = require('http-status');
const { Bom, Product, ProductVariant, ProductionOrder } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { MAX_BOM_DEPTH } = require('../../config/manufacturing');
const settingsService = require('./settings.service');
const { roundQty, requireBranch, scopeFilter, escapeRegex, idOf } = require('./common');

const findBomOrThrow = async ({ organizationId, branchId }, bomId) => {
  const bom = await Bom.findOne({ _id: bomId, ...scopeFilter({ organizationId, branchId }) });
  if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found');
  return bom;
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
    notes: body.notes || '',
    isActive: body.isActive !== false,
    isDefault: false,
    effectiveFrom: body.effectiveFrom || null,
    effectiveTo: body.effectiveTo || null,
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
    notes: body.notes ?? source.notes,
    isActive: true,
    isDefault: false,
    isLocked: false,
    effectiveFrom: body.effectiveFrom ?? null,
    effectiveTo: body.effectiveTo ?? null,
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
  if (!bom.isActive) throw new ApiError(httpStatus.BAD_REQUEST, 'Activate this BOM version before making it the default');
  await syncProductDefault({ organizationId, branchId: bom.branchId, productId: bom.productId, bomId: bom._id });
  return Bom.findById(bom._id);
};

const setBomActive = async ({ organizationId, branchId }, bomId, isActive) => {
  requireBranch(branchId);
  const bom = await findBomOrThrow({ organizationId, branchId }, bomId);
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

const deleteBom = async ({ organizationId, branchId }, bomId) => {
  requireBranch(branchId);
  const bom = await findBomOrThrow({ organizationId, branchId }, bomId);
  if (bom.isLocked)
    throw new ApiError(httpStatus.CONFLICT, 'This BOM version has been used in production — deactivate it instead');
  const [usedByOrder, usedAsChild] = await Promise.all([
    ProductionOrder.exists({ organizationId, bomId: bom._id }),
    Bom.exists({ organizationId, 'components.childBomId': bom._id }),
  ]);
  if (usedByOrder) throw new ApiError(httpStatus.CONFLICT, 'A production order references this BOM — deactivate it instead');
  if (usedAsChild)
    throw new ApiError(httpStatus.CONFLICT, 'Another BOM uses this one as a sub-assembly — deactivate it instead');
  if (bom.isDefault) {
    await Product.updateOne({ _id: bom.productId, organizationId, defaultBomId: bom._id }, { $set: { defaultBomId: null } });
  }
  await bom.deleteOne();
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
  Bom.find({ ...scopeFilter({ organizationId, branchId }), 'components.productId': productId })
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
  deleteBom,
  explodeBom,
  whereUsed,
  findBomOrThrow,
};
