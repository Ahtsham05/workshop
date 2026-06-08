const Joi = require('joi');
const { objectId } = require('./custom.validation');

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const voucherFeeItemSchema = Joi.object().keys({
  name: Joi.string().required().trim(),
  amount: Joi.number().min(0).required(),
  categoryId: Joi.string().custom(objectId).allow(null, ''),
});

const createVoucher = {
  body: Joi.object().keys({
    studentId: Joi.string().custom(objectId).required(),
    classId: Joi.string().custom(objectId).required(),
    sectionId: Joi.string().custom(objectId).allow(null, ''),
    feeStructureId: Joi.string().custom(objectId).allow(null, ''),
    month: Joi.string().valid(...MONTHS).required(),
    year: Joi.number().integer().min(2000).max(2100).required(),
    feeItems: Joi.array().items(voucherFeeItemSchema).min(1).required(),
    discount: Joi.number().min(0),
    fine: Joi.number().min(0),
    dueDate: Joi.date().iso().required(),
    remarks: Joi.string().allow('', null),
  }),
};

const bulkGenerateVouchers = {
  body: Joi.object().keys({
    allClasses: Joi.boolean().default(false),
    classId: Joi.string()
      .custom(objectId)
      .when('allClasses', { is: true, then: Joi.optional().allow(null, ''), otherwise: Joi.required() }),
    feeStructureId: Joi.string().custom(objectId).allow(null, '').optional(),
    month: Joi.string().valid(...MONTHS).required(),
    year: Joi.number().integer().min(2000).max(2100).required(),
    feeSource: Joi.string().valid('fee_structure', 'admission_form', 'mixed').default('fee_structure'),
  }),
};

const getVouchers = {
  query: Joi.object().keys({
    classId: Joi.string().custom(objectId),
    studentId: Joi.string().custom(objectId),
    examId: Joi.string().custom(objectId),
    voucherType: Joi.string().valid('monthly', 'exam', 'admission', 'misc'),
    month: Joi.string().valid(...MONTHS),
    year: Joi.number().integer(),
    status: Joi.string().valid('unpaid', 'partial', 'paid', 'overdue', 'cancelled'),
    search: Joi.string().allow(''),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getVoucher = {
  params: Joi.object().keys({
    voucherId: Joi.string().custom(objectId).required(),
  }),
};

const getStudentVouchers = {
  params: Joi.object().keys({
    studentId: Joi.string().custom(objectId).required(),
  }),
};

const payVoucher = {
  params: Joi.object().keys({
    voucherId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    amount: Joi.number().min(1).required(),
    paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other', 'credit_wallet'),
    categoryId: Joi.string().custom(objectId).allow(null, ''),
    remarks: Joi.string().allow('', null),
  }),
};

const updateVoucher = {
  params: Joi.object().keys({
    voucherId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      discount: Joi.number().min(0),
      fine: Joi.number().min(0),
      dueDate: Joi.date().iso(),
      status: Joi.string().valid('unpaid', 'partial', 'paid', 'overdue', 'cancelled'),
      remarks: Joi.string().allow('', null),
    })
    .min(1),
};

const deleteVoucher = {
  params: Joi.object().keys({
    voucherId: Joi.string().custom(objectId).required(),
  }),
};

const getVouchersForPrint = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string().custom(objectId)).min(1).required(),
    includeArrears: Joi.boolean().default(true),
  }),
};

const bulkPayStudentVouchers = {
  params: Joi.object().keys({
    studentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    amount: Joi.number().min(1).required(),
    paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other', 'credit_wallet'),
    categoryId: Joi.string().custom(objectId).allow(null, ''),
    remarks: Joi.string().allow('', null),
  }),
};

const recordAdvancePayment = {
  params: Joi.object().keys({
    studentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    amount: Joi.number().min(1).required(),
    paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other', 'credit_wallet'),
    categoryId: Joi.string().custom(objectId).allow(null, ''),
    remarks: Joi.string().allow('', null),
  }),
};

const bulkGenerateExamVouchers = {
  body: Joi.object().keys({
    examId: Joi.string().custom(objectId).required(),
    amount: Joi.number().min(1),
    dueDate: Joi.date().iso(),
  }),
};

const bulkDeleteVouchers = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string().custom(objectId)).min(1),
    deleteAllMatching: Joi.boolean(),
    month: Joi.string().valid(...MONTHS),
    year: Joi.number().integer().min(2000).max(2100),
    classId: Joi.string().custom(objectId),
    status: Joi.string().valid('unpaid', 'partial', 'paid', 'overdue', 'cancelled'),
    voucherType: Joi.string().valid('monthly', 'exam', 'admission', 'misc'),
    search: Joi.string().allow(''),
  }).or('ids', 'deleteAllMatching'),
};

const clearCreditWallets = {
  query: Joi.object().keys({
    classId: Joi.string().custom(objectId),
  }),
};

module.exports = {
  createVoucher,
  bulkGenerateVouchers,
  bulkGenerateExamVouchers,
  getVouchers,
  getVoucher,
  getStudentVouchers,
  payVoucher,
  bulkPayStudentVouchers,
  recordAdvancePayment,
  updateVoucher,
  deleteVoucher,
  bulkDeleteVouchers,
  clearCreditWallets,
  getVouchersForPrint,
};
