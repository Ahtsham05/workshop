const httpStatus = require('http-status');
const { UNITS, UNIT_LABELS, DEFAULT_UNIT, getAllUnits, getUnitLabel } = require('../config/units');

/**
 * Get all available units
 * @returns {Object}
 */
const getUnits = (req, res) => {
  const units = getAllUnits().map(unit => ({
    value: unit,
    label: getUnitLabel(unit),
  }));

  res.status(httpStatus.OK).json({
    units,
    defaultUnit: DEFAULT_UNIT,
  });
};

module.exports = {
  getUnits,
};
