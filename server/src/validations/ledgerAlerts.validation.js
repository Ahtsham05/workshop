const Joi = require('joi');
const { objectId } = require('./custom.validation');

const hexColor = Joi.string()
  .trim()
  .pattern(/^#[0-9a-fA-F]{6}$/);

const band = Joi.object({
  label: Joi.string().trim().max(40).allow(''),
  fromDays: Joi.number().integer().min(1).max(3650).required(),
  color: hexColor.required(),
});

const getSettings = {};

const updateSettings = {
  body: Joi.object({
    dueDatesEnabled: Joi.boolean(),
    defaultDueDays: Joi.number().integer().min(0).max(3650),
    applyToPending: Joi.boolean(),
    useCustomerTerms: Joi.boolean(),
    undatedRule: Joi.string().valid('ignore', 'default_days'),
    colorsEnabled: Joi.boolean(),
    dueSoonEnabled: Joi.boolean(),
    dueSoonDays: Joi.number().integer().min(1).max(60),
    dueSoonColor: hexColor,
    dueSoonLabel: Joi.string().trim().max(40).allow(''),
    dueTodayColor: hexColor,
    dueTodayLabel: Joi.string().trim().max(40).allow(''),
    bands: Joi.array().items(band).min(1).max(8),
    rowStyle: Joi.string().valid('tint', 'bar', 'badge'),
    intensity: Joi.string().valid('light', 'medium', 'strong'),
    minAmount: Joi.number().min(0),
    showInReports: Joi.boolean(),
    printColors: Joi.boolean(),
  }).min(1),
};

const getStatusBoard = {};

const getCustomerAging = {
  params: Joi.object({
    customerId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = { getSettings, updateSettings, getStatusBoard, getCustomerAging };
