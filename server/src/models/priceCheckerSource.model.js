const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const syncVersionPlugin = require('./plugins/syncVersion.plugin');

// One row per competitor website the org has configured for the Price Checker feature.
// Org-scoped like Brand (not branch-filtered) — a competitor site is the same regardless
// of which branch is checking prices against it.
const PriceCheckerSourceSchema = new mongoose.Schema({
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
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    name: { type: String, required: true, trim: true },
    // Must contain the literal placeholder "{query}", swapped for the URL-encoded search
    // term at scrape time — see priceChecker.service.js#buildSearchUrl. Enforced in
    // priceChecker.validation.js.
    searchUrlTemplate: { type: String, required: true, trim: true },
    // CSS selectors resolved against the competitor's live page by priceChecker.service.js
    // (headless Chrome via puppeteer-core, same engine as invoicePdf.service.js). Only
    // priceSelector is required — title/image/link are cosmetic extras for the result card.
    priceSelector: { type: String, required: true, trim: true },
    titleSelector: { type: String, trim: true },
    imageSelector: { type: String, trim: true },
    linkSelector: { type: String, trim: true },
    // Soft on/off — an inactive source is skipped by checkPrice but kept configured
    // (distinct from `status`, which is the Brand-style soft-delete flag below).
    isActive: { type: Boolean, default: true },
    // Bookkeeping surfaced in the Manage Competitor Sites list so an admin can see at a
    // glance whether a source's selectors have started failing (e.g. after a competitor
    // redesigns their site) without having to run a fresh check.
    lastCheckedAt: { type: Date, default: null },
    lastCheckStatus: { type: String, enum: ['ok', 'not_found', 'error', null], default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, {
    timestamps: true
});

PriceCheckerSourceSchema.plugin(syncVersionPlugin);
PriceCheckerSourceSchema.plugin(toJSON);
PriceCheckerSourceSchema.plugin(paginate);

PriceCheckerSourceSchema.index({ organizationId: 1, isActive: 1 });
PriceCheckerSourceSchema.index({ organizationId: 1, name: 1 });

const PriceCheckerSource = mongoose.model('PriceCheckerSource', PriceCheckerSourceSchema);

module.exports = PriceCheckerSource;
