const express = require('express');
const validate = require('../../middlewares/validate');
const restaurantValidation = require('../../validations/restaurant.validation');
const restaurantPublicController = require('../../controllers/restaurantPublic.controller');

const router = express.Router();

router
  .route('/:qrToken/menu')
  .get(validate(restaurantValidation.qrToken), restaurantPublicController.getMenuByQr);

router
  .route('/:qrToken/orders')
  .post(validate(restaurantValidation.publicCreateOrder), restaurantPublicController.placeQrOrder);

module.exports = router;
