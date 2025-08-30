const allRoles = {
  user: ['getProducts','getUsers','getSuppliers','getCustomers','getPurchases','getSales','getInvoices','getReturns','getTransactions','getAccounts','getMobileRepairs','getCategories'],
  admin: ['getUsers', 'manageUsers', 'getProducts', 'manageProducts', 'getCategories', 'manageCategories', 'getSuppliers', 'manageSuppliers', 'getCustomers', 'manageCustomers','getPurchases', 'managePurchases', 'getSales', 'manageSales', 'getInvoices', 'manageInvoices', 'getReturns', 'createReturn', 'manageReturns', 'approveReturns', 'processReturns', 'getTransactions', 'manageTransactions', 'getAccounts', 'manageAccounts', 'getLedger','manageMobileRepairs','getMobileRepairs'],
};

const roles = Object.keys(allRoles);
const roleRights = new Map(Object.entries(allRoles));

module.exports = {
  roles,
  roleRights,
};
