const Joi = require('joi');
const { objectId } = require('./custom.validation');

const feeTypes = ['tuition', 'admission', 'exam', 'transport', 'library', 'laboratory', 'sports', 'computer', 'miscellaneous', 'other'];
const paymentMethods = ['cash', 'bank_transfer', 'cheque', 'online', 'other'];

const createFee = {
  body: Joi.object().keys({
    studentId: Joi.string().custom(objectId).required(),
    classId: Joi.string().custom(objectId).required(),
    feeType: Joi.string().required().valid(...feeTypes),
    amount: Joi.number().required().min(0),
    discount: Joi.number().min(0),
    fine: Joi.number().min(0),
    dueDate: Joi.date().required(),
    month: Joi.string().allow(''),
    year: Joi.number().integer(),
    status: Joi.string().valid('pending', 'partial', 'paid', 'overdue', 'waived'),
    paymentMethod: Joi.string().valid(...paymentMethods),
    voucherNo: Joi.string().allow(''),
  }),
};

const createBulkFees = {
  body: Joi.object().keys({
    records: Joi.array()
      .items(
        Joi.object().keys({
          studentId: Joi.string().custom(objectId).required(),
          classId: Joi.string().custom(objectId).required(),
          feeType: Joi.string().required().valid(...feeTypes),
          amount: Joi.number().required().min(0),
          discount: Joi.number().min(0),
          fine: Joi.number().min(0),
          dueDate: Joi.date().required(),
          month: Joi.string().allow(''),
          year: Joi.number().integer(),
        })
      )
      .min(1)
      .required(),
  }),
};

const getFees = {
  query: Joi.object().keys({
    studentId: Joi.string().custom(objectId),
    classId: Joi.string().custom(objectId),
    feeType: Joi.string().valid(...feeTypes),
    status: Joi.string().valid('pending', 'partial', 'paid', 'overdue', 'waived'),
    month: Joi.string(),
    year: Joi.number().integer(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getFee = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const getStudentFees = {
  params: Joi.object().keys({
    studentId: Joi.string().custom(objectId),
  }),
};

const payFee = {
  params: Joi.object().keys({
    id: Joi.required().custom(objectId),
  }),
  body: Joi.object().keys({
    amount: Joi.number().required().min(0),
    paymentMethod: Joi.string().required().valid(...paymentMethods),
  }),
};

const updateFee = {
  params: Joi.object().keys({
    id: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      feeType: Joi.string().valid(...feeTypes),
      amount: Joi.number().min(0),
      discount: Joi.number().min(0),
      fine: Joi.number().min(0),
      dueDate: Joi.date(),
      month: Joi.string().allow(''),
      year: Joi.number().integer(),
      status: Joi.string().valid('pending', 'partial', 'paid', 'overdue', 'waived'),
      paymentMethod: Joi.string().valid(...paymentMethods),
      voucherNo: Joi.string().allow(''),
    })
    .min(1),
};

const deleteFee = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

module.exports = { createFee, createBulkFees, getFees, getFee, getStudentFees, payFee, updateFee, deleteFee };
