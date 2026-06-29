const Joi = require('joi');

const getAuditLogs = {
  query: Joi.object().keys({
    module: Joi.string(),
    action: Joi.string().valid('create', 'update', 'delete', 'stock_adjust', 'permission_change', 'status_change'),
    userId: Joi.string(),
    entityId: Joi.string(),
    search: Joi.string(),
    dateFrom: Joi.string(),
    dateTo: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
  }),
};

module.exports = {
  getAuditLogs,
};
