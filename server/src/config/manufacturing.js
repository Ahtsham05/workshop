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

// 'qc_pending' is used by assembly orders: assembled output is waiting for inspection.
// For assembly orders 'in_production' is shown as "In Assembly".
const PRODUCTION_STATUSES = [
  'draft',
  'planned',
  'released',
  'in_production',
  'paused',
  'qc_pending',
  'completed',
  'cancelled',
];

/**
 * Both kinds share one document model and one execution engine (issue → WIP → output →
 * QC → finished goods); they differ in numbering, lifecycle and screens. An assembly
 * order builds a (sub-)assembly from components and can be nested under a parent order.
 */
const ORDER_TYPES = ['production', 'assembly'];

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
  qc_pending: [],
  completed: [],
  cancelled: [],
};

/**
 * Assembly lifecycle: Draft → Released → In Assembly ⇄ Paused → QC Pending → Completed.
 * "Start assembly" (released → in_production) moves components into WIP; "Complete
 * assembly" reports the output and moves to qc_pending (or straight to completed when
 * quality checks are off); the inspection then completes it.
 */
const ASSEMBLY_STATUS_TRANSITIONS = {
  draft: ['released', 'cancelled'],
  planned: ['released', 'draft', 'cancelled'],
  released: ['draft', 'in_production', 'cancelled'],
  in_production: ['paused', 'qc_pending', 'completed'],
  paused: ['in_production', 'completed'],
  qc_pending: ['in_production', 'completed'],
  completed: [],
  cancelled: [],
};

const transitionsFor = (orderType) =>
  orderType === 'assembly' ? ASSEMBLY_STATUS_TRANSITIONS : PRODUCTION_STATUS_TRANSITIONS;

/** Statuses in which a production order's header/BOM can still be edited. */
const EDITABLE_PRODUCTION_STATUSES = ['draft', 'planned'];

/** Statuses in which materials may be issued and finished goods received. */
const EXECUTABLE_PRODUCTION_STATUSES = ['released', 'in_production', 'paused'];

/** Statuses considered "open" (counted on the dashboard, in requirements, etc). */
const OPEN_PRODUCTION_STATUSES = ['draft', 'planned', 'released', 'in_production', 'paused', 'qc_pending'];

const PRODUCTION_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

/**
 * Where in the process a scrap was recorded:
 *  material      — issued material lost on the floor (moves out of WIP)
 *  wip           — partly-made output lost in process (Phase 1 records; record only)
 *  qc_reject     — output rejected at quality inspection with disposition "scrap"
 *  rework        — units that failed rework
 *  finished_good — finished stock written off (moves out of available stock)
 */
const SCRAP_STAGES = ['material', 'wip', 'qc_reject', 'rework', 'finished_good'];

/** What happens to output rejected at quality inspection. */
const REJECT_DISPOSITIONS = ['scrap', 'rework'];

const OUTPUT_STATUSES = ['pending_qc', 'inspected'];

const SCRAP_REASONS = ['defect', 'damage', 'process_loss', 'expired', 'setup', 'rework', 'other'];

/** Keys of the per-organization document counters in ManufacturingSettings. */
const COUNTER_KEYS = [
  'bom',
  'productionOrder',
  'assemblyOrder',
  'materialIssue',
  'materialReturn',
  'productionOutput',
  'productionReceipt',
  'scrap',
];

/** Max depth when exploding a multi-level BOM — guards against pathological trees. */
const MAX_BOM_DEPTH = 10;

module.exports = {
  PRODUCT_TYPES,
  PROCUREMENT_TYPES,
  PRODUCIBLE_TYPES,
  PRODUCTION_STATUSES,
  PRODUCTION_STATUS_TRANSITIONS,
  ASSEMBLY_STATUS_TRANSITIONS,
  ORDER_TYPES,
  transitionsFor,
  EDITABLE_PRODUCTION_STATUSES,
  EXECUTABLE_PRODUCTION_STATUSES,
  OPEN_PRODUCTION_STATUSES,
  PRODUCTION_PRIORITIES,
  SCRAP_STAGES,
  SCRAP_REASONS,
  REJECT_DISPOSITIONS,
  OUTPUT_STATUSES,
  COUNTER_KEYS,
  MAX_BOM_DEPTH,
};
