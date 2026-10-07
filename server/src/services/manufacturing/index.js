/**
 * Manufacturing module services — see config/manufacturing.js for the shared constants
 * and docs/manufacturing/phase-1.md (repo root) for the design notes.
 */
const settings = require('./settings.service');
const bom = require('./bom.service');
const productionOrder = require('./productionOrder.service');
const execution = require('./execution.service');
const products = require('./products.service');
const dashboard = require('./dashboard.service');
const analytics = require('./analytics.service');
const orderList = require('./orderList.service');
const traceability = require('./traceability.service');
const demoData = require('./demoData.service');

module.exports = {
  settings,
  bom,
  productionOrder,
  execution,
  products,
  dashboard,
  analytics,
  orderList,
  traceability,
  demoData,
};
