const httpStatus = require('http-status');
const { Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeBusinessType } = require('../config/businessTypes');

const checkBusinessType = (...types) => {
  const allowedTypes = types.flat().map((type) => normalizeBusinessType(type));

  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
      }

      let resolvedBusinessType = normalizeBusinessType(req.user.businessType);

      if ((!resolvedBusinessType || resolvedBusinessType === 'other') && req.user.organizationId) {
        const organization = await Organization.findById(req.user.organizationId).select('businessType');
        if (organization) {
          resolvedBusinessType = normalizeBusinessType(organization.businessType);
          req.user.businessType = resolvedBusinessType;
        }
      }

      if (!allowedTypes.includes(resolvedBusinessType)) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Access denied for this business type');
      }

      req.businessType = resolvedBusinessType;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = checkBusinessType;
