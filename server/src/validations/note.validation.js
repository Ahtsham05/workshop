const Joi = require('joi');
const { objectId } = require('./custom.validation');

const COLORS = ['default', 'yellow', 'green', 'blue', 'purple', 'pink', 'orange', 'red'];
const VISIBILITIES = ['private', 'branch', 'organization'];
const RELATED_TYPES = ['Customer', 'Supplier', 'Lead', 'Product', 'Invoice', 'Purchase'];
const NOTE_TYPES = ['general', 'meeting', 'task', 'idea', 'code', 'project', 'research'];

const createNote = {
  body: Joi.object().keys({
    title: Joi.string().allow('').max(200),
    content: Joi.string().allow('').max(200000),
    color: Joi.string().valid(...COLORS),
    tags: Joi.array().items(Joi.string().allow('')),
    isPinned: Joi.boolean(),
    visibility: Joi.string().valid(...VISIBILITIES),
    relatedType: Joi.string().valid(...RELATED_TYPES),
    relatedId: Joi.string().custom(objectId),
    relatedLabel: Joi.string().allow('').max(200),
    noteType: Joi.string().valid(...NOTE_TYPES),
    category: Joi.string().allow('').max(60),
    clientId: Joi.string().allow('').max(80),
  }),
};

const getNotes = {
  query: Joi.object().keys({
    view: Joi.string().valid('active', 'archived', 'trash'),
    search: Joi.string().allow('').max(200),
    tag: Joi.string().allow(''),
    color: Joi.string().valid(...COLORS),
    visibility: Joi.string().valid(...VISIBILITIES),
    relatedId: Joi.string().custom(objectId),
    noteType: Joi.string().valid(...NOTE_TYPES),
    mine: Joi.boolean(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getNote = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

const updateNote = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      title: Joi.string().allow('').max(200),
      content: Joi.string().allow('').max(200000),
      color: Joi.string().valid(...COLORS),
      tags: Joi.array().items(Joi.string().allow('')),
      isPinned: Joi.boolean(),
      isArchived: Joi.boolean(),
      visibility: Joi.string().valid(...VISIBILITIES),
      relatedType: Joi.string().valid(...RELATED_TYPES).allow(null, ''),
      relatedId: Joi.string().custom(objectId).allow(null, ''),
      relatedLabel: Joi.string().allow('').max(200),
      noteType: Joi.string().valid(...NOTE_TYPES),
      category: Joi.string().allow('').max(60),
    })
    .min(1),
};

const deleteNote = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    permanent: Joi.boolean(),
  }),
};

module.exports = {
  createNote,
  getNotes,
  getNote,
  updateNote,
  deleteNote,
};
