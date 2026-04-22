const Joi = require('joi');
const { objectId } = require('./custom.validation');

const STATUSES = ['new', 'contacted', 'interested', 'converted', 'lost'];
const SOURCES = ['walk_in', 'phone', 'referral', 'website', 'social_media', 'newspaper', 'other'];

const createVisitor = {
  body: Joi.object().keys({
    studentName: Joi.string().required(),
    gender: Joi.string().valid('male', 'female', 'other'),
    dateOfBirth: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
    desiredClass: Joi.string().allow('', null),
    previousSchool: Joi.string().allow('', null),

    parentName: Joi.string().required(),
    phone: Joi.string().required(),
    alternatePhone: Joi.string().allow('', null),
    email: Joi.string().email().allow('', null),
    address: Joi.string().allow('', null),

    inquiryDate: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
    source: Joi.string().valid(...SOURCES),
    referredBy: Joi.string().allow('', null),
    notes: Joi.string().allow('', null),

    status: Joi.string().valid(...STATUSES),
    nextFollowUpDate: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
  }),
};

const getVisitors = {
  query: Joi.object().keys({
    status: Joi.string().valid(...STATUSES),
    source: Joi.string().valid(...SOURCES),
    phone: Joi.string(),
    studentName: Joi.string(),
    dateFrom: Joi.string(),
    dateTo: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getVisitor = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const updateVisitor = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      studentName: Joi.string(),
      gender: Joi.string().valid('male', 'female', 'other'),
      dateOfBirth: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
      desiredClass: Joi.string().allow('', null),
      previousSchool: Joi.string().allow('', null),

      parentName: Joi.string(),
      phone: Joi.string(),
      alternatePhone: Joi.string().allow('', null),
      email: Joi.string().email().allow('', null),
      address: Joi.string().allow('', null),

      inquiryDate: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
      source: Joi.string().valid(...SOURCES),
      referredBy: Joi.string().allow('', null),
      notes: Joi.string().allow('', null),

      status: Joi.string().valid(...STATUSES),
      nextFollowUpDate: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
      convertedAt: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
    })
    .min(1),
};

const deleteVisitor = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const addFollowUp = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
  body: Joi.object().keys({
    note: Joi.string().required(),
    nextFollowUpDate: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
    statusAfter: Joi.string().valid(...STATUSES),
  }),
};

module.exports = { createVisitor, getVisitors, getVisitor, updateVisitor, deleteVisitor, addFollowUp };
