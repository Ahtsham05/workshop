/**
 * Permission sets for lookups that many screens share. A role that can create an invoice
 * must be able to pick the account the money goes into, even without the Bank Accounts
 * page itself — so these reads accept any permission whose screen needs them.
 */

/** Money moves in or out on these screens, so they list the wallets (bank/cash accounts). */
const WALLET_READERS = [
  'viewWallet',
  'manageWallet',
  'createInvoices',
  'editInvoices',
  'createPurchases',
  'editPurchases',
  'createSalesReturns',
  'createPurchaseReturns',
  'viewPayments',
  'createPayments',
  'editPayments',
  'viewPaymentVouchers',
  'managePaymentVouchers',
  'viewAccounting',
  'manageExpenses',
  'manageLedgers',
  'managePersonalWallet',
  'viewBankReconciliation',
  'manageBankReconciliation',
  'viewWalletReports',
  'viewCashBook',
  'viewCashRegister',
  'manageCommissionPayments',
  'managePartnerPayments',
  'processPayroll',
  'buyUsedPhones',
  'sellUsedPhones',
  'buyNewPhones',
  'sellNewPhones',
  'manageLoadManagement',
  'manageSimSales',
  'manageCashManagement',
  'manageRepairs',
  'manageServices',
  'manageBillPayments',
  'manageInstallments',
  // Mobile-shop pages show account names and balances on their records.
  'viewLoadManagement',
  'viewCashManagement',
  'viewSimSales',
  'viewRepairs',
  'viewServices',
  'viewBillPayments',
  'viewInstallments',
  'viewUsedPhones',
  'viewNewPhones',
  'getPayroll',
];

/** Serial / IMEI pickers on sales, transfers, adjustments and warranty claims. */
const SERIAL_PICKERS = [
  'viewImeiTracking',
  'manageImeiTracking',
  'viewProducts',
  'createInvoices',
  'editInvoices',
  'createSalesReturns',
  'createPurchases',
  'editPurchases',
  'createPurchaseReturns',
  'manageStockTransfers',
  'manageStockAdjustments',
  'manageWarrantyClaims',
  'sellNewPhones',
  'sellUsedPhones',
];

/** Customer pickers: sales, returns, payments/ledgers, leads, quotations, mobile-shop sales. */
const CUSTOMER_PICKERS = [
  'viewCustomers',
  'createCustomers',
  'createInvoices',
  'editInvoices',
  'createSalesReturns',
  'viewPayments',
  'createPayments',
  'manageLedgers',
  'viewAccounting',
  'managePaymentVouchers',
  'createLeads',
  'editLeads',
  'convertLeads',
  'manageLoadManagement',
  'manageCashManagement',
  'manageSimSales',
  'manageRepairs',
  'manageServices',
  'manageBillPayments',
  'manageInstallments',
  'sellUsedPhones',
  'sellNewPhones',
  'buyUsedPhones',
  // Lists that show and filter by customer.
  'viewInvoices',
  'viewSalesReturns',
  'viewLoadManagement',
  'viewCashManagement',
  'viewSimSales',
  'viewRepairs',
  'viewServices',
  'viewBillPayments',
  'viewInstallments',
  'viewUsedPhones',
  'viewNewPhones',
];

/** Supplier pickers: purchases, orders, returns, payments/ledgers, expenses, phone buying. */
const SUPPLIER_PICKERS = [
  'viewSuppliers',
  'createSuppliers',
  'createPurchases',
  'editPurchases',
  'createPurchaseOrders',
  'editPurchaseOrders',
  'createPurchaseReturns',
  'viewPayments',
  'createPayments',
  'manageLedgers',
  'viewAccounting',
  'manageExpenses',
  'managePaymentVouchers',
  'buyNewPhones',
  'buyUsedPhones',
  'manageLoadManagement',
  // Lists that show and filter by supplier.
  'viewPurchases',
  'viewPurchaseOrders',
  'viewPurchaseReturns',
  'viewPriceUpdates',
  'managePriceUpdates',
  'viewLoadManagement',
  'viewCashManagement',
  'viewUsedPhones',
  'viewNewPhones',
];

/** Salesman pickers on sales and mobile-shop jobs (commission is credited per record). */
const SALESMAN_PICKERS = [
  'viewSalesmen',
  'viewInvoices',
  'createInvoices',
  'editInvoices',
  'viewRepairs',
  'manageRepairs',
  'viewServices',
  'manageServices',
  'viewSimSales',
  'manageSimSales',
  'viewLoadManagement',
  'manageLoadManagement',
  'viewCommissionRules',
  'viewCommissionLedger',
  'viewReports',
];

/** Category / brand lists used to filter and edit products. */
const CATALOG_TAXONOMY_READERS = ['viewProducts', 'createProducts', 'editProducts', 'viewBarcodeGenerator'];

/** Screens with a "Send SMS" button: invoices, contacts, ledgers, purchase orders, mobile-shop records. */
const SMS_SENDERS = [
  'viewSmsLog',
  'createInvoices',
  'editInvoices',
  'viewInvoices',
  'viewCustomers',
  'viewSuppliers',
  'viewAccounting',
  'viewPurchaseOrders',
  'viewLoadManagement',
  'viewSimSales',
  'viewRepairs',
  'viewServices',
  'viewBillPayments',
  'viewInstallments',
];

/** WhatsApp "send" buttons live on the same screens, plus the inbox and school fee pages. */
const WHATSAPP_SENDERS = [
  ...SMS_SENDERS,
  'viewWhatsapp',
  'manageWhatsapp',
  'printInvoices',
  'viewFeeAccounting',
  'manageFeeAccounting',
];

module.exports = {
  CATALOG_TAXONOMY_READERS,
  SALESMAN_PICKERS,
  CUSTOMER_PICKERS,
  SUPPLIER_PICKERS,
  WALLET_READERS,
  SERIAL_PICKERS,
  SMS_SENDERS,
  WHATSAPP_SENDERS,
};
