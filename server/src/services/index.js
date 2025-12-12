// const { model } = require('mongoose');

module.exports.authService = require('./auth.service.js');
module.exports.emailService = require('./email.service.js');
module.exports.tokenService = require('./token.service.js');
module.exports.userService = require('./user.service.js');
module.exports.roleService = require('./role.service.js');
module.exports.productService = require('./product.service.js');
module.exports.categoryService = require('./category.service.js');
module.exports.customerService = require('./customer.service.js');
module.exports.supplierService = require('./supplier.service.js');
module.exports.purchaseService = require('./purchase.service.js');
module.exports.invoiceService = require('./invoice.service.js');
module.exports.expenseService = require('./expense.service.js');
module.exports.customerLedgerService = require('./customerLedger.service.js');
module.exports.supplierLedgerService = require('./supplierLedger.service.js');
module.exports.companyService = require('./company.service.js');