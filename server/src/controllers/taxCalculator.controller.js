const catchAsync = require('../utils/catchAsync');
const taxCalculatorService = require('../services/taxCalculator.service');
const { getCurrencyMeta } = require('../utils/money');

// Pure preview endpoint — never writes to the database (see taxCalculator.service.js).
// Used by invoice/POS/purchase line-item screens to show live tax figures before save.
const calculateTax = catchAsync(async (req, res) => {
  const { customerId, asOfDate, taxInclusive, currency, lines, jurisdictionIds } = req.body;
  const currencyDecimalPlaces = getCurrencyMeta(currency)?.decimalPlaces ?? 2;

  const result = await taxCalculatorService.calculateTax({
    organizationId: req.organizationId,
    customerId,
    asOfDate,
    taxInclusive,
    currencyDecimalPlaces,
    lines,
    jurisdictionIds,
  });

  res.send(result);
});

module.exports = {
  calculateTax,
};
