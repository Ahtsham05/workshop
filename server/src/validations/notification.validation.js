const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createNotification = {
  body: Joi.object().keys({
    title: Joi.string().trim().max(200).required(),
    message: Joi.string().trim().max(4000).required(),
    audience: Joi.array().items(Joi.string().valid('teacher', 'student', 'parent')).min(1).required(),
    type: Joi.string().valid('general', 'fee', 'exam', 'event', 'urgent').default('general'),
  }),
};

const getSent = {
  query: Joi.object().keys({
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const idParam = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createNotification,
  getSent,
  idParam,
};
