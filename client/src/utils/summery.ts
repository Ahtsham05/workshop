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

   // sales
  addSale: {
    url: '/sales',
    method: 'post',
  },
  updateSale: {
    url: '/sales',
    method: 'patch',
  },
  deleteSale: {
    url: '/sales',
    method: 'delete',
  },
  fetchSales: {
    url: '/sales',
    method: 'get',
  },
  fetchSaleById: {
    url: '/sales',
    method: 'get'
  },
  getSaleByDate: {
    url: '/sales/date',
    method: 'get'
  },
  getInvoiceNumber: {
    url: '/sales/invoice-number',
    method: 'get'
  },

  // account
  addAccount: {
    url: '/accounts',
    method: 'post',
  },
  updateAccount: {
    url: '/accounts',
    method: 'patch',
  },
  deleteAccount: {
    url: '/accounts',
    method: 'delete',
  },
  fetchAccounts: {
    url: '/accounts',
    method: 'get',
  },
  fetchAllAccounts: {
    url: '/accounts/all',
    method: 'get'
  },
  getAccountDetailsById:{
    url: '/accounts/ledger',
    method: 'get'
  },

   // transaction
  addTransaction: {
    url: '/transactions',
    method: 'post',
  },
  updateTransaction: {
    url: '/transactions',
    method: 'patch',
  },
  deleteTransaction: {
    url: '/transactions',
    method: 'delete',
  },
  fetchTransactions: {
    url: '/transactions',
    method: 'get',
  },
  fetchTransactionsByDate: {
    url: '/transactions/date',
    method: 'get'
  },

   // mobile repairs
  addMobileRepair: {
    url: '/mobile-repairs',
    method: 'post',
  },
  updateMobileRepair: {
    url: '/mobile-repairs',
    method: 'patch',
  },
  deleteMobileRepair: {
    url: '/mobile-repairs',
    method: 'delete',
  },
  fetchMobileRepairs: {
    url: '/mobile-repairs',
    method: 'get',
  },
  fetchAllMobileRepairs: {
    url: '/mobile-repairs/all',
    method: 'get',
  },

};

export default summery;
