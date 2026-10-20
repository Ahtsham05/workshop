// The business's "native" second language: the script stored in every `nameUrdu` field
// (products, customers, suppliers, categories, branches, the organization itself) and the
// language native-language prints use. The field keeps its historical `nameUrdu` name
// so no data migration is needed: for a UAE business it simply holds Arabic.
//
// Organization.nativeLanguage stores 'auto' (follow countryCode, see the client's
// lib/native-language.ts COUNTRY_NATIVE_LANGUAGE map), 'none' (English only) or a code.
// Keep this list in sync with NATIVE_LANGUAGES in client/src/lib/native-language.ts.
const NATIVE_LANGUAGES = ['ur', 'ar', 'hi', 'bn', 'fa', 'tr', 'zh', 'ja', 'fr', 'de', 'es', 'it', 'nl'];

const NATIVE_LANGUAGE_SETTINGS = ['auto', 'none', ...NATIVE_LANGUAGES];

// Right-to-left scripts, so translation can skip input already written in the target script.
const SCRIPT_BY_LANGUAGE = {
  ur: /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/,
  ar: /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/,
  fa: /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/,
  hi: /[ऀ-ॿ]/,
  bn: /[ঀ-৿]/,
  zh: /[㐀-䶿一-鿿]/,
  ja: /[぀-ヿ㐀-䶿一-鿿]/,
};

module.exports = {
  NATIVE_LANGUAGES,
  NATIVE_LANGUAGE_SETTINGS,
  SCRIPT_BY_LANGUAGE,
};
