const express = require('express');
const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../../utils/ApiError');
const { Warehouse, WarehouseLocation, WarehouseTransfer, WarehouseReorderRule } = require('../../models');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const v = require('../../validations/warehouse.validation');
const c = require('../../controllers/warehouse.controller');
const { WAREHOUSE_PERMISSIONS: P } = require('../../config/warehousePermissions');

const router = express.Router();
router.use(auth(), branchScope());

// A user working in a branch can only reach that branch's warehouses, bins and transfers
// by id (org-wide viewers, with no branch selected, can reach any in their organization).
// Runs after the permission check, so a refused user learns nothing about the id.
const sameBranch = (Model, param) => async (req, res, next) => {
  try {
    const value = req.params[param];
    if (!mongoose.isValidObjectId(value)) return next();
    const doc = await Model.findOne({ _id: value, organizationId: req.organizationId }).select('branchId').lean();
    if (!doc || (req.branchId && String(doc.branchId) !== String(req.branchId))) {
      return next(new ApiError(httpStatus.NOT_FOUND, 'Not found in this branch'));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};
const ownWarehouse = sameBranch(Warehouse, 'warehouseId');
const ownLocation = sameBranch(WarehouseLocation, 'locationId');
const ownTransfer = sameBranch(WarehouseTransfer, 'transferId');
const ownRule = sameBranch(WarehouseReorderRule, 'ruleId');

// Fixed paths before '/:warehouseId'.
router
  .route('/settings')
  .get(auth(...P.view, ...P.settings), c.getSettings)
  .patch(auth(...P.settings), validate(v.updateSettings), c.updateSettings);

router.get('/overview', auth(...P.view), c.getOverview);
router.get('/stock', auth(...P.view), validate(v.getStock), c.getStock);
router.post('/availability', auth(...P.view), validate(v.getAvailability), c.getAvailability);
router.get('/product/:productId', auth(...P.view), validate(v.productParam), c.getProductBreakdown);
router.get('/moves', auth(...P.view), validate(v.getMoves), c.getMoves);
router.get('/rules', auth(...P.view), validate(v.getRules), c.getRules);
router.delete('/rules/:ruleId', auth(...P.manage), ownRule, validate(v.ruleParam), c.deleteRule);
router.get('/replenishment', auth(...P.view), c.getReplenishment);
router.post('/replenishment', auth(...P.transfer), validate(v.createReplenishment), c.createReplenishment);

router
  .route('/transfers')
  .get(auth(...P.view), validate(v.getTransfers), c.getTransfers)
  .post(auth(...P.transfer), validate(v.createTransfer), c.createTransfer);
router
  .route('/transfers/:transferId')
  .get(auth(...P.view), ownTransfer, validate(v.transferParam), c.getTransfer)
  .patch(auth(...P.transfer), ownTransfer, validate(v.updateTransfer), c.updateTransfer)
  .delete(auth(...P.transfer), ownTransfer, validate(v.transferParam), c.deleteTransfer);
router.post('/transfers/:transferId/validate', auth(...P.transfer), ownTransfer, validate(v.transferParam), c.validateTransfer);
router.post('/transfers/:transferId/cancel', auth(...P.transfer), ownTransfer, validate(v.transferParam), c.cancelTransfer);

router
  .route('/locations/:locationId')
  .patch(auth(...P.manage), ownLocation, validate(v.updateLocation), c.updateLocation)
  .delete(auth(...P.manage), ownLocation, validate(v.locationParam), c.deleteLocation);

router
  .route('/')
  .get(auth(...P.pick), validate(v.listWarehouses), c.listWarehouses)
  .post(auth(...P.manage), validate(v.createWarehouse), c.createWarehouse);

router
  .route('/:warehouseId')
  .get(auth(...P.view), ownWarehouse, validate(v.warehouseParam), c.getWarehouse)
  .patch(auth(...P.manage), ownWarehouse, validate(v.updateWarehouse), c.updateWarehouse)
  .delete(auth(...P.manage), ownWarehouse, validate(v.warehouseParam), c.deleteWarehouse);
router.post('/:warehouseId/default', auth(...P.manage), ownWarehouse, validate(v.warehouseParam), c.setDefaultWarehouse);
router
  .route('/:warehouseId/locations')
  .get(auth(...P.view), ownWarehouse, validate(v.warehouseParam), c.listLocations)
  .post(auth(...P.manage), ownWarehouse, validate(v.createLocation), c.createLocation);
router.put('/:warehouseId/rules', auth(...P.manage), ownWarehouse, validate(v.upsertRules), c.upsertRules);
router.post('/:warehouseId/locations/bulk', auth(...P.manage), ownWarehouse, validate(v.createLocationsBulk), c.createLocationsBulk);

module.exports = router;
