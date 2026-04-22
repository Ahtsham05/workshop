const Joi = require('joi');
const { objectId } = require('./custom.validation');

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TYPES = ['class', 'lab', 'break', 'lunch', 'assembly', 'sports', 'other'];

const createTimeSlot = {
  body: Joi.object().keys({
    slotNumber: Joi.number().integer().min(1).required(),
    label: Joi.string().allow(''),
    startTime: Joi.string()
      .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .required()
      .messages({ 'string.pattern.base': 'startTime must be HH:MM (24-hour)' }),
    endTime: Joi.string()
      .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .required()
      .messages({ 'string.pattern.base': 'endTime must be HH:MM (24-hour)' }),
    type: Joi.string().valid(...TYPES),
    applicableDays: Joi.array().items(Joi.string().valid(...DAYS)),
    isActive: Joi.boolean(),
  }),
};

const getTimeSlots = {
  query: Joi.object().keys({
    type: Joi.string().valid(...TYPES),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getTimeSlot = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

const updateTimeSlot = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      slotNumber: Joi.number().integer().min(1),
      label: Joi.string().allow(''),
      startTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
      endTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
      type: Joi.string().valid(...TYPES),
      applicableDays: Joi.array().items(Joi.string().valid(...DAYS)),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteTimeSlot = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

const bulkCreateTimeSlots = {
  body: Joi.object().keys({
    slots: Joi.array()
      .items(
        Joi.object().keys({
          slotNumber: Joi.number().integer().min(1).required(),
          label: Joi.string().allow(''),
          startTime: Joi.string()
            .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
            .required(),
          endTime: Joi.string()
            .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
            .required(),
          type: Joi.string().valid(...TYPES),
          applicableDays: Joi.array().items(Joi.string().valid(...DAYS)),
          isActive: Joi.boolean(),
        })
      )
      .min(1)
      .required(),
  }),
};

module.exports = {
  createTimeSlot,
  getTimeSlots,
  getTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,
  bulkCreateTimeSlots,
};
