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
const purchaseOrderRoute = require('./purchaseOrder.route');
const invoiceRoute = require('./invoice.route');
const expenseRoute = require('./expense.route');
const expenseCategoryRoute = require('./expenseCategory.route');
const customerAccountTypeRoute = require('./customerAccountType.route');
const customerLedgerRoute = require('./customerLedger.route');
const supplierLedgerRoute = require('./supplierLedger.route');
const personalLedgerRoute = require('./personalLedger.route');
const dashboardRoute = require('./dashboard.route');
const reportsRoute = require('./reports.route');
const companyRoute = require('./company.route');
const unitsRoute = require('./units.route');
const organizationRoute = require('./organization.route');
const branchRoute = require('./branch.route');
const membershipRoute = require('./membership.route');
const walletRoute = require('./wallet.route');
const loadPurchaseRoute = require('./loadPurchase.route');
const loadTransactionRoute = require('./loadTransaction.route');
const simSaleRoute = require('./simSale.route');
const imeiRoute = require('./imei.route');
const cashWithdrawalRoute = require('./cashWithdrawal.route');
const repairJobRoute = require('./repairJob.route');
const serviceRoute = require('./service.route');
const cashBookRoute = require('./cashBook.route');
const cashRegisterRoute = require('./cashRegister.route');
const mobileDashboardRoute = require('./mobileDashboard.route');
const mobileReportsRoute = require('./mobileReports.route');
const salesReturnRoute = require('./salesReturn.route');
const purchaseReturnRoute = require('./purchaseReturn.route');
const utilityCompanyRoute = require('./utilityCompany.route');
const billPaymentRoute = require('./billPayment.route');
const repairStockItemRoute = require('./repairStockItem.route');
const installmentRoute = require('./installment.route');
const { trialGuard, enforceTrialStatus } = require('../../middlewares/trialGuard');

// HR Routes
const employeeRoute = require('./employee.route');
const departmentRoute = require('./department.route');
const attendanceRoute = require('./attendance.route');
const leaveRoute = require('./leave.route');
const payrollRoute = require('./payroll.route');
const employeeLedgerRoute = require('./employeeLedger.route');

// School Routes
const schoolClassRoute = require('./schoolClass.route');
const sectionRoute = require('./section.route');
const subjectRoute = require('./subject.route');
const studentRoute = require('./student.route');
const teacherRoute = require('./teacher.route');
const schoolAttendanceRoute = require('./schoolAttendance.route');
const examRoute = require('./exam.route');
const markRoute = require('./mark.route');
const schoolFeeRoute = require('./schoolFee.route');
const timetableRoute = require('./timetable.route');
const timeSlotRoute = require('./timeSlot.route');
const schoolDashboardRoute = require('./schoolDashboard.route');
const visitorRoute = require('./visitor.route');
const diaryRoute = require('./diary.route');
const notificationRoute = require('./notification.route');
const pushSubscriptionRoute = require('./pushSubscription.route');
const schoolReportRoute = require('./schoolReport.route');
const teacherPortalRoute = require('./teacherPortal.route');
const parentPortalRoute = require('./parentPortal.route');
const teacherAttendanceRoute = require('./teacherAttendance.route');
const teacherLeaveRoute = require('./teacherLeave.route');
const teacherPayrollRoute = require('./teacherPayroll.route');
const teacherAssignmentRoute = require('./teacherAssignment.route');

// School Accounting Routes
const feeCategoryRoute = require('./feeCategory.route');
const schoolTransactionRoute = require('./schoolTransaction.route');
const feeStructureRoute = require('./feeStructure.route');
const feeVoucherRoute = require('./feeVoucher.route');
const feePaymentRequestRoute = require('./feePaymentRequest.route');
const schoolAccountingRoute = require('./schoolAccounting.route');
const schoolReportsEngineRoute = require('./schoolReportsEngine.route');
const accountsSystemRoute = require('./accountsSystem.route');
const whatsappRoute = require('./whatsapp.route');
const whatsappCloudRoute = require('./whatsappCloud.route');
const whatsappEnterpriseRoute = require('./whatsappEnterprise.route');
const restaurantRoute = require('./restaurant.route');
const restaurantPublicRoute = require('./restaurantPublic.route');

// Subscription & Admin Routes
const paymentRoute = require('./payment.route');
const adminRoute = require('./admin.route');

const translateRoute = require('./translate.route');
const syncRoute = require('./sync.route');
const systemRoute = require('./system.route');

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
    path: '/translate',
    route: translateRoute,
  },
  {
    path: '/sync',
    route: syncRoute,
  },
  {
    path: '/system',
    route: systemRoute,
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
    path: '/purchase-orders',
    route: purchaseOrderRoute
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
    path: '/expense-categories',
    route: expenseCategoryRoute
  },
  {
    path: '/customer-account-types',
    route: customerAccountTypeRoute
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
    path: '/personal-ledger',
    route: personalLedgerRoute
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
  {
    path: '/wallets',
    route: walletRoute,
  },
  {
    path: '/load-purchases',
    route: loadPurchaseRoute,
  },
  {
    path: '/load-transactions',
    route: loadTransactionRoute,
  },
  {
    path: '/sim-sales',
    route: simSaleRoute,
  },
  {
    path: '/imeis',
    route: imeiRoute,
  },
  {
    path: '/cash-withdrawals',
    route: cashWithdrawalRoute,
  },
  {
    path: '/repairs',
    route: repairJobRoute,
  },
  {
    path: '/services',
    route: serviceRoute,
  },
  {
    path: '/repair-stock',
    route: repairStockItemRoute,
  },
  {
    path: '/installments',
    route: installmentRoute,
  },
  {
    path: '/cash-book',
    route: cashBookRoute,
  },
  {
    path: '/cash-register',
    route: cashRegisterRoute,
  },
  {
    path: '/mobile-dashboard',
    route: mobileDashboardRoute,
  },
  {
    path: '/mobile-reports',
    route: mobileReportsRoute,
  },
  {
    path: '/sales-returns',
    route: salesReturnRoute,
  },
  {
    path: '/purchase-returns',
    route: purchaseReturnRoute,
  },
  // Utility Bill Routes
  {
    path: '/utility-companies',
    route: utilityCompanyRoute,
  },
  {
    path: '/bill-payments',
    route: billPaymentRoute,
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
  {
    path: '/employee-ledger',
    route: employeeLedgerRoute
  },
  // School Routes
  {
    path: '/school-classes',
    route: schoolClassRoute
  },
  {
    path: '/sections',
    route: sectionRoute
  },
  {
    path: '/subjects',
    route: subjectRoute
  },
  {
    path: '/students',
    route: studentRoute
  },
  {
    path: '/teachers',
    route: teacherRoute
  },
  {
    path: '/school-attendance',
    route: schoolAttendanceRoute
  },
  {
    path: '/exams',
    route: examRoute
  },
  {
    path: '/marks',
    route: markRoute
  },
  {
    path: '/school-fees',
    route: schoolFeeRoute
  },
  {
    path: '/timetables',
    route: timetableRoute
  },
  {
    path: '/time-slots',
    route: timeSlotRoute
  },
  {
    path: '/school-dashboard',
    route: schoolDashboardRoute
  },
  {
    path: '/visitors',
    route: visitorRoute
  },
  {
    path: '/diaries',
    route: diaryRoute
  },
  {
    path: '/notifications',
    route: notificationRoute
  },
  {
    path: '/push',
    route: pushSubscriptionRoute
  },
  {
    path: '/school-reports',
    route: schoolReportRoute
  },
  {
    path: '/teacher-portal',
    route: teacherPortalRoute
  },
  {
    path: '/parent-portal',
    route: parentPortalRoute
  },
  // Teacher Management Routes
  {
    path: '/teacher-attendance',
    route: teacherAttendanceRoute,
  },
  {
    path: '/teacher-leaves',
    route: teacherLeaveRoute,
  },
  {
    path: '/teacher-payroll',
    route: teacherPayrollRoute,
  },
  {
    path: '/teacher-assignments',
    route: teacherAssignmentRoute,
  },
  // School Accounting Routes
  {
    path: '/fee-categories',
    route: feeCategoryRoute,
  },
  {
    path: '/school-transactions',
    route: schoolTransactionRoute,
  },
  {
    path: '/fee-structures',
    route: feeStructureRoute,
  },
  {
    path: '/fee-vouchers',
    route: feeVoucherRoute,
  },
  {
    path: '/fee-payment-requests',
    route: feePaymentRequestRoute,
  },
  {
    path: '/school-accounting',
    route: schoolAccountingRoute,
  },
  {
    path: '/school-reports-engine',
    route: schoolReportsEngineRoute,
  },
  {
    path: '/accounts-system',
    route: accountsSystemRoute,
  },
  {
    path: '/whatsapp',
    route: whatsappRoute,
  },
  {
    path: '/whatsapp-cloud',
    route: whatsappCloudRoute,
  },
  {
    path: '/whatsapp-cloud',
    route: whatsappEnterpriseRoute,
  },
  {
    path: '/restaurant',
    route: restaurantRoute,
  },
  {
    path: '/public/restaurant',
    route: restaurantPublicRoute,
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
  '/sync',
  '/system',
  '/customers',
  '/suppliers',
  '/purchases',
  '/purchase-orders',
  '/invoices',
  '/expenses',
  '/customer-ledger',
  '/supplier-ledger',
  '/personal-ledger',
  '/dashboard',
  '/reports',
  '/company',
  '/units',
  '/organizations',
  '/branches',
  '/memberships',
  '/wallets',
  '/load-purchases',
  '/load-transactions',
  '/repairs',
  '/repair-stock',
  '/installments',
  '/cash-book',
  '/cash-register',
  '/mobile-dashboard',
  '/mobile-reports',
  '/sales-returns',
  '/purchase-returns',
  '/utility-companies',
  '/bill-payments',
  '/employees',
  '/departments',
  '/attendance',
  '/leaves',
  '/payroll',
  '/employee-ledger',
  '/school-classes',
  '/sections',
  '/subjects',
  '/students',
  '/teachers',
  '/school-attendance',
  '/exams',
  '/marks',
  '/school-fees',
  '/fee-payment-requests',
  '/timetables',
  '/school-dashboard',
  '/visitors',
  '/diaries',
  '/notifications',
  '/teacher-attendance',
  '/teacher-leaves',
  '/teacher-payroll',
  '/whatsapp',
  '/whatsapp-cloud',
  '/admin',
  '/restaurant',
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
