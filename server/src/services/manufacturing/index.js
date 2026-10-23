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
const operations = require('./operations.service');
const orderDetail = require('./orderDetail.service');
const materialReceipt = require('./materialReceipt.service');
const materialIssueVoucher = require('./materialIssueVoucher.service');
const materialUsage = require('./materialUsage.service');
const materialIssueByMaterial = require('./materialIssueByMaterial.service');
const materialIssueEdit = require('./materialIssueEdit.service');
const productionOrderBatch = require('./productionOrderBatch.service');
const reports = require('./reports.service');
const packing = require('./packing.service');

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
  operations,
  orderDetail,
  materialReceipt,
  materialIssueVoucher,
  materialUsage,
  materialIssueByMaterial,
  materialIssueEdit,
  productionOrderBatch,
  reports,
  packing,
};
