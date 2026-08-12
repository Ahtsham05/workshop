const Joi = require('joi');
const { objectId } = require('./custom.validation');

const STAGES = ['new', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost'];
const SOURCES = ['whatsapp', 'referral', 'walk_in', 'facebook', 'manual', 'other'];

const createLead = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    companyName: Joi.string().allow(''),
    email: Joi.string().allow(''),
    phone: Joi.string().allow(''),
    whatsapp: Joi.string().allow(''),
    address: Joi.string().allow(''),
    source: Joi.string().valid(...SOURCES),
    estimatedValue: Joi.number().min(0),
    assignedTo: Joi.string().custom(objectId),
  }),
};

const getLeads = {
  query: Joi.object().keys({
    stage: Joi.string().valid(...STAGES),
    source: Joi.string().valid(...SOURCES),
    assignedTo: Joi.string().custom(objectId),
    search: Joi.string().allow(''),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getLead = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

const updateLead = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    name: Joi.string(),
    companyName: Joi.string().allow(''),
    email: Joi.string().allow(''),
    phone: Joi.string().allow(''),
    whatsapp: Joi.string().allow(''),
    address: Joi.string().allow(''),
    source: Joi.string().valid(...SOURCES),
    estimatedValue: Joi.number().min(0),
    assignedTo: Joi.string().custom(objectId),
  }),
};

const changeStage = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    stage: Joi.string().valid(...STAGES).required(),
    note: Joi.string().allow(''),
    confirmSkip: Joi.boolean(),
    lostReason: Joi.string().allow(''),
  }),
};

const checkDuplicates = {
  query: Joi.object().keys({
    phone: Joi.string().allow(''),
    whatsapp: Joi.string().allow(''),
    email: Joi.string().allow(''),
    excludeId: Joi.string().custom(objectId),
  }),
};

const convertLead = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    name: Joi.string().allow(''),
    email: Joi.string().allow(''),
    phone: Joi.string().allow(''),
    whatsapp: Joi.string().allow(''),
    address: Joi.string().allow(''),
    forceCreateNew: Joi.boolean(),
  }),
};

const deleteLead = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

const getByCustomer = {
  params: Joi.object().keys({
    customerId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createLead,
  getLeads,
  getLead,
  updateLead,
  changeStage,
  checkDuplicates,
  convertLead,
  deleteLead,
  getByCustomer,
};
