const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const validate = require('../../middlewares/validate');
const purchaseValidation = require('../../validations/purchase.validation');
const invoiceValidation = require('../../validations/invoice.validation');
const newPhoneValidation = require('../../validations/newPhone.validation');
const newPhoneController = require('../../controllers/newPhone.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'), checkFeatureAccess('new_phones'));

router.get('/stats', auth('viewNewPhones'), validate(newPhoneValidation.getStats), newPhoneController.getStats);

// Thin, permission-scoped wrappers around the generic Purchase/Invoice flow — see
// newPhone.service.js for why these exist instead of calling /purchases and /invoices
// directly (buyNewPhones/sellNewPhones would otherwise never be enforced).
router.post('/purchases', auth('buyNewPhones'), validate(purchaseValidation.createPurchase), newPhoneController.createPurchase);
router.post('/sales', auth('sellNewPhones'), validate(invoiceValidation.createInvoice), newPhoneController.createSale);
router.delete('/purchases/:purchaseId', auth('deleteNewPhones'), validate(purchaseValidation.deletePurchase), newPhoneController.deletePurchase);

module.exports = router;
