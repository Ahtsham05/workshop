const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const syncVersionPlugin = require('./plugins/syncVersion.plugin');

const slugify = (name) =>
    String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const BrandSchema = new mongoose.Schema({
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
    slug: { type: String, trim: true },
    description: { type: String },
    logo: {
        url: { type: String },
        publicId: { type: String },
    },
    website: { type: String },
    contactPerson: { type: String },
    email: { type: String },
    phone: { type: String },
    country: { type: String },
    // Soft delete via status, matching the convention used elsewhere in this codebase
    // (e.g. Invoice/Purchase) rather than a separate isDeleted boolean.
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, {
    timestamps: true
});

// Auto-generate slug from name on create/rename. Org-scoped uniqueness (not global) —
// see the unique compound index below, which allows the same brand name/slug across
// different organizations (multi-tenant isolation).
BrandSchema.pre('save', function (next) {
    if (this.isModified('name') || !this.slug) {
        this.slug = slugify(this.name);
    }
    next();
});

BrandSchema.plugin(syncVersionPlugin);
BrandSchema.plugin(toJSON);
BrandSchema.plugin(paginate);

BrandSchema.index({ organizationId: 1, branchId: 1 });
BrandSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
BrandSchema.index({ organizationId: 1, name: 1 });

const Brand = mongoose.model('Brand', BrandSchema);

module.exports = Brand;
