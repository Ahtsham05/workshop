const catchAsync = require('../utils/catchAsync');
const customerProfitService = require('../services/customerProfit.service');

/** Customer profitability — see services/customerProfit.service.js. */
const tenant = (req) => ({ organizationId: req.organizationId, branchId: req.branchId });

const getRanking = catchAsync(async (req, res) => {
  res.send(await customerProfitService.getRanking(tenant(req), req.query));
});

const getCustomerDetail = catchAsync(async (req, res) => {
  res.send(await customerProfitService.getCustomerDetail(tenant(req), req.params.customerId, req.query));
});

module.exports = { getRanking, getCustomerDetail };
