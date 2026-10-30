const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { UNITS } = require('../config/units');
const {
  PRODUCT_TYPES,
  PROCUREMENT_TYPES,
  PRODUCTION_STATUSES,
  PRODUCTION_PRIORITIES,
  SCRAP_STAGES,
  SCRAP_REASONS,
  REJECT_DISPOSITIONS,
  OUTPUT_STATUSES,
  OUTPUT_REVERSAL_REASONS,
  ORDER_TYPES,
  ORDER_DOCUMENT_CATEGORIES,
  MAX_OPERATIONS,
  MAX_TEAM_MEMBERS,
} = require('../config/manufacturing');

const id = () => Joi.string().custom(objectId);
const unit = () => Joi.string().valid(...Object.values(UNITS));
const pagination = {
  limit: Joi.number().integer().min(1).max(200),
  page: Joi.number().integer().min(1),
  sortBy: Joi.string(),
};
const dateRange = { dateFrom: Joi.date(), dateTo: Joi.date() };

// ── Settings ──────────────────────────────────────────────────────────────────────
const prefix = () =>
  Joi.string()
    .trim()
    .max(10)
    .pattern(/^[A-Za-z0-9]+$/)
    .message('Prefixes may only contain letters and numbers');

const updateSettings = {
  body: Joi.object()
    .keys({
      prefixes: Joi.object().keys({
        bom: prefix(),
        productionOrder: prefix(),
        assemblyOrder: prefix(),
        materialIssue: prefix(),
        materialReturn: prefix(),
        productionOutput: prefix(),
        productionReceipt: prefix(),
        scrap: prefix(),
        rawMaterialReceipt: prefix(),
        batch: prefix(),
        packing: prefix(),
        floorIssue: prefix(),
        floorReturn: prefix(),
        floorCount: prefix(),
      }),
      floorShortfall: Joi.string().valid('auto_issue', 'block'),
      batchNumbering: Joi.string().valid('sequence', 'order'),
      numberPadding: Joi.number().integer().min(3).max(10),
      defaultSourceLocation: Joi.string().allow('').trim().max(100),
      defaultWipLocation: Joi.string().allow('').trim().max(100),
      defaultFinishedGoodsLocation: Joi.string().allow('').trim().max(100),
      allowNegativeStockIssue: Joi.boolean(),
      allowOverProduction: Joi.boolean(),
      autoCompleteOrders: Joi.boolean(),
      requireQualityCheck: Joi.boolean(),
      defaultRejectDisposition: Joi.string().valid(...REJECT_DISPOSITIONS),
      requireBomForProduction: Joi.boolean(),
      explodeSubAssemblies: Joi.boolean(),
      defaultPriority: Joi.string().valid(...PRODUCTION_PRIORITIES),
    })
    .min(1),
};

// ── Products ──────────────────────────────────────────────────────────────────────
const productListFilters = {
  productType: Joi.string(),
  classifiedOnly: Joi.boolean(),
  hasBom: Joi.boolean(),
  procurementType: Joi.string().valid(...PROCUREMENT_TYPES, 'none'),
  stock: Joi.string().valid('in', 'out'),
  tracking: Joi.string().valid('batch', 'none'),
  // Packing roles: 'make' hides pack products, 'pack' = what a pack size can be stocked as,
  // 'packs' = pack products only.
  packRole: Joi.string().valid('make', 'pack', 'packs'),
  // A category / brand id, or 'none' for products without one.
  categoryId: Joi.alternatives().try(id(), Joi.string().valid('none')),
  brandId: Joi.alternatives().try(id(), Joi.string().valid('none')),
  search: Joi.string().allow(''),
};

const getProducts = {
  query: Joi.object().keys({
    ...productListFilters,
    sort: Joi.string().valid('name', 'newest', 'stock', 'stockLow', 'cost'),
    ...pagination,
    // Up to the client's "All" rows option (lib/page-size ALL_ROWS).
    limit: Joi.number().integer().min(1).max(100000),
  }),
};

const getMatchingProductIds = {
  query: Joi.object().keys({
    ...productListFilters,
    sort: Joi.string().valid('name', 'newest', 'stock', 'stockLow', 'cost'),
  }),
};

const getProductStats = { query: Joi.object().keys(productListFilters) };

const updateProductAttributes = {
  params: Joi.object().keys({ productId: id().required() }),
  body: Joi.object()
    .keys({
      productType: Joi.string()
        .valid(...PRODUCT_TYPES)
        .allow(null),
      procurementType: Joi.string()
        .valid(...PROCUREMENT_TYPES)
        .allow(null),
      manufacturingLeadTimeDays: Joi.number().min(0).max(3650).allow(null),
      shelfLifeDays: Joi.number().integer().min(0).max(36500).allow(null),
      trackBatch: Joi.boolean(),
      trackExpiry: Joi.boolean(),
      openingBatchNumber: Joi.string().trim().max(60).allow(''),
      defaultBomId: id().allow(null),
    })
    .min(1),
};

const batchUnbatchedStock = {
  params: Joi.object().keys({ productId: id().required() }),
  body: Joi.object().keys({
    variantId: id().allow(null, ''),
    batchNumber: Joi.string().trim().max(60).allow(''),
    expiryDate: Joi.date().allow(null, ''),
  }),
};

const bulkProductTracking = {
  body: Joi.object()
    .keys({
      productIds: Joi.array().items(id()).min(1).max(500).required(),
      trackBatch: Joi.boolean(),
      trackExpiry: Joi.boolean(),
    })
    .or('trackBatch', 'trackExpiry'),
};

const bulkClassifyProducts = {
  body: Joi.object().keys({
    productIds: Joi.array().items(id()).min(1).max(5000).required(),
    productType: Joi.string()
      .valid(...PRODUCT_TYPES)
      .allow(null)
      .required(),
    procurementType: Joi.string()
      .valid(...PROCUREMENT_TYPES)
      .allow(null),
  }),
};

const productIdParam = { params: Joi.object().keys({ productId: id().required() }) };

// ── BOMs ──────────────────────────────────────────────────────────────────────────
const component = Joi.object().keys({
  _id: id(),
  productId: id().required(),
  variantId: id().allow(null),
  quantity: Joi.number().positive().required(),
  unit: unit(),
  scrapPercent: Joi.number().min(0).max(100),
  isOptional: Joi.boolean(),
  childBomId: id().allow(null),
  alternatives: Joi.array()
    .items(
      Joi.object().keys({
        productId: id().required(),
        variantId: id().allow(null),
        ratio: Joi.number().positive(),
      })
    )
    .max(10),
  notes: Joi.string().allow('').max(500),
  sequence: Joi.number().integer(),
});

const routingOperation = Joi.object().keys({
  _id: id(),
  name: Joi.string().trim().min(1).max(100).required(),
  workCenter: Joi.string().allow('').trim().max(100),
  setupMinutes: Joi.number().min(0).max(100000),
  runMinutesPerUnit: Joi.number().min(0).max(100000),
  costPerHour: Joi.number().min(0).max(1e9),
  instructions: Joi.string().allow('').max(2000),
  sequence: Joi.number().integer(),
});

const bomBody = {
  name: Joi.string().allow('').trim().max(200),
  quantity: Joi.number().positive(),
  unit: unit(),
  components: Joi.array().items(component).min(1).max(500),
  operations: Joi.array().items(routingOperation).max(MAX_OPERATIONS),
  notes: Joi.string().allow('').max(2000),
  isActive: Joi.boolean(),
  isDefault: Joi.boolean(),
  effectiveFrom: Joi.date().allow(null),
  effectiveTo: Joi.date()
    .allow(null)
    .when('effectiveFrom', {
      is: Joi.date().required(),
      then: Joi.date().min(Joi.ref('effectiveFrom')),
    }),
};

const createBom = {
  body: Joi.object().keys({
    productId: id().required(),
    variantId: id().allow(null),
    ...bomBody,
    components: bomBody.components.required(),
  }),
};

const getBoms = {
  query: Joi.object().keys({
    productId: id(),
    bomNumber: Joi.string(),
    isActive: Joi.boolean(),
    isDefault: Joi.boolean(),
    deleted: Joi.boolean(),
    search: Joi.string().allow(''),
    ...pagination,
  }),
};

const bomIdParam = { params: Joi.object().keys({ bomId: id().required() }) };

const updateBom = { ...bomIdParam, body: Joi.object().keys(bomBody).min(1) };

const createBomVersion = { ...bomIdParam, body: Joi.object().keys(bomBody) };

const setBomActive = { ...bomIdParam, body: Joi.object().keys({ isActive: Joi.boolean().required() }) };

const explodeBom = {
  ...bomIdParam,
  query: Joi.object().keys({ quantity: Joi.number().positive(), explode: Joi.boolean() }),
};

// ── Production orders ─────────────────────────────────────────────────────────────
const orderBody = {
  variantId: id().allow(null),
  bomId: id().allow(null),
  plannedQuantity: Joi.number().positive(),
  plannedStartDate: Joi.date().allow(null),
  plannedCompletionDate: Joi.date()
    .allow(null)
    .when('plannedStartDate', {
      is: Joi.date().required(),
      then: Joi.date().min(Joi.ref('plannedStartDate')).messages({
        'date.min': 'Planned completion date cannot be before the planned start date',
      }),
    }),
  sourceLocation: Joi.string().allow('').trim().max(100),
  wipLocation: Joi.string().allow('').trim().max(100),
  finishedGoodsLocation: Joi.string().allow('').trim().max(100),
  priority: Joi.string().valid(...PRODUCTION_PRIORITIES),
  notes: Joi.string().allow('').max(2000),
  operatorId: id().allow(null, ''),
  teamMemberIds: Joi.array().items(id()).max(MAX_TEAM_MEMBERS),
  // Finished-goods batch number; blank = auto-numbered (create only).
  batchNumber: Joi.string().trim().max(60).allow(''),
};

const createProductionOrder = {
  body: Joi.object().keys({
    productId: id().required(),
    ...orderBody,
    orderType: Joi.string().valid(...ORDER_TYPES),
    parentOrderId: id().allow(null),
    parentMaterialLineId: id().allow(null),
    plannedQuantity: orderBody.plannedQuantity.required(),
    status: Joi.string().valid('draft', 'planned'),
  }),
};

/** Several production orders at once: header defaults + one row per product. */
const productionOrderBatch = {
  body: Joi.object().keys({
    header: Joi.object()
      .keys({
        plannedStartDate: Joi.date().allow(null, ''),
        plannedCompletionDate: Joi.date().allow(null, ''),
        priority: Joi.string()
          .valid(...PRODUCTION_PRIORITIES)
          .allow(''),
        operatorId: id().allow(null, ''),
        teamMemberIds: Joi.array().items(id()).max(MAX_TEAM_MEMBERS),
        sourceLocation: Joi.string().allow('').trim().max(100),
        wipLocation: Joi.string().allow('').trim().max(100),
        finishedGoodsLocation: Joi.string().allow('').trim().max(100),
        notes: Joi.string().allow('').max(2000),
        status: Joi.string().valid('draft', 'planned'),
      })
      .default({}),
    lines: Joi.array()
      .items(
        Joi.object().keys({
          // Row problems (missing product, quantity…) are reported per row by the service.
          productId: id().allow(null, ''),
          variantId: id().allow(null, ''),
          bomId: id().allow(null, ''),
          plannedQuantity: Joi.number().allow(null),
          batchNumber: Joi.string().trim().max(60).allow('', null),
          priority: Joi.string()
            .valid(...PRODUCTION_PRIORITIES)
            .allow('', null),
          plannedStartDate: Joi.date().allow(null, ''),
          plannedCompletionDate: Joi.date().allow(null, ''),
          notes: Joi.string().allow('').max(500),
        })
      )
      .min(1)
      .max(100)
      .required(),
  }),
};

const getAnalytics = {
  query: Joi.object().keys({
    range: Joi.string().valid('7d', '30d', '90d', 'mtd'),
  }),
};

const csv = () => Joi.string().allow('');
const calendarDay = () => Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
/** Everything the Production Orders toolbar can send; shared by list, summary and export. */
const orderListFilters = {
  search: Joi.string().allow(''),
  orderNumber: Joi.string().allow(''),
  product: Joi.string().allow(''),
  status: csv(),
  priority: csv(),
  orderType: Joi.string().valid(...ORDER_TYPES),
  parentOrderId: csv(),
  productId: csv(),
  operatorId: csv(),
  createdBy: csv(),
  bomId: csv(),
  branchId: csv(),
  warehouse: csv(),
  workCenter: csv(),
  productType: csv(),
  productionFrom: calendarDay(),
  productionTo: calendarDay(),
  dueFrom: calendarDay(),
  dueTo: calendarDay(),
  completedFrom: calendarDay(),
  completedTo: calendarDay(),
  createdFrom: calendarDay(),
  createdTo: calendarDay(),
  quantityMin: Joi.number().min(0),
  quantityMax: Joi.number().min(0),
  completionMin: Joi.number().min(0).max(100),
  completionMax: Joi.number().min(0).max(100),
  delayed: Joi.boolean(),
  overdue: Joi.boolean(),
  hasShortage: Joi.boolean(),
  hasQcIssue: Joi.boolean(),
  hasScrap: Joi.boolean(),
  hasRework: Joi.boolean(),
  ...dateRange,
};
const orderListSort = {
  sort: Joi.string().valid('newest', 'oldest', 'due', 'quantity', 'priority', 'status', 'completion', 'cost'),
  dir: Joi.string().valid('asc', 'desc'),
};

const getOrderStatusCounts = {
  query: Joi.object().keys({ ...orderListFilters }),
};

const getProductionOrders = {
  query: Joi.object().keys({ ...orderListFilters, ...orderListSort, ...pagination }),
};

const exportProductionOrders = {
  query: Joi.object().keys({ ...orderListFilters, ...orderListSort }),
};

const bulkUpdateProductionOrders = {
  body: Joi.object()
    .keys({
      orderIds: Joi.array().items(id().required()).min(1).max(200).required(),
      priority: Joi.string().valid(...PRODUCTION_PRIORITIES),
      operatorId: id().allow(null),
      plannedStartDate: Joi.date().allow(null),
      plannedCompletionDate: Joi.date().allow(null),
      status: Joi.string().valid('planned', 'released', 'paused', 'cancelled'),
      note: Joi.string().allow('').max(500),
    })
    .or('priority', 'operatorId', 'plannedStartDate', 'plannedCompletionDate', 'status'),
};

const orderIdParam = { params: Joi.object().keys({ orderId: id().required() }) };

const updateProductionOrder = {
  ...orderIdParam,
  body: Joi.object()
    .keys({ productId: id(), ...orderBody })
    .min(1),
};

const changeProductionStatus = {
  ...orderIdParam,
  body: Joi.object().keys({
    status: Joi.string()
      .valid(...PRODUCTION_STATUSES)
      .required(),
    note: Joi.string().allow('').max(500),
    // Required when completing an order that still has material in WIP.
    wipDisposition: Joi.string().valid('return', 'scrap'),
  }),
};

// ── Order operations (routing steps), documents ──────────────────────────────────
const operationIdParam = {
  params: Joi.object().keys({ orderId: id().required(), operationId: id().required() }),
};
const operationFields = {
  name: Joi.string().trim().min(1).max(100),
  workCenter: Joi.string().allow('').trim().max(100),
  plannedMinutes: Joi.number().min(0).max(1e6),
  costPerHour: Joi.number().min(0).max(1e9),
  instructions: Joi.string().allow('').max(2000),
};

const addOrderOperation = {
  ...orderIdParam,
  body: Joi.object().keys({
    ...operationFields,
    name: operationFields.name.required(),
    // Insert after this step; omitted = at the end.
    afterOperationId: id().allow(null),
  }),
};

const updateOrderOperation = { ...operationIdParam, body: Joi.object().keys(operationFields).min(1) };

const reorderOrderOperations = {
  ...orderIdParam,
  body: Joi.object().keys({ operationIds: Joi.array().items(id()).min(1).max(MAX_OPERATIONS).required() }),
};

const orderOperationAction = {
  ...operationIdParam,
  body: Joi.object().keys({
    action: Joi.string().valid('start', 'complete', 'reopen', 'skip').required(),
    // When it actually happened (back-filling floor records); never in the future.
    at: Joi.date()
      .max(Joi.ref('$now', { adjust: () => new Date(Date.now() + 5 * 60 * 1000) }))
      .allow(null)
      .messages({ 'date.max': 'The time cannot be in the future' }),
    actualMinutes: Joi.number().min(0).max(1e6).allow(null),
    note: Joi.string().allow('').max(500),
  }),
};

const documentIdParam = {
  params: Joi.object().keys({ orderId: id().required(), documentId: id().required() }),
};

const addOrderDocumentLink = {
  ...orderIdParam,
  body: Joi.object().keys({
    title: Joi.string().trim().min(1).max(150).required(),
    url: Joi.string()
      .trim()
      .uri({ scheme: ['http', 'https'] })
      .max(2000)
      .required(),
    category: Joi.string().valid(...ORDER_DOCUMENT_CATEGORIES),
  }),
};

// multer fills req.body for the multipart upload; the file itself is checked in the service.
const uploadOrderDocument = {
  ...orderIdParam,
  body: Joi.object().keys({
    title: Joi.string().allow('').trim().max(150),
    category: Joi.string().valid(...ORDER_DOCUMENT_CATEGORIES),
  }),
};

// ── Raw material receipt (RMV) ─────────────────────────────────────────────────────
const receiptLine = Joi.object().keys({
  productId: id().required(),
  variantId: id().allow(null, ''),
  quantity: Joi.number().min(0).allow(null),
  unit: Joi.string().allow('').max(20),
  rate: Joi.number().min(0).allow(null),
  discountPercent: Joi.number().min(0).max(100).allow(null),
  taxPercent: Joi.number().min(0).max(100).allow(null),
  batchNumber: Joi.string().allow('').trim().max(60),
  expiryDate: Joi.date().allow(null, ''),
  serials: Joi.array().items(Joi.string().trim().max(60)).max(1000),
  location: Joi.string().allow('').trim().max(100),
  notes: Joi.string().allow('').trim().max(300),
});
const receiptBody = {
  date: Joi.date(),
  supplierId: id().allow(null, ''),
  purchaseOrderId: id().allow(null, ''),
  location: Joi.string().allow('').trim().max(100),
  reference: Joi.string().allow('').trim().max(100),
  notes: Joi.string().allow('').max(2000),
  lines: Joi.array().items(receiptLine).max(1000),
  // true = save and post to stock in the same call ("Save"); false/absent = draft.
  confirm: Joi.boolean(),
};
const receiptIdParam = { params: Joi.object().keys({ receiptId: id().required() }) };
const createMaterialReceipt = { body: Joi.object().keys(receiptBody) };
const updateMaterialReceipt = { ...receiptIdParam, body: Joi.object().keys(receiptBody).min(1) };
const getMaterialReceipts = {
  query: Joi.object().keys({
    status: Joi.string(),
    supplierId: id(),
    search: Joi.string().allow(''),
    ...dateRange,
    ...pagination,
  }),
};

const getRequirements = {
  query: Joi.object().keys({ statuses: Joi.string() }),
};

// ── Execution ─────────────────────────────────────────────────────────────────────
const lineBatchSplit = () =>
  Joi.array()
    .items(Joi.object().keys({ batchId: id().required(), quantity: Joi.number().min(0).required() }))
    .max(100)
    .allow(null);
const serialList = () => Joi.array().items(Joi.string().trim()).max(5000);

const finishedGoods = Joi.object().keys({
  batchNumber: Joi.string().trim().max(60).allow(''),
  manufactureDate: Joi.date().allow(null),
  expiryDate: Joi.date().allow(null),
  serialNumbers: serialList(),
  location: Joi.string().allow('').trim().max(100),
});

const issueMaterials = {
  ...orderIdParam,
  body: Joi.object().keys({
    lines: Joi.array()
      .items(
        Joi.object().keys({
          materialLineId: id().required(),
          // Serial-tracked lines may give only imeiIds/serialNumbers (quantity = count).
          quantity: Joi.number().min(0),
          alternativeProductId: id().allow(null),
          // Serial items: take the oldest in-stock units for `quantity` instead of naming them.
          autoPickSerials: Joi.boolean(),
          batches: Joi.array()
            .items(Joi.object().keys({ batchId: id().required(), quantity: Joi.number().positive().required() }))
            .max(100),
          imeiIds: Joi.array().items(id()).max(5000),
          serialNumbers: serialList(),
        })
      )
      .min(1)
      .max(500)
      .required(),
    // Explicit confirmation for issuing beyond the remaining requirement (also needs the
    // overIssueMaterials permission).
    allowOverIssue: Joi.boolean(),
    issueDate: Joi.date(),
    notes: Joi.string().allow('').max(1000),
  }),
};

/** MIV — Material Issue Voucher (check and post share the body). */
const materialIssueVoucher = {
  body: Joi.object()
    .keys({
      // Either an existing order, or a finished good to create one for (posting creates and
      // releases it in the same transaction as the issue).
      productionOrderId: id(),
      newOrder: Joi.object().keys({
        productId: id().required(),
        variantId: id().allow(null, ''),
        bomId: id().allow(null, ''),
        plannedQuantity: Joi.number().positive().required(),
        plannedCompletionDate: Joi.date().allow(null, ''),
        priority: Joi.string().valid('low', 'normal', 'high', 'urgent'),
        notes: Joi.string().allow('').max(1000),
      }),
      date: Joi.date().allow(null, ''),
      sourceLocation: Joi.string().allow('').max(120),
      wipLocation: Joi.string().allow('').max(120),
      requestedById: id().allow(null, ''),
      issuedById: id().allow(null, ''),
      reference: Joi.string().allow('').max(200),
      notes: Joi.string().allow('').max(1000),
      overrides: Joi.array().items(Joi.string().valid('exceeds_remaining', 'expired_batch', 'insufficient_stock')).max(3),
      lines: Joi.array()
        .items(
          Joi.object().keys({
            // An order's material line, or `new:<index>` of a finished-good plan.
            materialLineId: Joi.alternatives()
              .try(id(), Joi.string().pattern(/^new:\d{1,4}$/))
              .required(),
            // The material's product, so a plan line can be checked against the BOM.
            productId: id().allow(null, ''),
            alternativeProductId: id().allow(null, ''),
            // Range problems are reported per row by the service, not as a request error.
            quantity: Joi.number().allow(null),
            batchId: id().allow(null, ''),
            // Several batches for one line (one batch short): their quantities add up to the line's.
            batches: lineBatchSplit(),
            serialNumbers: serialList(),
          })
        )
        .min(1)
        .max(500)
        .required(),
    })
    .xor('productionOrderId', 'newOrder'),
};

/** Edit a posted voucher: the voucher body without its order, plus the revision it came from. */
const editMaterialIssue = {
  params: Joi.object().keys({ issueId: id().required() }),
  body: Joi.object().keys({
    revision: Joi.number().integer().min(0).required(),
    editNote: Joi.string().allow('').max(500),
    date: Joi.date().allow(null, ''),
    sourceLocation: Joi.string().allow('').max(120),
    wipLocation: Joi.string().allow('').max(120),
    requestedById: id().allow(null, ''),
    issuedById: id().allow(null, ''),
    reference: Joi.string().allow('').max(200),
    notes: Joi.string().allow('').max(1000),
    overrides: Joi.array().items(Joi.string().valid('exceeds_remaining', 'expired_batch', 'insufficient_stock')).max(3),
    lines: Joi.array()
      .items(
        Joi.object().keys({
          materialLineId: id().required(),
          productId: id().allow(null, ''),
          alternativeProductId: id().allow(null, ''),
          quantity: Joi.number().allow(null),
          batchId: id().allow(null, ''),
          batches: lineBatchSplit(),
          serialNumbers: serialList(),
        })
      )
      .min(1)
      .max(500)
      .required(),
  }),
};

const cancelMaterialIssue = {
  params: Joi.object().keys({ issueId: id().required() }),
  body: Joi.object().keys({
    reason: Joi.string().trim().min(3).max(500).required(),
    revision: Joi.number().integer().min(0),
    cancelOrder: Joi.boolean(),
  }),
};

const materialIssuePlan = {
  query: Joi.object().keys({
    productId: id().required(),
    variantId: id().allow(null, ''),
    bomId: id().allow(null, ''),
    quantity: Joi.number().positive().required(),
  }),
};

const pendingMaterials = {
  query: Joi.object().keys({
    productType: Joi.string().allow('').max(200),
    productId: id(),
  }),
};

/** Issue by material: each line goes to the orders that need it (or the one named). */
const materialIssueByMaterial = {
  body: Joi.object().keys({
    date: Joi.date().allow(null, ''),
    sourceLocation: Joi.string().allow('').max(120),
    wipLocation: Joi.string().allow('').max(120),
    requestedById: id().allow(null, ''),
    issuedById: id().allow(null, ''),
    reference: Joi.string().allow('').max(200),
    notes: Joi.string().allow('').max(1000),
    overrides: Joi.array().items(Joi.string().valid('exceeds_remaining', 'expired_batch', 'insufficient_stock')).max(3),
    lines: Joi.array()
      .items(
        Joi.object().keys({
          productId: id().required(),
          variantId: id().allow(null, ''),
          quantity: Joi.number().allow(null),
          orderId: id().allow(null, ''),
        })
      )
      .min(1)
      .max(500)
      .required(),
  }),
};

const report = {
  params: Joi.object().keys({
    report: Joi.string()
      .valid(
        'production',
        'material-issues',
        'material-consumption',
        'finished-goods',
        'raw-materials',
        'stock-register',
        'in-process',
        'scrap',
        'daily',
        'batch',
        'batch-stock',
        'batch-trace',
        'product-production',
        'product-summary'
      )
      .required(),
  }),
  query: Joi.object().keys({
    startDate: calendarDay(),
    endDate: calendarDay(),
    status: Joi.string().valid('all', 'open', 'completed'),
    productId: id(),
    productionOrderId: id(),
    search: Joi.string().allow(''),
    hideIdle: Joi.boolean(),
    // Batch reports
    batchId: id(),
    kind: Joi.string().valid('all', 'finished', 'materials'),
    expiry: Joi.string().valid('all', 'expired', '30', '60', '90'),
    stock: Joi.string().valid('in', 'all'),
    // Product-wise production register: up to 12 comma-separated product ids, and typed
    // kg per pack ("productId[:variantId]=kg,…") — both parsed strictly by the service.
    productIds: Joi.string().max(400),
    packWeights: Joi.string().max(2000).allow(''),
  }),
};

const searchBatches = { query: Joi.object().keys({ search: Joi.string().allow('').max(100) }) };

const materialUsage = {
  query: Joi.object().keys({
    status: Joi.string().valid('all', 'open', 'completed'),
    productionOrderId: id(),
    search: Joi.string().allow(''),
    ...dateRange,
  }),
};

const returnMaterials = {
  ...orderIdParam,
  body: Joi.object().keys({
    lines: Joi.array()
      .items(
        Joi.object().keys({
          wipLotId: id().required(),
          quantity: Joi.number().min(0),
          imeiIds: Joi.array().items(id()).max(5000),
        })
      )
      .min(1)
      .max(500)
      .required(),
    notes: Joi.string().allow('').max(1000),
  }),
};

const rejectFields = {
  rejectedQuantity: Joi.number().min(0),
  rejectDisposition: Joi.string().valid(...REJECT_DISPOSITIONS),
  rejectReason: Joi.string().allow('').max(500),
  finishedGoods,
};

/* ── Packing (bulk → cartons / bags) ── */
const packingLines = () =>
  Joi.array()
    .max(30)
    .items(Joi.object().keys({ packSizeId: id().required(), quantity: Joi.number().min(0).required() }));
const packingProductParam = { params: Joi.object().keys({ productId: id().required() }) };
const packingVoucherParam = { params: Joi.object().keys({ voucherId: id().required() }) };
const packingSetupQuery = { ...packingProductParam, query: Joi.object().keys({ variantId: id().allow(null, '') }) };
const savePackSizes = {
  ...packingProductParam,
  body: Joi.object().keys({
    sizes: Joi.array()
      .max(30)
      .items(
        Joi.object().keys({
          id: id().allow(null, ''),
          name: Joi.string().trim().max(80).required(),
          packProductId: id().required(),
          contentQuantity: Joi.number().positive().required(),
          innerCount: Joi.number().integer().min(1).max(100000),
          innerName: Joi.string().allow('').trim().max(60),
          isActive: Joi.boolean(),
          materials: Joi.array()
            .max(20)
            .items(Joi.object().keys({ productId: id().required(), quantity: Joi.number().positive().required() })),
        })
      )
      .required(),
  }),
};
const createPackProduct = {
  ...packingProductParam,
  body: Joi.object().keys({
    name: Joi.string().trim().max(150).required(),
    sku: Joi.string().allow('').trim().max(60),
    unit: unit(),
    price: Joi.number().min(0),
  }),
};
const listPacking = {
  query: Joi.object().keys({
    productId: id(),
    productionOrderId: id(),
    status: Joi.string().valid('all', 'posted', 'cancelled'),
    search: Joi.string().allow('').max(100),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};
const postPacking = {
  body: Joi.object().keys({
    productId: id().required(),
    lines: packingLines().min(1).required(),
    batchId: id().allow(null, ''),
    productionOrderId: id().allow(null, ''),
    packingDate: Joi.alternatives().try(calendarDay(), Joi.date().iso()),
    notes: Joi.string().allow('').max(1000),
  }),
};
const cancelPacking = {
  ...packingVoucherParam,
  body: Joi.object().keys({ reason: Joi.string().trim().min(2).max(500).required() }),
};

/* ── Production stock (material issued to the floor in bulk) ── */
const floorPeriod = { dateFrom: calendarDay(), dateTo: calendarDay() };
const floorOverview = { query: Joi.object().keys(floorPeriod) };
const floorMaterial = { params: Joi.object().keys({ productId: id().required() }), query: Joi.object().keys(floorPeriod) };
const floorUsageTemplate = { params: Joi.object().keys({ productId: id().required() }) };
const floorMaterialChoices = { query: Joi.object().keys({ search: Joi.string().allow('').max(100) }) };
const floorIssueMethod = {
  body: Joi.object().keys({
    productIds: Joi.array().items(id()).min(1).max(5000).required(),
    issueMethod: Joi.string().valid('floor', 'order').required(),
  }),
};
const floorVoucherHeader = {
  voucherDate: Joi.alternatives().try(calendarDay(), Joi.date().iso()),
  notes: Joi.string().allow('').max(1000),
};
const floorMove = {
  body: Joi.object().keys({
    ...floorVoucherHeader,
    lines: Joi.array()
      .min(1)
      .max(200)
      .items(Joi.object().keys({ productId: id().required(), quantity: Joi.number().min(0).required() }))
      .required(),
  }),
};
const floorCount = {
  body: Joi.object().keys({
    ...floorVoucherHeader,
    reason: Joi.string().allow('').trim().max(200),
    lines: Joi.array()
      .min(1)
      .max(200)
      .items(Joi.object().keys({ productId: id().required(), countedQuantity: Joi.number().min(0).required() }))
      .required(),
  }),
};
const listFloorVouchers = {
  query: Joi.object().keys({
    ...floorPeriod,
    kind: Joi.string().valid('all', 'issue', 'return', 'count'),
    status: Joi.string().valid('all', 'posted', 'cancelled'),
    productId: id(),
    search: Joi.string().allow('').max(100),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};
const floorVoucherParam = { params: Joi.object().keys({ voucherId: id().required() }) };
const cancelFloorVoucher = {
  ...floorVoucherParam,
  body: Joi.object().keys({ reason: Joi.string().trim().min(2).max(500).required() }),
};

const reportOutput = {
  ...orderIdParam,
  body: Joi.object().keys({
    // The variant made, for an order on a product with variants that never named it.
    variantId: id().allow(null, ''),
    // Pack the good output straight away (packing.service#packReceipt).
    packing: Joi.object().keys({ lines: packingLines().required(), notes: Joi.string().allow('').max(1000) }),
    producedQuantity: Joi.number().positive().required(),
    // Packing material actually used, beyond the recipe — taken from production stock.
    floorUsage: Joi.array()
      .max(50)
      .items(Joi.object().keys({ productId: id().required(), quantity: Joi.number().min(0).required() })),
    // 'hold' → QC; 'direct' → finished stock now. Default: the require-QC setting.
    qcMode: Joi.string().valid('direct', 'hold'),
    // Only used when inspecting now (direct, or quality checks turned off).
    goodQuantity: Joi.number().min(0),
    ...rejectFields,
    notes: Joi.string().allow('').max(1000),
  }),
};

const inspectOutput = {
  params: Joi.object().keys({ outputId: id().required() }),
  body: Joi.object().keys({
    goodQuantity: Joi.number().min(0).required(),
    ...rejectFields,
    inspectionNotes: Joi.string().allow('').max(1000),
  }),
};

const reverseOutput = {
  params: Joi.object().keys({ outputId: id().required() }),
  body: Joi.object().keys({
    reason: Joi.string()
      .valid(...OUTPUT_REVERSAL_REASONS)
      .required(),
    notes: Joi.string().allow('').max(1000),
    // A packed receipt: cancel its packing in the same step.
    cancelPacking: Joi.boolean(),
  }),
};

const resolveRework = {
  ...orderIdParam,
  body: Joi.object().keys({
    goodQuantity: Joi.number().min(0),
    scrapQuantity: Joi.number().min(0),
    finishedGoods,
    notes: Joi.string().allow('').max(1000),
  }),
};

const recordScrap = {
  body: Joi.object().keys({
    productionOrderId: id().allow(null),
    // 'wip', 'qc_reject' and 'rework' records are created by the production flow itself.
    stage: Joi.string().valid('material', 'finished_good').required(),
    materialLineId: id().when('stage', { is: 'material', then: Joi.required() }),
    productId: id(),
    variantId: id().allow(null),
    batchId: id(),
    imeiIds: Joi.array().items(id()).max(5000),
    serialNumbers: serialList(),
    quantity: Joi.number().positive(),
    reason: Joi.string().valid(...SCRAP_REASONS),
    scrapDate: Joi.date(),
    notes: Joi.string().allow('').max(1000),
  }),
};

const completeAssembly = {
  ...orderIdParam,
  body: Joi.object().keys({
    quantity: Joi.number().min(0),
    goodQuantity: Joi.number().min(0),
    ...rejectFields,
    wipDisposition: Joi.string().valid('return', 'scrap'),
    notes: Joi.string().allow('').max(1000),
  }),
};

const createSubAssemblies = {
  ...orderIdParam,
  body: Joi.object().keys({
    recursive: Joi.boolean(),
    basis: Joi.string().valid('shortage', 'full'),
    materialLineIds: Joi.array().items(id()).max(500),
    operatorId: id().allow(null, ''),
  }),
};

const traceFinished = {
  query: Joi.object().keys({ imeiId: id(), batchId: id(), receiptId: id() }).or('imeiId', 'batchId', 'receiptId'),
};

const traceWhereUsed = {
  query: Joi.object().keys({ imeiId: id(), batchId: id(), productId: id() }).or('imeiId', 'batchId', 'productId'),
};

const traceLookup = { query: Joi.object().keys({ q: Joi.string().trim().min(2).max(80).required() }) };

const stockDetail = {
  query: Joi.object().keys({ productId: id().required(), variantId: id().allow(null, '') }),
};

const listMovements = {
  query: Joi.object().keys({
    productionOrderId: id(),
    productId: id(),
    bucket: Joi.string().valid('available', 'wip', 'qc', 'rework', 'floor'),
    type: Joi.string(),
    ...dateRange,
    ...pagination,
  }),
};

const listOutputs = {
  query: Joi.object().keys({
    productionOrderId: id(),
    productId: id(),
    status: Joi.string().valid(...OUTPUT_STATUSES),
    search: Joi.string().allow(''),
    ...dateRange,
    ...pagination,
  }),
};

const listTransactions = {
  query: Joi.object().keys({
    productionOrderId: id(),
    productId: id(),
    stage: Joi.string().valid(...SCRAP_STAGES),
    reason: Joi.string().valid(...SCRAP_REASONS),
    kind: Joi.string().valid('issue', 'return'),
    status: Joi.string().valid('posted', 'cancelled'),
    search: Joi.string().allow(''),
    ...dateRange,
    ...pagination,
  }),
};

const issueIdParam = { params: Joi.object().keys({ issueId: id().required() }) };

module.exports = {
  floorOverview,
  floorMaterial,
  floorMaterialChoices,
  floorUsageTemplate,
  floorIssueMethod,
  floorMove,
  floorCount,
  listFloorVouchers,
  floorVoucherParam,
  cancelFloorVoucher,
  exportProductionOrders,
  bulkUpdateProductionOrders,
  getAnalytics,
  report,
  searchBatches,
  getOrderStatusCounts,
  updateSettings,
  getProducts,
  getMatchingProductIds,
  updateProductAttributes,
  bulkClassifyProducts,
  bulkProductTracking,
  batchUnbatchedStock,
  productIdParam,
  createBom,
  getBoms,
  bomIdParam,
  updateBom,
  createBomVersion,
  setBomActive,
  explodeBom,
  createProductionOrder,
  getProductionOrders,
  orderIdParam,
  updateProductionOrder,
  getProductStats,
  receiptIdParam,
  createMaterialReceipt,
  updateMaterialReceipt,
  getMaterialReceipts,
  addOrderOperation,
  updateOrderOperation,
  reorderOrderOperations,
  orderOperationAction,
  operationIdParam,
  documentIdParam,
  addOrderDocumentLink,
  uploadOrderDocument,
  changeProductionStatus,
  getRequirements,
  issueMaterials,
  materialIssueVoucher,
  materialIssuePlan,
  editMaterialIssue,
  cancelMaterialIssue,
  pendingMaterials,
  materialIssueByMaterial,
  materialUsage,
  productionOrderBatch,
  returnMaterials,
  reportOutput,
  packingProductParam,
  packingSetupQuery,
  packingVoucherParam,
  savePackSizes,
  createPackProduct,
  listPacking,
  postPacking,
  cancelPacking,
  inspectOutput,
  reverseOutput,
  resolveRework,
  recordScrap,
  stockDetail,
  completeAssembly,
  createSubAssemblies,
  traceFinished,
  traceWhereUsed,
  traceLookup,
  listMovements,
  listOutputs,
  listTransactions,
  issueIdParam,
};
