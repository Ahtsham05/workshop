const summery = {

  // auth
  signup: {
    url: '/auth/register',
    method: 'post',
  },
  login: {
    url: '/auth/login',
    method: 'post',
  },
  logout: {
    url: '/auth/logout',
    method: 'post',
  },
  refreshToken: {
    url: '/auth/refresh-token',
    method: 'post',
  },
  forgotPassword: {
    url: '/auth/forgotpassword',
    method: 'post',
  },
  resetPassword: {
    url: '/auth/reset-password',
    method: 'post',
  },
  loginRefresh: {
    url: '/auth/login-refresh',
    method: 'get',
  },

  // products
  addProduct: {
    url: '/products',
    method: 'post',
  },
  updateProduct: {
    url: '/products',
    method: 'patch',
  },
  deleteProduct: {
    url: '/products',
    method: 'delete',
  },
  fetchProducts: {
    url: '/products',
    method: 'get',
  },
  fetchAllProducts : {
    url: '/products/all',
    method: 'get'
  },
  bulkUpdateProducts: {
    url: '/products/bulk-update',
    method: 'patch'
  },
  bulkAddProducts: {
    url: '/products/bulk',
    method: 'post'
  },

  // customers
  addCustomer: {
    url: '/customers',
    method: 'post',
  },
  updateCustomer: {
    url: '/customers',
    method: 'patch',
  },
  deleteCustomer: {
    url: '/customers',
    method: 'delete',
  },
  fetchCustomers: {
    url: '/customers',
    method: 'get',
  },
  fetchAllCutomers : {
    url: '/customers/all',
    method: 'get'
  },
  getCustomerSalesAndTransactions: {
    url: '/customers/ledger',
    method: 'get'
  },
  bulkAddCustomers: {
    url: '/customers/bulk',
    method: 'POST'
  },


  // suppliers
  addSupplier: {
    url: '/suppliers',
    method: 'post',
  },
  updateSupplier: {
    url: '/suppliers',
    method: 'patch',
  },
  deleteSupplier: {
    url: '/suppliers',
    method: 'delete',
  },
  fetchSuppliers: {
    url: '/suppliers',
    method: 'get',
  },
  fetchAllSuppliers: {
    url: '/suppliers/all',
    method: 'get'
  },
  getSupplierPurchaseAndTransactions: {
    url: '/suppliers/ledger',
    method: 'get'
  },
  bulkAddSuppliers: {
    url: '/suppliers/bulk',
    method: 'POST'
  },

  // categories
  addCategory: {
    url: '/categories',
    method: 'post',
  },
  updateCategory: {
    url: '/categories',
    method: 'patch',
  },
  deleteCategory: {
    url: '/categories',
    method: 'delete',
  },
  fetchCategories: {
    url: '/categories',
    method: 'get',
  },
  fetchAllCategories: {
    url: '/categories/all',
    method: 'get'
  },


  // purchases
  addPurchase: {
    url: '/purchases',
    method: 'post',
  },
  updatePurchase: {
    url: '/purchases',
    method: 'patch',
  },
  deletePurchase: {
    url: '/purchases',
    method: 'delete',
  },
  fetchPurchases: {
    url: '/purchases',
    method: 'get',
  },
  fetchPurchaseById:{
    url: '/purchases',
    method: 'get'
  },
  getPurchaseByDate: {
    url: '/purchases/date',
    method: 'get'
  },

  // expenses
  addExpense: {
    url: '/expenses',
    method: 'post',
  },
  updateExpense: {
    url: '/expenses',
    method: 'patch',
  },
  deleteExpense: {
    url: '/expenses',
    method: 'delete',
  },
  fetchExpenses: {
    url: '/expenses',
    method: 'get',
  },
  fetchExpenseSummary: {
    url: '/expenses/summary',
    method: 'get',
  },
  fetchExpenseTrends: {
    url: '/expenses/trends',
    method: 'get',
  },

  // customer ledger
  addCustomerLedgerEntry: {
    url: '/customer-ledger',
    method: 'post',
  },
  updateCustomerLedgerEntry: {
    url: '/customer-ledger',
    method: 'patch',
  },
  deleteCustomerLedgerEntry: {
    url: '/customer-ledger',
    method: 'delete',
  },
  fetchCustomerLedgerEntries: {
    url: '/customer-ledger',
    method: 'get',
  },
  fetchCustomerBalance: {
    url: '/customer-ledger/customer',
    method: 'get',
    urlSuffix: '/balance',
  },
  fetchCustomerLedgerSummary: {
    url: '/customer-ledger/customer',
    method: 'get',
    urlSuffix: '/summary',
  },
  fetchCustomersWithBalances: {
    url: '/customer-ledger/customers-with-balances',
    method: 'get',
  },

  // supplier ledger
  addSupplierLedgerEntry: {
    url: '/supplier-ledger',
    method: 'post',
  },
  updateSupplierLedgerEntry: {
    url: '/supplier-ledger',
    method: 'patch',
  },
  deleteSupplierLedgerEntry: {
    url: '/supplier-ledger',
    method: 'delete',
  },
  fetchSupplierLedgerEntries: {
    url: '/supplier-ledger',
    method: 'get',
  },
  fetchSupplierBalance: {
    url: '/supplier-ledger/supplier',
    method: 'get',
    urlSuffix: '/balance',
  },
  fetchSupplierLedgerSummary: {
    url: '/supplier-ledger/supplier',
    method: 'get',
    urlSuffix: '/summary',
  },
  fetchSuppliersWithBalances: {
    url: '/supplier-ledger/suppliers-with-balances',
    method: 'get',
  },

};

export default summery;
