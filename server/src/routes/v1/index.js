const express = require('express');
const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const productRoute = require('./product.route');
const categoryRoute = require('./category.route');
const docsRoute = require('./docs.route');
const config = require('../../config/config');
const customerRoute = require('./customer.route');
const supplierRoute = require('./supplier.route');
const purchaseRoute = require('./purchase.route');
const saleRoute = require('./sale.route');
const invoiceRoute = require('./invoice.route');
const returnRoute = require('./return.route');
const transactionRoute = require('./transaction.route');
const accountRoute = require('./account.route');
const mobileRepairRoute = require('./mobileRepair.route');
const expenseRoute = require('./expense.route');
const customerLedgerRoute = require('./customerLedger.route');
const supplierLedgerRoute = require('./supplierLedger.route');

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/users',
    route: userRoute,
  },
  {
    path: '/products',
    route: productRoute,
  },
  {
    path: '/categories',
    route: categoryRoute,
  },
  {
    path: '/customers',
    route: customerRoute,
  },
  {
    path: '/suppliers',
    route: supplierRoute,
  },
  {
    path: '/purchases',
    route: purchaseRoute
  },
  {
    path: '/sales',
    route: saleRoute
  },
  {
    path: '/invoices',
    route: invoiceRoute
  },
  {
    path: '/returns',
    route: returnRoute
  },
  {
    path: '/accounts',
    route: accountRoute,
  },
  {
    path: '/transactions',
    route: transactionRoute
  },
  {
    path: '/mobile-repairs',
    route: mobileRepairRoute
  },
  {
    path: '/expenses',
    route: expenseRoute
  },
  {
    path: '/customer-ledger',
    route: customerLedgerRoute
  },
  {
    path: '/supplier-ledger',
    route: supplierLedgerRoute
  },
];

const devRoutes = [
  // routes available only in development mode
  {
    path: '/docs',
    route: docsRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

module.exports = router;
