const Joi = require('joi');

const CONTEXTS = ['product', 'category', 'subcategory', 'brand'];
const PROVIDERS = ['openfoodfacts', 'upcitemdb', 'google', 'yandex', 'duckduckgo', 'openverse', 'wikimedia', 'pexels'];

const searchImages = {
  body: Joi.object()
    .keys({
      query: Joi.string().trim().allow('').max(200).optional(),
      // Digits only — the service ignores anything else rather than wasting the two
      // barcode-provider calls on a name typed into the wrong box.
      barcode: Joi.string().trim().allow('').max(32).optional(),
      page: Joi.number().integer().min(1).max(10).default(1),
      perPage: Joi.number().integer().min(6).max(40).default(24),
      providers: Joi.array().items(Joi.string().valid(...PROVIDERS)).optional(),
      context: Joi.string().valid(...CONTEXTS).default('product'),
    })
    .or('query', 'barcode'),
};

const importImages = {
  body: Joi.object().keys({
    images: Joi.array()
      .items(
        Joi.object().keys({
          url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
          token: Joi.string().allow('').optional(),
          provider: Joi.string().allow('').max(40).optional(),
          sourceUrl: Joi.string().allow('').max(500).optional(),
          title: Joi.string().allow('').max(200).optional(),
          // Copies of the same picture on other hosts, tried in order if the original
          // refuses the download (hotlink protection, removed listing).
          mirrors: Joi.array()
            .items(
              Joi.object().keys({
                url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
                token: Joi.string().allow('').optional(),
              }),
            )
            .max(4)
            .optional(),
        }),
      )
      .min(1)
      .max(8)
      .required(),
    context: Joi.string().valid(...CONTEXTS).default('product'),
  }),
};

module.exports = {
  searchImages,
  importImages,
};
