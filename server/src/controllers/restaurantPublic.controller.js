const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { restaurantService } = require('../services');
const { FALLBACK_CURRENCY_META, getCurrencyMeta } = require('../utils/money');

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
    currency: getCurrencyMeta(organization?.baseCurrency) || FALLBACK_CURRENCY_META,
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
