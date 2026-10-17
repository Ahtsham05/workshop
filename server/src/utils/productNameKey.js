/**
 * "Same name" for duplicate detection on Add Product: case, accents, spaces and
 * punctuation don't count — "iPhone 13 Pro", "iphone-13pro" and "I PHONE 13 PRO." are one
 * key. Mirrored exactly by client/src/lib/product-similarity.ts#productNameKey (which also
 * does the fuzzy "similar" ranking); keep the two in step.
 * @param {string} name
 * @returns {string}
 */
const productNameKey = (name) =>
  String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

module.exports = { productNameKey };
