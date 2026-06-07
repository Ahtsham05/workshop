const Joi = require('joi');

const sendInvoicePdf = {
  body: Joi.object().keys({
    phone: Joi.string().required(),
    pdfBase64: Joi.string().required(),
    filename: Joi.string().max(200),
    caption: Joi.string().max(1000).allow(''),
    invoiceNumber: Joi.string().max(100),
  }),
};

const sendDocument = {
  body: Joi.object().keys({
    phone: Joi.string().required(),
    pdfBase64: Joi.string().required(),
    filename: Joi.string().max(200),
    caption: Joi.string().max(1000).allow(''),
    mimetype: Joi.string().max(100),
  }),
};

module.exports = {
  sendInvoicePdf,
  sendDocument,
};
