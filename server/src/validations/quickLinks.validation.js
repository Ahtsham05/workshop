const Joi = require('joi');

const updateQuickLinks = {
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
  updateQuickLinks,
};
