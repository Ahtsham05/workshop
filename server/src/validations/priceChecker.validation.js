const Joi = require('joi');

// Every search URL template must contain the literal "{query}" placeholder — enforced
// here (not just documented) since a template without it would silently search the same
// fixed URL for every product. Mirrored on the client's add/edit form.
const searchUrlTemplate = Joi.string()
  .trim()
  .required()
  .custom((value, helpers) => {
    if (!value.includes('{query}')) {
      return helpers.error('any.custom');
    }
    return value;
  })
  .messages({ 'any.custom': 'Search URL must contain the {query} placeholder' });

const createSource = {
  body: Joi.object().keys({
    name: Joi.string().trim().required(),
    searchUrlTemplate,
    priceSelector: Joi.string().trim().required(),
    titleSelector: Joi.string().trim().allow('').optional(),
    imageSelector: Joi.string().trim().allow('').optional(),
    linkSelector: Joi.string().trim().allow('').optional(),
    isActive: Joi.boolean().optional(),
    status: Joi.string().valid('active', 'inactive').optional(),
  }),
};

const getSources = {
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'inactive'),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getAllSources = {
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'inactive'),
  }),
};

const getSource = {
  params: Joi.object().keys({
    sourceId: Joi.string().required(),
  }),
};

const updateSource = {
  params: Joi.object().keys({
    sourceId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim(),
      searchUrlTemplate: searchUrlTemplate.optional(),
      priceSelector: Joi.string().trim(),
      titleSelector: Joi.string().trim().allow(''),
      imageSelector: Joi.string().trim().allow(''),
      linkSelector: Joi.string().trim().allow(''),
      isActive: Joi.boolean(),
      status: Joi.string().valid('active', 'inactive'),
    })
    .min(1),
};

const deleteSource = {
  params: Joi.object().keys({
    sourceId: Joi.string().required(),
  }),
};

const autoDetect = {
  body: Joi.object().keys({
    url: Joi.string()
      .trim()
      .uri({ scheme: ['http', 'https'] })
      .required(),
  }),
};

const testSource = {
  body: Joi.object().keys({
    searchUrlTemplate,
    priceSelector: Joi.string().trim().required(),
    titleSelector: Joi.string().trim().allow('').optional(),
    imageSelector: Joi.string().trim().allow('').optional(),
    linkSelector: Joi.string().trim().allow('').optional(),
    query: Joi.string().trim().min(2).max(200).required(),
  }),
};

const checkPrice = {
  body: Joi.object().keys({
    query: Joi.string().trim().min(2).max(200).required(),
    forceRefresh: Joi.boolean().optional(),
    // Narrows the check to one competitor source — used to retry just that source
    // without force-refreshing (and bypassing the cache for) every other one.
    sourceId: Joi.string().optional(),
  }),
};

module.exports = {
  createSource,
  getSources,
  getAllSources,
  getSource,
  updateSource,
  deleteSource,
  testSource,
  autoDetect,
  checkPrice,
};
