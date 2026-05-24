const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const cashRegisterValidation = require('../../validations/cashRegister.validation');
const cashRegisterController = require('../../controllers/cashRegister.controller');

const router = express.Router();

router.use(auth(), branchScope());

router.route('/').get(cashRegisterController.getRegister).put(validate(cashRegisterValidation.saveRegister), cashRegisterController.saveRegister);

router.route('/clear').post(cashRegisterController.clearRegister);

router.route('/history').get(validate(cashRegisterValidation.getHistory), cashRegisterController.getHistory);

module.exports = router;
