const express = require('express');
const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const roleRoute = require('./role.route');
const productRoute = require('./product.route');
const categoryRoute = require('./category.route');
const docsRoute = require('./docs.route');
const config = require('../../config/config');
const customerRoute = require('./customer.route');
const supplierRoute = require('./supplier.route');
const purchaseRoute = require('./purchase.route');
const invoiceRoute = require('./invoice.route');
const expenseRoute = require('./expense.route');
const customerLedgerRoute = require('./customerLedger.route');
const supplierLedgerRoute = require('./supplierLedger.route');
const dashboardRoute = require('./dashboard.route');
const reportsRoute = require('./reports.route');
const companyRoute = require('./company.route');
const unitsRoute = require('./units.route');
const organizationRoute = require('./organization.route');
const branchRoute = require('./branch.route');
const membershipRoute = require('./membership.route');
const { trialGuard, enforceTrialStatus } = require('../../middlewares/trialGuard');

// HR Routes
const employeeRoute = require('./employee.route');
const departmentRoute = require('./department.route');
const attendanceRoute = require('./attendance.route');
const leaveRoute = require('./leave.route');
const payrollRoute = require('./payroll.route');

// Subscription & Admin Routes
const paymentRoute = require('./payment.route');
const adminRoute = require('./admin.route');

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
    path: '/roles',
    route: roleRoute,
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
    path: '/invoices',
    route: invoiceRoute
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
  {
    path: '/dashboard',
    route: dashboardRoute
  },
  {
    path: '/reports',
    route: reportsRoute
  },
  {
    path: '/company',
    route: companyRoute
  },
  {
    path: '/units',
    route: unitsRoute
  },
  {
    path: '/organizations',
    route: organizationRoute
  },
  {
    path: '/branches',
    route: branchRoute
  },
  {
    path: '/memberships',
    route: membershipRoute
  },
  // HR Routes
  {
    path: '/employees',
    route: employeeRoute
  },
  {
    path: '/departments',
    route: departmentRoute
  },
  {
    path: '/attendance',
    route: attendanceRoute
  },
  {
    path: '/leaves',
    route: leaveRoute
  },
  {
    path: '/payroll',
    route: payrollRoute
  },
  // Subscription & Admin
  {
    path: '/payments',
    route: paymentRoute,
  },
  {
    path: '/admin',
    route: adminRoute,
  },
];

const devRoutes = [
  // routes available only in development mode
  {
    path: '/docs',
    route: docsRoute,
  },
];

// Apply trial guard and enforcement to protected routes (all except auth and payments)
const protectedPaths = [
  '/users',
  '/roles',
  '/products',
  '/categories',
  '/customers',
  '/suppliers',
  '/purchases',
  '/invoices',
  '/expenses',
  '/customer-ledger',
  '/supplier-ledger',
  '/dashboard',
  '/reports',
  '/company',
  '/units',
  '/organizations',
  '/branches',
  '/memberships',
  '/employees',
  '/departments',
  '/attendance',
  '/leaves',
  '/payroll',
  '/admin',
];

// Apply trial guard + enforcement to protected routes
router.use((req, res, next) => {
  if (protectedPaths.some(path => req.path.startsWith(path))) {
    return trialGuard(req, res, () => {
      enforceTrialStatus(req, res, next);
    });
  }
  next();
});

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
