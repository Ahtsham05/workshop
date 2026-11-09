const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const customerProfitValidation = require('../../validations/customerProfit.validation');
const customerProfitController = require('../../controllers/customerProfit.controller');

/** Customer profitability (reveals cost) — only roles with viewCustomerProfit. */
const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .get(auth('viewCustomerProfit'), validate(customerProfitValidation.getRanking), customerProfitController.getRanking);

router
  .route('/customers/:customerId')
  .get(
    auth('viewCustomerProfit'),
    validate(customerProfitValidation.getCustomerDetail),
    customerProfitController.getCustomerDetail
  );

module.exports = router;
