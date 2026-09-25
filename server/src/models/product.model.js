const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const syncVersionPlugin = require('./plugins/syncVersion.plugin');
const { DEFAULT_UNIT, UNITS } = require('../config/units');
const { BUSINESS_TYPES } = require('../config/businessTypes');

const ProductSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
        index: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    // Marks records created by the trial-account demo-data seeder (see
    // demoData.service.js) so they can be told apart from real data and cleared via the
    // self-service "Reset Demo Data" action without touching anything the user added.
    isDemo: { type: Boolean, default: false, index: true },
    name: { type: String, required: true, trim: true },
    nameUrdu: { type: String, trim: true },
    description: { type: String },
    // No `default: null` here — the partial unique index below only indexes documents
    // where the field genuinely exists as a string, not where it's explicitly null, so
    // defaulting to null would make every barcode-less product collide on the index.
    // Uniqueness itself is enforced per (organizationId, branchId) — see the compound
    // indexes at the bottom of this file, not here.
    barcode: { type: String, trim: true },
    price: { type: Number, required: true },
    cost: { type: Number, required: true },
    // Drives automatic tax calculation on Invoice/Purchase lines for this product (see
    // services/taxCalculator.service.js). null = falls back to the organization's
    // defaultTaxCategoryId at calculation time — never duplicate a tax rate directly here.
    taxCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxCategory', default: null },
    stockQuantity: { type: Number, required: true },
    // Per-product stock-alert overrides for the Products list' status badge (Low Stock /
    // Critical Stock). null = inherit the org-wide default configured in the Low Stock
    // Alert settings (see client low-stock-alert.tsx); only a value set here overrides it
    // for this product specifically — see client/src/lib/product-stock-display.ts for the
    // resolution logic shared by every list/badge/report that shows stock status.
    lowStockThreshold: { type: Number, min: 0, default: null },
    criticalStockThreshold: { type: Number, min: 0, default: null },
    unit: {
        type: String, 
        default: DEFAULT_UNIT,
        enum: Object.values(UNITS)
    },
    unitConversions: [
        {
            fromUnit: {
                type: String,
                required: true,
                enum: Object.values(UNITS),
            },
            toUnit: {
                type: String,
                required: true,
                enum: Object.values(UNITS),
            },
            factor: {
                type: Number,
                required: true,
                min: 0.000001,
            },
            businessTypes: [
                {
                    type: String,
                    enum: BUSINESS_TYPES,
                },
            ],
            isActive: {
                type: Boolean,
                default: true,
            },
        },
    ],
    trackImei: { type: Boolean, default: false }, // Track an IMEI (+ optional imei2) per unit — mobile phones
    trackSerial: { type: Boolean, default: false }, // Track a serial number per unit — other serialized goods (TVs, laptops, appliances). Mutually exclusive with trackImei; both are enforced/consumed via the shared Imei collection/service.
    warrantyMonths: { type: Number, default: 0 }, // Warranty length applied to IMEI/serial units sold for this product
    // SKU for inventory management. Same "no default: null" reasoning as barcode above —
    // uniqueness is enforced per (organizationId, branchId), see the compound indexes below.
    sku: { type: String, trim: true },
    category: { type: String }, // Keep for backward compatibility
    categories: [{ // New multi-category support
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
        name: { type: String, required: true },
        image: {
            url: { type: String },
            publicId: { type: String }
        }
    }],
    subCategories: [{
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'SubCategory' },
        name: { type: String, required: true },
        image: {
            url: { type: String },
            publicId: { type: String }
        }
    }],
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' }, // Reference to supplier
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
    /**
     * Dates (one per calendar day, deduped) on which this product was found at zero stock.
     * Pruned to a trailing 90-day window by the daily purchase-suggestions job — feeds the
     * dynamic safety-stock formula in services/purchaseSuggestions.service.js. Starts empty;
     * builds up real history going forward rather than guessing at past stockouts.
     */
    stockoutHistory: [{ type: Date }],
    image: {
        url: { type: String }, // Cloudinary URL
        publicId: { type: String } // Cloudinary public ID for deletion
    },
    /**
     * Ordered image gallery (max MAX_PRODUCT_IMAGES). `images[0]` IS the primary photo
     * and is mirrored into the legacy `image` field above by the hooks below — every
     * existing read path (product list rows, POS tiles, invoices, reports, analytics,
     * branch sync) still reads `image` and keeps working untouched, while anything that
     * wants the full set reads `images`.
     *
     * Never write one of the two without the other: go through the hooks (a normal
     * save/update) rather than $set-ing a raw field, or the two drift apart.
     */
    images: {
        type: [
            new mongoose.Schema({
                url: { type: String, required: true },
                publicId: { type: String, default: '' },
                // Where it came from: 'upload' | 'camera' | a webImageSearch provider key
                // ('google', 'openfoodfacts', …). Shown as provenance in the gallery UI.
                source: { type: String, trim: true, default: '' },
                // The page the image was found on, for attribution/verification.
                sourceUrl: { type: String, trim: true, default: '' },
                width: { type: Number, default: null },
                height: { type: Number, default: null },
            }, { _id: false }),
        ],
        default: [],
    },
    // Universal Product Architecture migration (see docs/architecture/universal-product-migration.md):
    // schemaVersion 1 = legacy flat product. 2 = a default ProductVariant + Inventory row
    // have been backfilled for this product. hasVariants stays false until a user opts a
    // product into the variant UI; both default to fully backward-compatible values.
    schemaVersion: { type: Number, default: 1 },
    hasVariants: { type: Boolean, default: false },
    // Master Product Catalog migration (see docs/architecture/master-product-migration.md):
    // nullable link to the org-level shared identity this branch's product represents.
    // Unset for any product not yet backfilled/created before the migration — every
    // existing read path ignores this field until explicitly opted in.
    masterProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'MasterProduct', index: true, default: null },
    // Free-text labels for flexible grouping/search (e.g. "clearance", "fragile") —
    // deliberately plain strings, not a Tag collection; see product.service.js's
    // getDistinctTags for the autocomplete source.
    tags: [{ type: String, trim: true }],
    // Standalone display/accent color for quick visual identification in lists — separate
    // from the variant/attribute Color used for actual product variants (red vs blue phone).
    color: { type: String, trim: true, default: null },
    // Free-text physical location code in the shop (e.g. "A-12-3").
    shelfLocation: { type: String, trim: true, default: '' },
    // Whether this product shows up as sellable/orderable — defaults true for a normal
    // manual create, but bulk imports (Excel, AI scan, and "import from other branches")
    // explicitly create products deactivated so a batch can be reviewed before it goes
    // live; see product.service.js#bulkAddProducts and
    // masterProduct.service.js#importMasterProducts.
    isActive: { type: Boolean, default: true, index: true },
    // Set when a staff member marks this product as having a data discrepancy that needs
    // review (wrong price, mismatched stock, etc). Absence (null) = not flagged. Set/cleared
    // only via the dedicated PATCH .../flag endpoint — see product.service.js#setProductFlag.
    flag: {
        type: new mongoose.Schema({
            color: { type: String, required: true, trim: true },
            reason: { type: String, trim: true, default: '' },
            note: { type: String, trim: true, default: '' },
            flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            flaggedAt: { type: Date },
        }, { _id: false }),
        default: null,
    },
},{
    timestamps: true,
    keepTimestampsInJSON: true,
});

/**
 * Keeps `image` (legacy single primary) and `images` (ordered gallery) consistent no
 * matter which one a caller happened to set — and there are many callers: the product
 * dialog sends the gallery, while Excel import, the AI scan, price-list updates,
 * branch sync and the multipart PATCH all still send a single `image`. Doing this in
 * the schema rather than in one service is the only way every path stays in sync.
 *
 * Rules:
 *   - gallery changed  → primary becomes images[0] (or is cleared when empty)
 *   - only primary set → it moves to the FRONT of the gallery, deduped, so replacing
 *                        the main photo never silently drops the rest
 */
const MAX_PRODUCT_IMAGES = 8;

const sameImage = (a, b) =>
    Boolean(a && b && ((a.publicId && a.publicId === b.publicId) || a.url === b.url));

const normalizeImagePair = ({ image, images, imagesTouched, imageTouched }) => {
    let gallery = Array.isArray(images) ? images.filter((entry) => entry && entry.url) : [];

    if (imagesTouched) {
        // Dedupe by publicId/url, keeping first occurrence (the user's chosen order).
        gallery = gallery.filter((entry, index) => gallery.findIndex((other) => sameImage(entry, other)) === index);
        gallery = gallery.slice(0, MAX_PRODUCT_IMAGES);
        return { image: gallery[0] ? { url: gallery[0].url, publicId: gallery[0].publicId || '' } : undefined, images: gallery };
    }

    if (imageTouched) {
        if (!image || !image.url) return { image: undefined, images: [] };
        const rest = gallery.filter((entry) => !sameImage(entry, image));
        return { image, images: [{ ...image, publicId: image.publicId || '' }, ...rest].slice(0, MAX_PRODUCT_IMAGES) };
    }

    return null;
};

ProductSchema.pre('save', function(next) {
    const imagesTouched = this.isModified('images');
    const imageTouched = this.isModified('image');
    if (!imagesTouched && !imageTouched) return next();

    const normalized = normalizeImagePair({
        image: this.image && this.image.url ? { url: this.image.url, publicId: this.image.publicId || '' } : undefined,
        images: (this.images || []).map((entry) => (entry.toObject ? entry.toObject() : entry)),
        imagesTouched,
        imageTouched,
    });
    if (normalized) {
        this.image = normalized.image;
        this.images = normalized.images;
    }
    return next();
});

ProductSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function(next) {
    const update = this.getUpdate();
    if (!update || Array.isArray(update)) return next();

    const set = update.$set || {};
    const hasImages = Object.prototype.hasOwnProperty.call(update, 'images') || Object.prototype.hasOwnProperty.call(set, 'images');
    const hasImage = Object.prototype.hasOwnProperty.call(update, 'image') || Object.prototype.hasOwnProperty.call(set, 'image');
    if (!hasImages && !hasImage) return next();

    const rawImages = hasImages ? (Object.prototype.hasOwnProperty.call(update, 'images') ? update.images : set.images) : [];
    const rawImage = hasImage ? (Object.prototype.hasOwnProperty.call(update, 'image') ? update.image : set.image) : undefined;

    const normalized = normalizeImagePair({
        image: rawImage && rawImage.url ? rawImage : undefined,
        images: rawImages,
        imagesTouched: hasImages,
        // A bare `image` update can't see the existing gallery from here (no document is
        // loaded in a query-level hook), so it replaces it outright — which is exactly
        // what the single-image callers listed above mean by setting it.
        imageTouched: hasImage && !hasImages,
    });
    if (!normalized) return next();

    delete update.image;
    delete update.images;
    update.$set = { ...set, images: normalized.images };
    if (normalized.image) {
        update.$set.image = normalized.image;
    } else {
        delete update.$set.image;
        update.$unset = { ...(update.$unset || {}), image: '' };
    }
    return next();
});

// Pre-save middleware to handle empty barcode/sku values
ProductSchema.pre('save', function(next) {
    // Convert empty/null barcode or sku to a genuinely *absent* field (not null) so it
    // doesn't collide with other docs under the partial unique index below.
    if (this.barcode === '' || this.barcode === null) {
        this.barcode = undefined;
    }
    if (this.sku === '' || this.sku === null) {
        this.sku = undefined;
    }
    next();
});

// Pre-update middleware to handle empty barcode/sku values
ProductSchema.pre(['updateOne', 'findOneAndUpdate'], function(next) {
    const update = this.getUpdate();
    if (update.barcode === '' || update.barcode === null) {
        delete update.barcode;
        update.$unset = { ...(update.$unset || {}), barcode: '' };
    }
    if (update.sku === '' || update.sku === null) {
        delete update.sku;
        update.$unset = { ...(update.$unset || {}), sku: '' };
    }
    next();
});

// add plugin that converts mongoose to json
ProductSchema.plugin(syncVersionPlugin);
ProductSchema.plugin(toJSON);
ProductSchema.plugin(paginate);

ProductSchema.index({ organizationId: 1, branchId: 1 });
ProductSchema.index({ organizationId: 1, branchId: 1, name: 1 }, { unique: false });
ProductSchema.index({ organizationId: 1, branchId: 1, tags: 1 });
// Supports the dashboard low-stock widget's "lowest stock first, top 20" query.
ProductSchema.index({ organizationId: 1, branchId: 1, stockQuantity: 1 });
// Supports the Products page's "Added Today" view and its header count (a createdAt range
// within one branch), which are read on every list refresh.
ProductSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });

// SKU and barcode are each unique per (organizationId, branchId) — the same code can be
// reused by a different branch, or a different organization entirely; this is what
// makes SKU/barcode "branch and organization scoped" rather than globally unique.
//
// Deliberately NOT `sparse: true` — sparse on a COMPOUND index only excludes a document
// when *every* indexed field is missing, and organizationId/branchId are always present,
// so a sparse compound index would still index every barcode-less (or SKU-less) product
// as {organizationId, branchId, barcode: null} and collide with every other one in the
// same org+branch. A partial index scoped to "field genuinely exists as a string" is the
// correct way to make an optional field unique-when-present in a compound index — see
// MasterProduct.barcode for the same fix and the production incident it documents.
ProductSchema.index(
    { organizationId: 1, branchId: 1, barcode: 1 },
    { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } },
);
ProductSchema.index(
    { organizationId: 1, branchId: 1, sku: 1 },
    { unique: true, partialFilterExpression: { sku: { $type: 'string' } } },
);

const Product = mongoose.model('Product', ProductSchema);

module.exports = Product;
module.exports.MAX_PRODUCT_IMAGES = MAX_PRODUCT_IMAGES;
