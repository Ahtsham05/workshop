const Joi = require('joi');

const manualConnect = {
  body: Joi.object().keys({
    wabaId: Joi.string().required(),
    phoneNumberId: Joi.string().required(),
    accessToken: Joi.string().required(),
    displayPhoneNumber: Joi.string(),
    verifiedName: Joi.string(),
    businessAccountId: Joi.string(),
  }),
};

const sendMessage = {
  body: Joi.object().keys({
    phone: Joi.string().required(),
    text: Joi.string().required().max(4096),
    conversationId: Joi.string(),
  }),
};

const sendInvoicePdf = {
  body: Joi.object().keys({
    phone: Joi.string().required(),
    pdfBase64: Joi.string().required(),
    filename: Joi.string(),
    caption: Joi.string(),
  }),
};

const createCampaign = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    templateId: Joi.string().required(),
    templateParams: Joi.object(),
    audience: Joi.object()
      .keys({
        type: Joi.string()
          .valid('all_customers', 'all_parents', 'class', 'section', 'students', 'customers', 'custom_list')
          .required(),
        classId: Joi.string(),
        sectionId: Joi.string(),
        studentIds: Joi.array().items(Joi.string()),
        customerIds: Joi.array().items(Joi.string()),
        phones: Joi.array().items(Joi.string()),
      })
      .required(),
    scheduledAt: Joi.date(),
  }),
};

const updateConversation = {
  body: Joi.object().keys({
    status: Joi.string().valid('open', 'closed', 'spam'),
    assignedTo: Joi.string().allow(null),
    tags: Joi.array().items(Joi.string()),
  }),
};

module.exports = {
  manualConnect,
  sendMessage,
  sendInvoicePdf,
  createCampaign,
  updateConversation,
};
