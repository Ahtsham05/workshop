const catchAsync = require('../utils/catchAsync');

const latinLetters = /[A-Za-z]/;
const arabicScript =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Proxies English → Urdu for display names (uses MyMemory public API; rate limits apply).
 */
const translateNameToUrdu = catchAsync(async (req, res) => {
  const text = String(req.body.text ?? '')
    .trim()
    .slice(0, 500);
  if (!text) {
    return res.send({ translated: '' });
  }

  if (!latinLetters.test(text) && arabicScript.test(text)) {
    return res.send({ translated: text });
  }
  if (!latinLetters.test(text)) {
    return res.send({ translated: '' });
  }

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    text,
  )}&langpair=en|ur`;
  const response = await fetch(url);
  if (!response.ok) {
    return res.send({ translated: '' });
  }
  const data = await response.json();
  let translated = String(data.responseData?.translatedText ?? '').trim();
  if (translated && translated.toLowerCase() === text.toLowerCase()) {
    translated = '';
  }
  res.send({ translated });
});

module.exports = {
  translateNameToUrdu,
};
