const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

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
    name: { type: String, required: true },
    image: {
        url: { type: String },
        publicId: { type: String }
    },
},{
    timestamps: true
});

CategorySchema.index({ organizationId: 1, branchId: 1 });

// add plugin that converts mongoose to json
CategorySchema.plugin(toJSON);
CategorySchema.plugin(paginate);

const Category = mongoose.model('Category', CategorySchema);

module.exports = Category;
