const catchAsync = require('../utils/catchAsync');
const nameTranslateService = require('../services/nameTranslate.service');

/**
 * Proxies English → Urdu for display names (multi-provider cascade; see nameTranslate.service).
 */
const translateNameToUrdu = catchAsync(async (req, res) => {
  const translated = await nameTranslateService.translateEnglishToUrdu(req.body.text);
  res.send({ translated });
});

/**
 * Proxies Urdu → English romanization for display names.
 */
const translateNameToEnglish = catchAsync(async (req, res) => {
  const translated = await nameTranslateService.translateUrduToEnglish(req.body.text);
  res.send({ translated });
});

module.exports = {
  translateNameToUrdu,
  translateNameToEnglish,
};
