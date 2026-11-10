/**
 * Who may do what with warehouses. The dedicated keys come from the 'warehouses' group in
 * permission-registry.js; the older product/stock keys are accepted too so roles created
 * before warehouses existed work without being edited.
 */
const WAREHOUSE_PERMISSIONS = {
  view: ['viewWarehouses', 'manageWarehouses', 'manageWarehouseTransfers', 'viewProducts', 'viewInventoryReports'],
  manage: ['manageWarehouses', 'editProducts'],
  transfer: ['manageWarehouseTransfers', 'manageWarehouses', 'manageStockTransfers', 'editProducts'],
  settings: ['editSettings', 'manageBusinessProfile', 'manageWarehouses'],
  // Reading the warehouse list (names only) — what the picker on invoices / purchases needs.
  pick: ['viewWarehouses', 'manageWarehouses', 'manageWarehouseTransfers', 'viewProducts', 'viewInventoryReports', 'viewInvoices', 'createInvoices', 'editInvoices', 'viewPurchases', 'createPurchases', 'editPurchases'],
};

module.exports = { WAREHOUSE_PERMISSIONS };
