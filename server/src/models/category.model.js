const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

const CategorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    image: {
        url: { type: String }, // Cloudinary URL
        publicId: { type: String } // Cloudinary public ID for deletion
    },
},{
    timestamps: true
});

// add plugin that converts mongoose to json
CategorySchema.plugin(toJSON);
CategorySchema.plugin(paginate);

const Category = mongoose.model('Category', CategorySchema);

module.exports = Category;
