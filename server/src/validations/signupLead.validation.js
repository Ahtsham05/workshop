const Joi = require('joi');
const { objectId } = require('./custom.validation');

const orgParam = { orgId: Joi.string().custom(objectId).required() };
const STAGES = ['new', 'contacted', 'demo', 'negotiation', 'won', 'lost'];

const listOrganizations = {
  query: Joi.object().keys({
    search: Joi.string().allow('').max(200),
    bucket: Joi.string().valid('all', 'new', 'trial', 'paid', 'trial_expired', 'lapsed', 'followup'),
    businessType: Joi.string().allow('').max(60),
    plan: Joi.string().allow('').max(60),
    stage: Joi.string()
      .allow('')
      .valid('', ...STAGES),
    sortBy: Joi.string().valid('createdAt:desc', 'createdAt:asc', 'name:asc', 'name:desc', 'trialEnd:asc', 'followUp:asc'),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100000),
  }),
};

const getPipeline = {
  query: Joi.object().keys({
    search: Joi.string().allow('').max(200),
    stage: Joi.string()
      .allow('')
      .valid('', ...STAGES),
  }),
};

const acknowledge = {
  body: Joi.object().keys({
    organizationIds: Joi.array().items(Joi.string().custom(objectId)).max(500),
  }),
};

const getLead = { params: Joi.object().keys(orgParam) };

const updateLead = {
  params: Joi.object().keys(orgParam),
  body: Joi.object()
    .keys({
      stage: Joi.string().valid(...STAGES),
      temperature: Joi.string().valid('hot', 'warm', 'cold'),
      expectedPlan: Joi.string().allow('').max(60),
      expectedValue: Joi.number().min(0).max(100000000),
      lostReason: Joi.string().allow('').max(500),
      tags: Joi.array().items(Joi.string().max(40)).max(20),
      assignedTo: Joi.string().custom(objectId).allow(null, ''),
      nextFollowUpAt: Joi.date().allow(null, ''),
      nextFollowUpNote: Joi.string().allow('').max(500),
    })
    .min(1),
};

const addActivity = {
  params: Joi.object().keys(orgParam),
  body: Joi.object().keys({
    type: Joi.string().valid('call', 'whatsapp', 'email', 'meeting', 'note').required(),
    outcome: Joi.string()
      .valid('reached', 'no_answer', 'interested', 'not_interested', 'call_back', 'needs_help')
      .allow(null, ''),
    text: Joi.string().allow('').max(2000),
    completeTouchpoint: Joi.string().allow('', null).max(40),
    nextFollowUpAt: Joi.date().allow(null, ''),
    nextFollowUpNote: Joi.string().allow('').max(500),
  }),
};

const setTouchpoint = {
  params: Joi.object().keys({ ...orgParam, key: Joi.string().max(40).required() }),
  body: Joi.object().keys({ action: Joi.string().valid('done', 'skip', 'reopen').required() }),
};

const snooze = {
  params: Joi.object().keys(orgParam),
  body: Joi.object().keys({ minutes: Joi.number().integer().min(5).max(20160).required() }),
};

module.exports = { listOrganizations, getPipeline, acknowledge, getLead, updateLead, addActivity, setTouchpoint, snooze };
