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
 * Proxies English → the business's native language (Urdu, Arabic, Hindi, …).
 */
const translateNameToNative = catchAsync(async (req, res) => {
  const translated = await nameTranslateService.translateEnglishToNative(req.body.text, req.body.target);
  res.send({ translated });
});

/**
 * Proxies native-language → English romanization for display names (Urdu when `source` is omitted).
 */
const translateNameToEnglish = catchAsync(async (req, res) => {
  const { text, source } = req.body;
  const translated =
    source && source !== 'ur'
      ? await nameTranslateService.translateNativeToEnglish(text, source)
      : await nameTranslateService.translateUrduToEnglish(text);
  res.send({ translated });
});

module.exports = {
  translateNameToUrdu,
  translateNameToNative,
  translateNameToEnglish,
};
