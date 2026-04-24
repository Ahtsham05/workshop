const httpStatus = require('http-status');
const ApiError = require('./ApiError');
const { UNITS } = require('../config/units');
const { normalizeBusinessType } = require('../config/businessTypes');

const DEFAULT_PRECISION = 6;

const STANDARD_CONVERSIONS = {
  [`${UNITS.DOZEN}:${UNITS.PCS}`]: 12,
  [`${UNITS.PCS}:${UNITS.DOZEN}`]: 1 / 12,
};

const normalizeUnit = (unit, fallback = UNITS.PCS) => {
  if (!unit) {
    return fallback;
  }

  return String(unit).trim().toLowerCase();
};

const roundQuantity = (value, precision = DEFAULT_PRECISION) => {
  return Number(Number(value).toFixed(precision));
};

const getMatchingProductRule = ({ product, fromUnit, toUnit, businessType }) => {
  const rules = Array.isArray(product?.unitConversions) ? product.unitConversions : [];
  if (rules.length === 0) {
    return null;
  }

  const normalizedBusinessType = businessType ? normalizeBusinessType(businessType) : null;
  const matchedRules = rules.filter((rule) => {
    if (!rule || rule.isActive === false) {
      return false;
    }

    const sourceUnit = normalizeUnit(rule.fromUnit);
    const targetUnit = normalizeUnit(rule.toUnit);

    return sourceUnit === fromUnit && targetUnit === toUnit;
  });

  if (matchedRules.length === 0) {
    return null;
  }

  if (normalizedBusinessType) {
    const businessTypeRule = matchedRules.find((rule) => {
      const allowedTypes = Array.isArray(rule.businessTypes)
        ? rule.businessTypes.map((type) => normalizeBusinessType(type))
        : [];

      return allowedTypes.includes(normalizedBusinessType);
    });

    if (businessTypeRule) {
      return businessTypeRule;
    }
  }

  const genericRule = matchedRules.find((rule) => !rule.businessTypes || rule.businessTypes.length === 0);
  return genericRule || matchedRules[0];
};

const getConversionFactor = ({ product, fromUnit, toUnit, conversionFactor, businessType }) => {
  if (fromUnit === toUnit) {
    return 1;
  }

  const explicitFactor = Number(conversionFactor);
  if (Number.isFinite(explicitFactor) && explicitFactor > 0) {
    return explicitFactor;
  }

  const productRule = getMatchingProductRule({ product, fromUnit, toUnit, businessType });
  if (productRule && Number(productRule.factor) > 0) {
    return Number(productRule.factor);
  }

  const key = `${fromUnit}:${toUnit}`;
  if (STANDARD_CONVERSIONS[key]) {
    return STANDARD_CONVERSIONS[key];
  }

  throw new ApiError(
    httpStatus.BAD_REQUEST,
    `Missing unit conversion from ${fromUnit} to ${toUnit}. Configure product unit conversions or provide conversionFactor.`
  );
};

const toStockQuantity = ({ product, item, businessType }) => {
  const quantity = Number(item?.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Quantity must be greater than 0');
  }

  const stockUnit = normalizeUnit(product?.unit, UNITS.PCS);
  const lineUnit = normalizeUnit(item?.unit, stockUnit);
  const factor = getConversionFactor({
    product,
    fromUnit: lineUnit,
    toUnit: stockUnit,
    conversionFactor: item?.conversionFactor,
    businessType,
  });

  return {
    lineUnit,
    stockUnit,
    conversionFactor: factor,
    stockQuantity: roundQuantity(quantity * factor),
  };
};

const getStockQuantityFromItem = ({ product, item, businessType }) => {
  const explicitStockQuantity = Number(item?.stockQuantity);
  if (Number.isFinite(explicitStockQuantity) && explicitStockQuantity > 0) {
    return {
      lineUnit: normalizeUnit(item?.unit, normalizeUnit(product?.unit, UNITS.PCS)),
      stockUnit: normalizeUnit(product?.unit, UNITS.PCS),
      conversionFactor: Number(item?.conversionFactor) > 0 ? Number(item?.conversionFactor) : 1,
      stockQuantity: explicitStockQuantity,
    };
  }

  return toStockQuantity({ product, item, businessType });
};

module.exports = {
  normalizeUnit,
  toStockQuantity,
  getStockQuantityFromItem,
};
