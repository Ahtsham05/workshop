const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const syncVersionPlugin = require('./plugins/syncVersion.plugin');

const CategorySchema = new mongoose.Schema({
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
    name: { type: String, required: true },
    nameUrdu: { type: String },
    image: {
        url: { type: String },
        publicId: { type: String }
    },
    // Deactivating a category hides it (and, per the product form's picker, its
    // sub-categories) from the Add/Edit Product pickers without touching any product
    // that already references it — those keep their denormalized category snapshot.
    isActive: { type: Boolean, default: true },
},{
    timestamps: true
});

CategorySchema.index({ organizationId: 1, branchId: 1 });

// add plugin that converts mongoose to json
CategorySchema.plugin(syncVersionPlugin);
CategorySchema.plugin(toJSON);
CategorySchema.plugin(paginate);

const Category = mongoose.model('Category', CategorySchema);

module.exports = Category;
