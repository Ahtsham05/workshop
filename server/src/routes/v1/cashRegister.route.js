const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const cashRegisterValidation = require('../../validations/cashRegister.validation');
const cashRegisterController = require('../../controllers/cashRegister.controller');

const router = express.Router();

router.use(auth(), branchScope());

router
  .route('/')
  .get(auth('viewCashRegister'), cashRegisterController.getRegister)
  .put(auth('manageCashRegister'), validate(cashRegisterValidation.saveRegister), cashRegisterController.saveRegister);

router.route('/clear').post(auth('manageCashRegister'), cashRegisterController.clearRegister);

router.route('/movements').get(auth('viewCashRegister'), validate(cashRegisterValidation.getMovements), cashRegisterController.getMovements);

router.route('/history').get(auth('viewCashRegister'), validate(cashRegisterValidation.getHistory), cashRegisterController.getHistory);

router
  .route('/history/:id')
  .delete(auth('manageCashRegister'), validate(cashRegisterValidation.deleteHistoryEntry), cashRegisterController.deleteHistoryEntry);

module.exports = router;
