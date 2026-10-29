const Joi = require('joi');

const board = Joi.string().valid('dashboard', 'manufacturing');
const boardQuery = { query: Joi.object().keys({ board }) };

const updateQuickLinks = {
  query: Joi.object().keys({ board }),
  body: Joi.object().keys({
    links: Joi.array()
      .items(
        Joi.object().keys({
          actionKey: Joi.string().required(),
        })
      )
      .max(50)
      .required(),
  }),
};

module.exports = {
  boardQuery,
  updateQuickLinks,
};
