/**
 * Who may do what on stock counts. 'countStock' is for floor staff (enter counts, start the
 * day's scheduled cycle count); 'approveStockCounts' is for whoever signs off variances.
 * Roles that already manage products keep working without being edited: editProducts
 * counts as both, viewProducts can look.
 */
const STOCK_COUNT_PERMISSIONS = {
  view: ['viewProducts', 'countStock', 'approveStockCounts'],
  count: ['countStock', 'approveStockCounts', 'editProducts'],
  approve: ['approveStockCounts', 'editProducts'],
};

module.exports = { STOCK_COUNT_PERMISSIONS };
