const Joi = require('joi');
const { password, objectId } = require('./custom.validation');

const createUser = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
    role: Joi.string().required().custom(objectId),
    isActive: Joi.boolean(),
  }),
};

const getUsers = {
  query: Joi.object().keys({
    name: Joi.string(),
    role: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

const updateUser = {
  params: Joi.object().keys({
    userId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      email: Joi.string().email(),
      password: Joi.string().custom(password),
      name: Joi.string(),
      role: Joi.string().custom(objectId),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

const updateLanguage = {
  body: Joi.object().keys({
    language: Joi.string().valid('en', 'ur').required(),
  }),
};

const updateMe = {
  body: Joi.object()
    .keys({
      name: Joi.string().min(1).max(100),
      email: Joi.string().email(),
      preferredLanguage: Joi.string().valid('en', 'ur'),
    })
    .min(1),
};

const changeMyPassword = {
  body: Joi.object().keys({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().required().custom(password),
  }),
};

const updateUiPreferences = {
  body: Joi.object()
    .keys({
      rowScheme: Joi.string().valid('default', 'slate', 'sky', 'mint', 'sand', 'lavender', 'rose', 'paper'),
      alternateRows: Joi.boolean(),
      branchTint: Joi.string().valid('off', 'subtle', 'medium', 'strong'),
      themeColor: Joi.string().valid(
        'default', 'graphite', 'stone',
        'navy', 'blue', 'sky', 'cyan',
        'teal', 'emerald', 'green', 'forest', 'lime',
        'yellow', 'amber', 'orange', 'bronze', 'red', 'maroon',
        'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'
      ),
    })
    .min(1),
};

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  updateLanguage,
  updateMe,
  changeMyPassword,
  updateUiPreferences,
};
