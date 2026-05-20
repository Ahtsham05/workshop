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

const updateCloudConfig = {
  body: Joi.object()
    .keys({
      provider: Joi.string().valid('auto', 'cloud', 'web'),
      cloudAccessToken: Joi.string().max(2000).allow(''),
      cloudPhoneNumberId: Joi.string().max(64).allow(''),
      cloudApiVersion: Joi.string().max(16).allow(''),
      cloudBusinessAccountId: Joi.string().max(64).allow(''),
    })
    .min(1),
};

module.exports = {
  sendInvoicePdf,
  updateCloudConfig,
};
