const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

// Generalized successor to the mobile-only Imei model — same per-unit-traceability idea
// (furniture, appliances, electronics) without phone-shaped fields. The existing Imei
// collection is left untouched; this is additive, not a replacement.
const SerialNumberSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    inventoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: true,
        index: true,
    },
    variantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductVariant',
        required: true,
        index: true,
    },
    serial: { type: String, required: true, trim: true, index: true },
    secondarySerial: { type: String, trim: true, default: '' }, // imei2 equivalent
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    status: {
        type: String,
        enum: ['in_stock', 'sold', 'returned', 'scrapped', 'lost', 'stolen'],
        default: 'in_stock',
        index: true,
    },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    warrantyMonths: { type: Number, default: 0 },
    warrantyEndDate: { type: Date },
}, {
    timestamps: true
});

SerialNumberSchema.plugin(toJSON);
SerialNumberSchema.plugin(paginate);

SerialNumberSchema.index({ organizationId: 1, serial: 1 }, { unique: true });

const SerialNumber = mongoose.model('SerialNumber', SerialNumberSchema);

module.exports = SerialNumber;
