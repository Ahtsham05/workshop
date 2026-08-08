const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const syncVersionPlugin = require('./plugins/syncVersion.plugin');

const SubCategorySchema = new mongoose.Schema({
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
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true,
        index: true,
    },
    name: { type: String, required: true },
    nameUrdu: { type: String },
    image: {
        url: { type: String },
        publicId: { type: String }
    },
},{
    timestamps: true
});

SubCategorySchema.index({ organizationId: 1, branchId: 1 });
SubCategorySchema.index({ organizationId: 1, branchId: 1, category: 1 });

// add plugin that converts mongoose to json
SubCategorySchema.plugin(syncVersionPlugin);
SubCategorySchema.plugin(toJSON);
SubCategorySchema.plugin(paginate);

const SubCategory = mongoose.model('SubCategory', SubCategorySchema);

module.exports = SubCategory;
