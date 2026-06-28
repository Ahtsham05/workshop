const httpStatus = require('http-status');
const { ProductAttribute } = require('../models');
const ApiError = require('../utils/ApiError');

const createProductAttribute = async (body) => {
  const exists = await ProductAttribute.findOne({ organizationId: body.organizationId, name: body.name });
  if (exists) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Attribute "${body.name}" already exists`);
  }
  return ProductAttribute.create(body);
};

const queryProductAttributes = async (filter, options) => {
  return ProductAttribute.paginate(filter, options);
};

const getAllProductAttributes = async (filter) => {
  return ProductAttribute.find(filter).sort({ name: 1 });
};

const getProductAttributeById = async (id) => {
  const attribute = await ProductAttribute.findById(id);
  if (!attribute) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Attribute not found');
  }
  return attribute;
};

const updateProductAttributeById = async (id, updateBody) => {
  const attribute = await getProductAttributeById(id);
  Object.assign(attribute, updateBody);
  await attribute.save();
  return attribute;
};

const deleteProductAttributeById = async (id) => {
  const attribute = await getProductAttributeById(id);
  await attribute.deleteOne();
  return attribute;
};

module.exports = {
  createProductAttribute,
  queryProductAttributes,
  getAllProductAttributes,
  getProductAttributeById,
  updateProductAttributeById,
  deleteProductAttributeById,
};
