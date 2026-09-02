const catchAsync = require('../utils/catchAsync');
const localizationService = require('../services/localization.service');

const getCountries = catchAsync(async (req, res) => {
  res.send(localizationService.getCountries());
});

const getCurrencies = catchAsync(async (req, res) => {
  res.send(localizationService.getCurrencies());
});

const getCountryDefaults = catchAsync(async (req, res) => {
  res.send(localizationService.getCountryDefaults(req.params.code));
});

module.exports = {
  getCountries,
  getCurrencies,
  getCountryDefaults,
};
