const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const restaurantValidation = require('../../validations/restaurant.validation');
const restaurantController = require('../../controllers/restaurant.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('restaurant'));

router
  .route('/stats')
  .get(restaurantController.getStats);

router
  .route('/floors')
  .post(validate(restaurantValidation.createFloor), restaurantController.createFloor)
  .get(restaurantController.getFloors);

router
  .route('/floors/:floorId')
  .patch(validate(restaurantValidation.updateFloor), restaurantController.updateFloor)
  .delete(validate(restaurantValidation.floorId), restaurantController.deleteFloor);

router
  .route('/tables')
  .post(validate(restaurantValidation.createTable), restaurantController.createTable)
  .get(validate(restaurantValidation.getTables), restaurantController.getTables);

router
  .route('/tables/:tableId')
  .patch(validate(restaurantValidation.updateTable), restaurantController.updateTable);

router
  .route('/tables/:tableId/regenerate-qr')
  .post(validate(restaurantValidation.tableId), restaurantController.regenerateQr);

router
  .route('/delivery-customer-lookup')
  .get(
    validate(restaurantValidation.getDeliveryCustomerLookup),
    restaurantController.getDeliveryCustomerLookup,
  );

router
  .route('/orders')
  .post(validate(restaurantValidation.createOrder), restaurantController.createOrder)
  .get(validate(restaurantValidation.listOrders), restaurantController.getOrders);

router
  .route('/orders/:orderId')
  .get(validate(restaurantValidation.orderId), restaurantController.getOrder)
  .patch(validate(restaurantValidation.patchOrder), restaurantController.patchOrder);

router
  .route('/orders/:orderId/status')
  .patch(validate(restaurantValidation.patchOrderStatus), restaurantController.patchOrderStatus);

router
  .route('/orders/:orderId/lines/:lineId/kitchen')
  .patch(validate(restaurantValidation.patchLineStatus), restaurantController.patchLineStatus);

router
  .route('/reservations')
  .post(validate(restaurantValidation.createReservation), restaurantController.createReservation)
  .get(validate(restaurantValidation.listReservations), restaurantController.getReservations);

router
  .route('/reservations/:reservationId')
  .patch(validate(restaurantValidation.patchReservation), restaurantController.patchReservation);

module.exports = router;
