const mongoose = require('mongoose');

// Short-lived cache of a single (source, query) scrape result. Written by
// priceChecker.service.js#checkPrice via findOneAndUpdate(..., {upsert:true}) on the
// unique compound index below, so the collection never grows unbounded even if the TTL
// sweep (which runs on its own interval, not instantly) lags behind. Purely an internal
// cache/log — never exposed as its own API resource, so no toJSON/paginate plugins.
const PriceCheckSnapshotSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
    },
    sourceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PriceCheckerSource',
        required: true,
    },
    // Lowercased/trimmed search term — the cache key alongside organizationId/sourceId.
    normalizedQuery: { type: String, required: true, trim: true },
    status: { type: String, enum: ['ok', 'not_found', 'error'], required: true },
    price: { type: Number, default: null },
    title: { type: String, default: null },
    productUrl: { type: String, default: null },
    imageUrl: { type: String, default: null },
    errorMessage: { type: String, default: null },
    fetchedAt: { type: Date, required: true },
    // TTL index: the document is removed once the wall clock passes the value stored
    // here (expires:0 means "expire at this exact timestamp", not N seconds after it).
    expiresAt: { type: Date, required: true, expires: 0 },
});

PriceCheckSnapshotSchema.index({ organizationId: 1, sourceId: 1, normalizedQuery: 1 }, { unique: true });

const PriceCheckSnapshot = mongoose.model('PriceCheckSnapshot', PriceCheckSnapshotSchema);

module.exports = PriceCheckSnapshot;
