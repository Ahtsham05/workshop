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
module.exports.personalLedgerService = require('./personalLedger.service.js');
module.exports.companyService = require('./company.service.js');
module.exports.organizationService = require('./organization.service.js');
module.exports.branchService = require('./branch.service.js');
module.exports.membershipService = require('./membership.service.js');
module.exports.paymentService = require('./payment.service.js');
module.exports.cashBookService = require('./cashBook.service.js');
module.exports.walletService = require('./wallet.service.js');
module.exports.walletEntryService = require('./walletEntry.service.js');
module.exports.loadPurchaseService = require('./loadPurchase.service.js');
module.exports.loadTransactionService = require('./loadTransaction.service.js');
module.exports.simSaleService = require('./simSale.service.js');
module.exports.cashWithdrawalService = require('./cashWithdrawal.service.js');
module.exports.repairJobService = require('./repairJob.service.js');
module.exports.serviceManagementService = require('./serviceManagement.service.js');
module.exports.repairStockItemService = require('./repairStockItem.service.js');
module.exports.mobileDashboardService = require('./mobileDashboard.service.js');
module.exports.salesReturnService = require('./salesReturn.service.js');
module.exports.purchaseReturnService = require('./purchaseReturn.service.js');

// Utility Bill Services
module.exports.utilityCompanyService = require('./utilityCompany.service.js');
module.exports.billPaymentService = require('./billPayment.service.js');

// School Accounting Services
module.exports.feeCategoryService = require('./feeCategory.service.js');
module.exports.schoolTransactionService = require('./schoolTransaction.service.js');
module.exports.feeStructureService = require('./feeStructure.service.js');
module.exports.feeVoucherService = require('./feeVoucher.service.js');
module.exports.schoolAccountingService = require('./schoolAccounting.service.js');
module.exports.schoolReportsService = require('./schoolReports.service.js');
module.exports.accountsSystemService = require('./accountsSystem.service.js');

// School Services
module.exports.schoolClassService = require('./schoolClass.service.js');
module.exports.sectionService = require('./section.service.js');
module.exports.subjectService = require('./subject.service.js');
module.exports.studentService = require('./student.service.js');
module.exports.teacherService = require('./teacher.service.js');
module.exports.schoolAttendanceService = require('./schoolAttendance.service.js');
module.exports.teacherAttendanceService = require('./teacherAttendance.service.js');
module.exports.teacherLeaveService = require('./teacherLeave.service.js');
module.exports.teacherPayrollService = require('./teacherPayroll.service.js');
module.exports.teacherAssignmentService = require('./teacherAssignment.service.js');
module.exports.examService = require('./exam.service.js');
module.exports.markService = require('./mark.service.js');
module.exports.schoolFeeService = require('./schoolFee.service.js');
module.exports.timetableService = require('./timetable.service.js');
module.exports.timeSlotService = require('./timeSlot.service.js');
module.exports.whatsappService = require('./whatsapp.service.js');
module.exports.schoolDashboardService = require('./schoolDashboard.service.js');
module.exports.visitorService = require('./visitor.service.js');
module.exports.schoolReportService = require('./schoolReport.service.js');

// HR Services
module.exports.employeeService = require('./employee.service.js');
module.exports.departmentService = require('./department.service.js');
module.exports.designationService = require('./designation.service.js');
module.exports.shiftService = require('./shift.service.js');
module.exports.attendanceService = require('./attendance.service.js');
module.exports.leaveService = require('./leave.service.js');
module.exports.payrollService = require('./payroll.service.js');
module.exports.performanceReviewService = require('./performanceReview.service.js');