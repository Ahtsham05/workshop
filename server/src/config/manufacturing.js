/**
 * Manufacturing module constants — shared by the Product model (productType), the
 * manufacturing models/services, and the validations. Mirrored client-side in
 * client/src/features/manufacturing/lib/constants.ts; keep the two in sync.
 */

/**
 * Manufacturing classification of an existing Product. `null` (unset) means the product
 * isn't part of any manufacturing flow — every product created before this module existed
 * stays exactly as it was, and nothing outside the manufacturing module reads this field.
 */
const PRODUCT_TYPES = [
  'raw_material',
  'component',
  'packaging_material',
  'sub_assembly',
  'wip',
  'finished_good',
  'by_product',
  'scrap',
  'service',
];

/** Whether a product is bought, made in-house, or either. */
const PROCUREMENT_TYPES = ['buy', 'make', 'buy_or_make'];

/** Product types that can be produced by a production order (i.e. can own a BOM). */
const PRODUCIBLE_TYPES = ['sub_assembly', 'wip', 'finished_good', 'by_product'];

const PRODUCTION_STATUSES = ['draft', 'planned', 'released', 'in_production', 'paused', 'completed', 'cancelled'];

/**
 * Allowed production-order status moves. Material issue auto-advances `released` to
 * `in_production` (see manufacturingExecution.service.js); everything else goes through
 * productionOrder.service.js#changeStatus, which checks this map.
 */
const PRODUCTION_STATUS_TRANSITIONS = {
  draft: ['planned', 'released', 'cancelled'],
  planned: ['draft', 'released', 'cancelled'],
  released: ['planned', 'in_production', 'cancelled'],
  in_production: ['paused', 'completed'],
  paused: ['in_production', 'completed'],
  completed: [],
  cancelled: [],
};

/** Statuses in which a production order's header/BOM can still be edited. */
const EDITABLE_PRODUCTION_STATUSES = ['draft', 'planned'];

/** Statuses in which materials may be issued and finished goods received. */
const EXECUTABLE_PRODUCTION_STATUSES = ['released', 'in_production', 'paused'];

/** Statuses considered "open" (counted on the dashboard, in requirements, etc). */
const OPEN_PRODUCTION_STATUSES = ['draft', 'planned', 'released', 'in_production', 'paused'];

const PRODUCTION_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

/** Where in the process a scrap was recorded. */
const SCRAP_STAGES = ['material', 'wip', 'finished_good'];

const SCRAP_REASONS = ['defect', 'damage', 'process_loss', 'expired', 'setup', 'rework', 'other'];

/** Keys of the per-organization document counters in ManufacturingSettings. */
const COUNTER_KEYS = ['bom', 'productionOrder', 'materialIssue', 'productionReceipt', 'scrap'];

/** Max depth when exploding a multi-level BOM — guards against pathological trees. */
const MAX_BOM_DEPTH = 10;

module.exports = {
  PRODUCT_TYPES,
  PROCUREMENT_TYPES,
  PRODUCIBLE_TYPES,
  PRODUCTION_STATUSES,
  PRODUCTION_STATUS_TRANSITIONS,
  EDITABLE_PRODUCTION_STATUSES,
  EXECUTABLE_PRODUCTION_STATUSES,
  OPEN_PRODUCTION_STATUSES,
  PRODUCTION_PRIORITIES,
  SCRAP_STAGES,
  SCRAP_REASONS,
  COUNTER_KEYS,
  MAX_BOM_DEPTH,
};
