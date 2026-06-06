const Joi = require('joi');
const { objectId } = require('./custom.validation');

const diaryItem = Joi.object().keys({
  subjectId: Joi.string().custom(objectId).allow('', null),
  subjectName: Joi.string().allow(''),
  classwork: Joi.string().allow(''),
  homework: Joi.string().allow(''),
});

const createDiary = {
  body: Joi.object().keys({
    classId: Joi.string().custom(objectId).required(),
    sectionId: Joi.string().custom(objectId).allow('', null),
    date: Joi.alternatives().try(Joi.date(), Joi.string()).required(),
    title: Joi.string().allow(''),
    note: Joi.string().allow(''),
    items: Joi.array().items(diaryItem),
  }),
};

const getDiaries = {
  query: Joi.object().keys({
    classId: Joi.string().custom(objectId),
    sectionId: Joi.string().custom(objectId),
    dateFrom: Joi.string().allow(''),
    dateTo: Joi.string().allow(''),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getDiary = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const updateDiary = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      classId: Joi.string().custom(objectId),
      sectionId: Joi.string().custom(objectId).allow('', null),
      date: Joi.alternatives().try(Joi.date(), Joi.string()),
      title: Joi.string().allow(''),
      note: Joi.string().allow(''),
      items: Joi.array().items(diaryItem),
    })
    .min(1),
};

const deleteDiary = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createDiary,
  getDiaries,
  getDiary,
  updateDiary,
  deleteDiary,
};
