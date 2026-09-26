const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

/**
 * Zod counterpart of validate.js (which stays Joi for the rest of the app). Billing endpoints
 * validate with Zod. Parsed values replace req.params / req.query / req.body, so unknown keys
 * are stripped and coercions (multipart strings → numbers/dates) are applied.
 * @param {{ params?: ZodSchema, query?: ZodSchema, body?: ZodSchema }} schemas
 */
const validateZod = (schemas) => (req, res, next) => {
  const issues = [];
  ['params', 'query', 'body'].forEach((part) => {
    if (!schemas[part]) return;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (result.success) {
      req[part] = result.data;
    } else {
      result.error.issues.forEach((issue) => issues.push(`${[part, ...issue.path].join('.')}: ${issue.message}`));
    }
  });
  if (issues.length) {
    const err = new ApiError(httpStatus.BAD_REQUEST, issues.join(', '));
    err.errorCode = 'VALIDATION_FAILED';
    err.details = { issues };
    return next(err);
  }
  return next();
};

module.exports = validateZod;
