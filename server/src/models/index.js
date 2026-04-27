module.exports.Token = require('./token.model');
module.exports.User = require('./user.model');
module.exports.Role = require('./role.model');
module.exports.Customer = require('./customer.model');
module.exports.Supplier = require('./supplier.model');
module.exports.Product = require('./product.model');
module.exports.Category = require('./category.model');
module.exports.Purchase = require('./purchase.model');
module.exports.Invoice = require('./invoice.model');
module.exports.GeneralLedger = require('./generalLedger.model');
module.exports.Voucher = require('./voucher.model');
module.exports.Expense = require('./expense.model');
module.exports.ExpenseCategory = require('./expenseCategory.model');
module.exports.CustomerLedger = require('./customerLedger.model');
module.exports.SupplierLedger = require('./supplierLedger.model');
module.exports.Company = require('./company.model');
module.exports.Organization = require('./organization.model');
module.exports.Branch = require('./branch.model');
module.exports.Membership = require('./membership.model');
module.exports.Payment = require('./payment.model');
module.exports.Wallet = require('./wallet.model');
module.exports.LoadPurchase = require('./loadPurchase.model');
module.exports.LoadTransaction = require('./loadTransaction.model');
module.exports.SimSale = require('./simSale.model');
module.exports.CashWithdrawal = require('./cashWithdrawal.model');
module.exports.RepairJob = require('./repairJob.model');
module.exports.Service = require('./service.model');
module.exports.ServiceInvoice = require('./serviceInvoice.model');
module.exports.RepairStockItem = require('./repairStockItem.model');
module.exports.InstallmentPlan = require('./installmentPlan.model');
module.exports.InstallmentPayment = require('./installmentPayment.model');
module.exports.CashBookEntry = require('./cashBookEntry.model');
module.exports.SalesReturn = require('./salesReturn.model');
module.exports.PurchaseReturn = require('./purchaseReturn.model');

// Utility Bill Models
module.exports.UtilityCompany = require('./utilityCompany.model');
module.exports.BillPayment = require('./billPayment.model');

// School Accounting Models
module.exports.FeeCategory = require('./feeCategory.model');
module.exports.SchoolTransaction = require('./schoolTransaction.model');
module.exports.FeeStructure = require('./feeStructure.model');
module.exports.FeeVoucher = require('./feeVoucher.model');
module.exports.StudentCreditLedger = require('./studentCreditLedger.model');

// Accounting System Models
module.exports.AccountHead = require('./accountHead.model');
module.exports.JournalEntry = require('./journalEntry.model');
module.exports.BankAccount = require('./bankAccount.model');
module.exports.Budget = require('./budget.model');

// School Models
module.exports.SchoolClass = require('./schoolClass.model');
module.exports.Section = require('./section.model');
module.exports.Subject = require('./subject.model');
module.exports.Student = require('./student.model');
module.exports.Teacher = require('./teacher.model');
module.exports.SchoolAttendance = require('./schoolAttendance.model');
module.exports.TeacherAttendance = require('./teacherAttendance.model');
module.exports.TeacherLeave = require('./teacherLeave.model');
module.exports.TeacherPayroll = require('./teacherPayroll.model');
module.exports.TeacherAssignment = require('./teacherAssignment.model');
module.exports.Exam = require('./exam.model');
module.exports.Mark = require('./mark.model');
module.exports.SchoolFee = require('./schoolFee.model');
module.exports.Timetable = require('./timetable.model');
module.exports.TimeSlot = require('./timeSlot.model');
module.exports.Visitor = require('./visitor.model');

// HR Models
module.exports.Employee = require('./employee.model');
module.exports.Department = require('./department.model');
module.exports.Designation = require('./designation.model');
module.exports.Shift = require('./shift.model');
module.exports.Attendance = require('./attendance.model');
module.exports.Leave = require('./leave.model');
module.exports.Payroll = require('./payroll.model');
module.exports.PerformanceReview = require('./performanceReview.model');