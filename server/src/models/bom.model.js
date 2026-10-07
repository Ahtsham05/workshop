const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');

/**
 * One component line of a BOM. A line always names the existing Product it consumes;
 * when that product is itself manufactured (a sub-assembly), `childBomId` pins which of
 * its BOM versions to explode — otherwise the component's Product.defaultBomId is used
 * (see bom.service.js#explodeBom). This is what makes a BOM reusable inside another BOM.
 */
const BomComponentSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    // Denormalized for display — refreshed from the product on every save.
    productName: { type: String, trim: true },
    sku: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
    scrapPercent: { type: Number, min: 0, max: 100, default: 0 },
    isOptional: { type: Boolean, default: false },
    childBomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bom', default: null },
    // Substitutes that may be issued in place of this component, in preference order.
    alternatives: {
      type: [
        new mongoose.Schema(
          {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
            productName: { type: String, trim: true },
            // How many units of the alternative replace one unit of the primary component.
            ratio: { type: Number, min: 0, default: 1 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    notes: { type: String, trim: true, default: '' },
    sequence: { type: Number, default: 0 },
  },
  { _id: true }
);

/**
 * A Bill of Materials version. Each version is its own document; versions of the same
 * BOM share `bomNumber` and differ by `version`. A version referenced by a production
 * order that has left draft/planned is locked (`isLocked`) — changes then go into a new
 * version, so an order always reflects the recipe it was released against.
 */
const BomSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    // Products are branch-scoped in Logix Plus, so a BOM lives in the same branch as the
    // products it references.
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    bomNumber: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    name: { type: String, trim: true, default: '' },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true },
    // Output quantity this BOM's component quantities produce (e.g. 1 batch = 50 units).
    quantity: { type: Number, required: true, min: 0.000001, default: 1 },
    unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
    components: { type: [BomComponentSchema], default: [] },
    notes: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    // The version used for this product by default — mirrored on Product.defaultBomId.
    isDefault: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Created by the manufacturing demo-data seeder (services/manufacturing/demoData.service.js).
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

BomSchema.plugin(toJSON);
BomSchema.plugin(paginate);

BomSchema.index({ organizationId: 1, bomNumber: 1, version: 1 }, { unique: true });
BomSchema.index({ organizationId: 1, branchId: 1, productId: 1, isDefault: 1 });
BomSchema.index({ organizationId: 1, branchId: 1, 'components.productId': 1 });
BomSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });

const Bom = mongoose.model('Bom', BomSchema);

module.exports = Bom;
