const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * A website (the shop's own online store) allowed to read this organization's inventory
 * through the storefront API (routes/v1/storefront.route.js), with its own API key.
 *
 * The key itself is never stored — only its SHA-256 (`keyHash`, what a request is matched
 * on) and its first characters (`keyPrefix`, so the person can tell keys apart). It is shown
 * once, when created or rotated.
 */
const websiteConnectionSchema = mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    websiteUrl: { type: String, trim: true, default: '' },
    // Whose stock the website sells: the sum of these branches' stock.
    branchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true }],
    // Where names, prices and photos are taken from when branches differ. Defaults to the
    // first of branchIds.
    priceBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    // Units per product held back from the website, so the last few pieces sold over the
    // counter can't also be sold online. The website sees max(0, stock − safetyStock).
    safetyStock: { type: Number, default: 0, min: 0 },
    // Products switched off (inactive) are hidden from the website unless this is false.
    activeProductsOnly: { type: Boolean, default: true },
    keyHash: { type: String, required: true, unique: true, private: true },
    keyPrefix: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    lastUsedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

websiteConnectionSchema.plugin(toJSON);

module.exports = mongoose.model('WebsiteConnection', websiteConnectionSchema);
