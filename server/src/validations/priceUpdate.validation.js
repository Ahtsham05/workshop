const Joi = require('joi');
const { objectId } = require('./custom.validation');

const id = Joi.string().custom(objectId);
const optionalId = Joi.string().custom(objectId).allow('', null);
const money = Joi.number().min(0).max(1e10);

const analyze = {
  body: Joi.object()
    .keys({
      // Pasted / extracted text. The parser runs on the server so it is the same code for every source.
      text: Joi.string().max(400000).allow(''),
      // Or already-structured rows (spreadsheet columns, mapped in the browser).
      rows: Joi.array()
        .max(5000)
        .items(
          Joi.object()
            .keys({
              name: Joi.string().max(300).allow(''),
              code: Joi.string().max(60).allow('', null),
              section: Joi.string().max(120).allow('', null),
              line: Joi.number().integer().min(0),
              raw: Joi.string().max(500).allow(''),
              values: Joi.array()
                .max(6)
                .items(Joi.object().keys({ value: money.required(), kind: Joi.string().valid('cost', 'price').allow(null) }).unknown(true)),
            })
            .unknown(true)
        ),
      supplierId: optionalId,
    })
    .or('text', 'rows'),
};

const searchProducts = {
  query: Joi.object().keys({
    q: Joi.string().trim().min(1).max(100).required(),
    limit: Joi.number().integer().min(1).max(30),
  }),
};

const applyBatch = {
  body: Joi.object().keys({
    items: Joi.array()
      .min(1)
      .max(5000)
      .items(
        Joi.object().keys({
          productId: id.required(),
          variantId: optionalId,
          newCost: money.allow(null),
          newPrice: money.allow(null),
          // What the review screen showed as the current value — lets the server refuse to
          // overwrite a product that changed while the list was being reviewed.
          expectedOldCost: Joi.number().allow(null),
          expectedOldPrice: Joi.number().allow(null),
          sourceLine: Joi.string().max(500).allow('', null),
          listName: Joi.string().max(300).allow('', null),
          matchMethod: Joi.string().valid('code', 'exact', 'name', 'alias', 'manual'),
          matchScore: Joi.number().allow(null),
        })
      )
      .required(),
    meta: Joi.object()
      .keys({
        sourceType: Joi.string().valid('text', 'whatsapp', 'pdf', 'excel', 'image', 'manual'),
        fileName: Joi.string().max(200).allow('', null),
        supplierId: optionalId,
        note: Joi.string().max(500).allow('', null),
        priceMode: Joi.string().valid('cost', 'price', 'both'),
        rule: Joi.object().unknown(true).allow(null),
        sourceText: Joi.string().max(200000).allow('', null),
      })
      .default({}),
  }),
};

const getBatches = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

const getBatch = {
  params: Joi.object().keys({ batchId: id.required() }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(1000),
  }),
};

const rollbackBatch = {
  params: Joi.object().keys({ batchId: id.required() }),
  body: Joi.object().keys({ force: Joi.boolean() }),
};

const getProductHistory = {
  params: Joi.object().keys({ productId: id.required() }),
  query: Joi.object().keys({
    variantId: id,
    limit: Joi.number().integer().min(1).max(500),
  }),
};

const deleteAlias = {
  params: Joi.object().keys({ aliasId: id.required() }),
};

module.exports = {
  analyze,
  searchProducts,
  applyBatch,
  getBatches,
  getBatch,
  rollbackBatch,
  getProductHistory,
  deleteAlias,
};
