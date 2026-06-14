const catchAsync = require('../utils/catchAsync');
const { systemService } = require('../services');

const databaseHealth = catchAsync(async (_req, res) => {
  const health = await systemService.getDatabaseHealth();
  res.send(health);
});

module.exports = {
  databaseHealth,
};
