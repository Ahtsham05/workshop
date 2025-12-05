const Joi = require('joi');
const { password } = require('./custom.validation');

const createCompany = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    phone: Joi.string(),
    address: Joi.string(),
    city: Joi.string(),
    country: Joi.string(),
    taxNumber: Joi.string(),
    logo: Joi.object().keys({
      url: Joi.string(),
      publicId: Joi.string(),
    }),
  }),
};

const updateCompany = {
  body: Joi.object()
    .keys({
      name: Joi.string(),
      email: Joi.string().email(),
      phone: Joi.string(),
      address: Joi.string(),
      city: Joi.string(),
      country: Joi.string(),
      taxNumber: Joi.string(),
      logo: Joi.object().keys({
        url: Joi.string(),
        publicId: Joi.string(),
      }),
    })
    .min(1),
};

const changePassword = {
  body: Joi.object().keys({
    oldPassword: Joi.string().required(),
    newPassword: Joi.string().required().custom(password),
  }),
};

module.exports = {
  createCompany,
  updateCompany,
  changePassword,
};
