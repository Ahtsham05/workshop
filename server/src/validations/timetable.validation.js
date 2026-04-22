const Joi = require('joi');
const { objectId } = require('./custom.validation');

const periodSchema = Joi.object().keys({
  periodNo: Joi.number().integer().required(),
  startTime: Joi.string().required(),
  endTime: Joi.string().required(),
  subjectId: Joi.string().custom(objectId),
  teacherId: Joi.string().custom(objectId),
  room: Joi.string().allow(''),
  type: Joi.string().valid('class', 'lecture', 'lab', 'break', 'lunch', 'assembly', 'sports', 'other'),
});

const createTimetable = {
  body: Joi.object().keys({
    classId: Joi.string().custom(objectId).required(),
    sectionId: Joi.string().custom(objectId),
    day: Joi.string().required().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
    periods: Joi.array().items(periodSchema).min(1).required(),
    isActive: Joi.boolean(),
  }),
};

const getTimetables = {
  query: Joi.object().keys({
    classId: Joi.string().custom(objectId),
    sectionId: Joi.string().custom(objectId),
    day: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getTimetable = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const getTimetableByClass = {
  params: Joi.object().keys({
    classId: Joi.string().custom(objectId),
  }),
};

const updateTimetable = {
  params: Joi.object().keys({
    id: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      classId: Joi.string().custom(objectId),
      sectionId: Joi.string().custom(objectId),
      day: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
      periods: Joi.array().items(periodSchema).min(1),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteTimetable = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const getTimetableByTeacher = {
  params: Joi.object().keys({
    teacherId: Joi.string().custom(objectId).required(),
  }),
};

const getTeacherAvailability = {
  params: Joi.object().keys({
    teacherId: Joi.string().custom(objectId).required(),
    day: Joi.string().valid(...DAYS).required(),
  }),
};

const checkConflict = {
  body: Joi.object()
    .keys({
      teacherId: Joi.string().custom(objectId).required(),
      classId: Joi.string().custom(objectId).required(),
      sectionId: Joi.string().custom(objectId),
      day: Joi.string().valid(...DAYS).required(),
      // At least one slot identifier required
      timeSlotId: Joi.string().custom(objectId),
      periodNo: Joi.number().integer().min(1),
      excludeTimetableId: Joi.string().custom(objectId),
    })
    .or('timeSlotId', 'periodNo'), // at least one of these must be present
};

const autoGenerateTimetable = {
  body: Joi.object().keys({
    classId: Joi.string().custom(objectId).required(),
    sectionId: Joi.string().custom(objectId),
    days: Joi.array().items(Joi.string().valid(...DAYS)).min(1),
    shuffle: Joi.boolean(),
    save: Joi.boolean(),
    overwrite: Joi.boolean(), // alias for save=true used by front-end
    subjectOverrides: Joi.array().items(
      Joi.object().keys({
        subjectId: Joi.string().custom(objectId).required(),
        periodsPerWeek: Joi.number().integer().min(1).max(12).required(),
        priority: Joi.number().integer().min(0),
      })
    ),
    /** Custom time slots from the wizard — replaces existing slots before generation */
    timeSlots: Joi.array().items(
      Joi.object().keys({
        slotNumber: Joi.number().integer().min(1).required(),
        label: Joi.string().max(80).required(),
        startTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
        endTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
        type: Joi.string().valid('class', 'lab', 'break', 'lunch', 'assembly', 'sports', 'other').required(),
        applicableDays: Joi.array().items(Joi.string().valid(...DAYS)),
      })
    ).min(1),
  }),
};

const bulkGenerateTimetables = {
  body: Joi.object().keys({
    days: Joi.array().items(Joi.string().valid(...DAYS)).min(1),
    shuffle: Joi.boolean(),
    save: Joi.boolean(),
    continueOnError: Joi.boolean(),
    classIds: Joi.array().items(Joi.string().custom(objectId)).min(1),
    subjectDefaults: Joi.array().items(
      Joi.object().keys({
        subjectId: Joi.string().custom(objectId).required(),
        periodsPerWeek: Joi.number().integer().min(1).max(12).required(),
        priority: Joi.number().integer().min(0),
      })
    ),
    /** Custom time slots from the wizard — replaces existing slots before generation */
    timeSlots: Joi.array().items(
      Joi.object().keys({
        slotNumber: Joi.number().integer().min(1).required(),
        label: Joi.string().max(80).required(),
        startTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
        endTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
        type: Joi.string().valid('class', 'lab', 'break', 'lunch', 'assembly', 'sports', 'other').required(),
        applicableDays: Joi.array().items(Joi.string().valid(...DAYS)),
      })
    ).min(1),
  }),
};

module.exports = {
  createTimetable,
  getTimetables,
  getTimetable,
  getTimetableByClass,
  getTimetableByTeacher,
  getTeacherAvailability,
  checkConflict,
  autoGenerateTimetable,
  bulkGenerateTimetables,
  updateTimetable,
  deleteTimetable,
};
