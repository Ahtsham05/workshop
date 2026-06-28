const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

// 1..N codes per variant — needed because the same variant can have multiple barcode
// symbologies (EAN/UPC/internal/QR) and grocery-style pack sizes each carry their own code.
const BarcodeSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    variantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProductVariant',
        required: true,
        index: true,
    },
    code: { type: String, required: true, trim: true },
    type: {
        type: String,
        enum: ['EAN13', 'UPC', 'CODE128', 'QR', 'INTERNAL'],
        default: 'INTERNAL',
    },
    isPrimary: { type: Boolean, default: false },
}, {
    timestamps: true
});

BarcodeSchema.plugin(toJSON);
BarcodeSchema.plugin(paginate);

BarcodeSchema.index({ organizationId: 1, code: 1 }, { unique: true });

const Barcode = mongoose.model('Barcode', BarcodeSchema);

module.exports = Barcode;
