const express = require('express');
const validate = require('../../middlewares/validate');
const { websiteKeyAuth, websiteRateLimit } = require('../../middlewares/websiteKeyAuth');
const websiteConnectionValidation = require('../../validations/websiteConnection.validation');
const websiteConnectionController = require('../../controllers/websiteConnection.controller');

/**
 * Storefront API — read-only inventory for the shop's own website, authenticated by a
 * website API key (Settings → Website Connections), never by a staff login.
 *
 *   GET /v1/storefront              which connection/business this key is, and its currency
 *   GET /v1/storefront/products     the catalog, paged (?page, ?limit≤200, ?search, ?inStock)
 *   GET /v1/storefront/products/:ref  one product by id, SKU or barcode
 *   GET /v1/storefront/stock        availability only (?ids=… or ?codes=… , ≤200) — poll this
 *
 * Responses carry an ETag; send it back as If-None-Match to get 304 when nothing changed.
 */
const router = express.Router();
router.use(websiteRateLimit, websiteKeyAuth);

router.get('/', websiteConnectionController.storefrontInfo);
router.get('/products', validate(websiteConnectionValidation.listProducts), websiteConnectionController.storefrontProducts);
router.get('/products/:ref', validate(websiteConnectionValidation.getProduct), websiteConnectionController.storefrontProduct);
router.get('/stock', validate(websiteConnectionValidation.listStock), websiteConnectionController.storefrontStock);

module.exports = router;
