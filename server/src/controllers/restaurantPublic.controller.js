const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { restaurantService } = require('../services');

/**
 * Guest QR flow — no authentication.
 */
const getMenuByQr = catchAsync(async (req, res) => {
  const { table, branch, organization } = await restaurantService.getTableByQrToken(req.params.qrToken);
  const products = await restaurantService.listProductsForBranch(table.branchId);
  res.send({
    venue: {
      name: organization?.name,
      logo: organization?.logo,
      branchName: branch?.name,
    },
    table: {
      id: table.id,
      label: table.label,
      floorName: table.floorId?.name,
    },
    products,
  });
});

const placeQrOrder = catchAsync(async (req, res) => {
  const order = await restaurantService.createPublicQrOrder(req.params.qrToken, req.body);
  res.status(httpStatus.CREATED).send(order);
});

module.exports = {
  getMenuByQr,
  placeQrOrder,
};
