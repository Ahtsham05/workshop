import { createApi } from '@reduxjs/toolkit/query/react';
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1';

// Custom base query with auth handling
const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const baseQuery = createAppFetchBaseQuery({
    baseUrl: baseUrl,
    prepareHeaders: (headers) => {
      // Get token from localStorage
      const token = localStorage.getItem('accessToken');
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      const activeBranchId = localStorage.getItem('activeBranchId');
      if (activeBranchId) {
        headers.set('x-branch-id', activeBranchId);
      }
      return headers;
    },
  });

  const result = await baseQuery(args, api, extraOptions);
  
  // Handle 401 errors
  if (result.error && result.error.status === 401) {
    console.error('Authentication failed. Please login again.');
  }
  
  return result;
};

/**
 * Ledger figures for one employee. Sign convention of `currentBalance`: + = the business owes
 * the employee (salary payable), − = the employee owes the business (advance / loan).
 */
export interface EmployeeLedgerFigures {
  totalPayable: number
  totalSalaryPaid: number
  totalAdvancePaid: number
  totalAdvanceRecovered: number
  /** Cash the employee handed back (Receipt Voucher). */
  totalCashReceived: number
  outstandingAdvance: number
  remainingPayable: number
  payableNow: number
  receivableNow: number
  currentBalance: number
  transactionCount: number
}

export interface EmployeeWithBalance extends EmployeeLedgerFigures {
  id: string
  employeeId: string
  name: string
  phone: string
  employmentStatus: string
  designation: string
  department: string
  monthlySalary: number
  lastActivity: string | null
}

export type EmployeeLedgerTransactionType =
  | 'salary_payable'
  | 'salary_payment'
  | 'advance_payment'
  | 'advance_recovery'
  | 'adjustment'
  | 'payment_received'

export interface EmployeeStatementRow {
  id: string
  transactionDate: string
  transactionType: EmployeeLedgerTransactionType
  description: string
  reference: string
  referenceId: string | null
  referenceModel: string | null
  paymentMethod: string
  walletType: string
  notes: string
  debit: number
  credit: number
  /** A memo row (advance recovery) shows its amount but does not move the balance. */
  memo: boolean
  runningBalance: number
  /** Posted by a Payment / Receipt Voucher — edited from there, not here. */
  voucherOwned: boolean
  createdBy: string
  createdAt: string
}

export interface EmployeeStatement {
  employee: {
    id: string
    employeeId: string
    name: string
    phone: string
    employmentStatus: string
    designation: string
    department: string
    joiningDate: string | null
    monthlySalary: number
  }
  period: { startDate: string | null; endDate: string | null }
  openingBalance: number
  totals: { debit: number; credit: number }
  closingBalance: number
  rows: EmployeeStatementRow[]
  /** All-time figures (not limited to the period). */
  summary: EmployeeLedgerFigures
}

export const hrApi = createApi({
  reducerPath: 'hrApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Employee', 'Department', 'Designation', 'Attendance', 'Leave', 'Payroll', 'EmployeeLedger'],
  endpoints: (builder) => ({
    // Employees
    getEmployees: builder.query({
      query: (params) => ({ url: '/employees', params }),
      providesTags: ['Employee'],
    }),
    getEmployee: builder.query({
      query: (id) => `/employees/${id}`,
      providesTags: ['Employee'],
    }),
    createEmployee: builder.mutation({
      query: (data) => ({ url: '/employees', method: 'POST', body: data }),
      invalidatesTags: ['Employee'],
    }),
    updateEmployee: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/employees/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Employee'],
    }),
    deleteEmployee: builder.mutation({
      query: (id) => ({ url: `/employees/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Employee'],
    }),
    
    // Departments
    getDepartments: builder.query({
      query: (params) => ({ url: '/departments', params }),
      providesTags: ['Department'],
    }),
    getDepartment: builder.query({
      query: (id) => `/departments/${id}`,
      providesTags: ['Department'],
    }),
    createDepartment: builder.mutation({
      query: (data) => ({ url: '/departments', method: 'POST', body: data }),
      invalidatesTags: ['Department'],
    }),
    updateDepartment: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/departments/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Department'],
    }),
    deleteDepartment: builder.mutation({
      query: (id) => ({ url: `/departments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Department'],
    }),

    // Designations
    getDesignations: builder.query({
      query: (params) => ({ url: '/designations', params }),
      providesTags: ['Designation'],
    }),
    getDesignation: builder.query({
      query: (id) => `/designations/${id}`,
      providesTags: ['Designation'],
    }),
    createDesignation: builder.mutation({
      query: (data) => ({ url: '/designations', method: 'POST', body: data }),
      invalidatesTags: ['Designation'],
    }),
    updateDesignation: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/designations/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Designation'],
    }),
    deleteDesignation: builder.mutation({
      query: (id) => ({ url: `/designations/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Designation'],
    }),

    // Attendance
    getAttendances: builder.query({
      query: (params) => ({ url: '/attendance', params }),
      providesTags: (result) => 
        result?.results
          ? [...result.results.map(({ id }: any) => ({ type: 'Attendance' as const, id })), { type: 'Attendance', id: 'LIST' }]
          : [{ type: 'Attendance', id: 'LIST' }],
      keepUnusedDataFor: 0,
    }),
    getAttendance: builder.query({
      query: (id) => `/attendance/${id}`,
      providesTags: ['Attendance'],
    }),
    createAttendance: builder.mutation({
      query: (data) => ({ url: '/attendance', method: 'POST', body: data }),
      invalidatesTags: ['Attendance'],
    }),
    markCheckIn: builder.mutation({
      query: (data) => ({ url: '/attendance/checkin', method: 'POST', body: data }),
      invalidatesTags: [{ type: 'Attendance', id: 'LIST' }, 'Attendance', 'Payroll'],
    }),
    markCheckOut: builder.mutation({
      query: (data) => ({ url: '/attendance/checkout', method: 'POST', body: data }),
      invalidatesTags: [{ type: 'Attendance', id: 'LIST' }, 'Attendance', 'Payroll'],
    }),
    updateAttendance: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/attendance/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Attendance', 'Payroll'],
    }),
    deleteAttendance: builder.mutation({
      query: (id) => ({ url: `/attendance/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Attendance', 'Payroll'],
    }),
    markBulkAttendance: builder.mutation({
      query: (data) => ({ url: '/attendance/bulk', method: 'POST', body: data }),
      invalidatesTags: [{ type: 'Attendance', id: 'LIST' }, 'Attendance', 'Payroll'],
    }),
    getDailyAttendanceSummary: builder.query({
      query: (params: { date: string }) => ({ url: '/attendance/daily-summary', params }),
      providesTags: [{ type: 'Attendance', id: 'SUMMARY' }],
    }),
    getEmployeeAttendanceStats: builder.query({
      query: ({ employeeId, startDate, endDate }: { employeeId: string; startDate: string; endDate: string }) => ({
        url: `/attendance/employee/${employeeId}/stats`,
        params: { startDate, endDate },
      }),
    }),
    getEmployeeDailyBreakdown: builder.query({
      query: ({ employeeId, month, year }: { employeeId: string; month: number; year: number }) => ({
        url: `/attendance/employee/${employeeId}/daily-breakdown`,
        params: { month, year },
      }),
      providesTags: ['Attendance', 'Leave', 'Payroll'],
    }),
    
    // Leaves
    getLeaves: builder.query({
      query: (params) => ({ url: '/leaves', params }),
      providesTags: ['Leave'],
    }),
    getLeave: builder.query({
      query: (id) => `/leaves/${id}`,
      providesTags: ['Leave'],
    }),
    createLeave: builder.mutation({
      query: (data) => ({ url: '/leaves', method: 'POST', body: data }),
      invalidatesTags: ['Leave', 'Attendance', 'Payroll'],
    }),
    updateLeave: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/leaves/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Leave', 'Attendance', 'Payroll'],
    }),
    deleteLeave: builder.mutation({
      query: (id) => ({ url: `/leaves/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Leave', 'Attendance', 'Payroll'],
    }),
    approveLeave: builder.mutation({
      query: ({ id, leaveId }) => ({ url: `/leaves/${id || leaveId}/approve`, method: 'PATCH' }),
      invalidatesTags: ['Leave', 'Attendance', 'Payroll'],
    }),
    rejectLeave: builder.mutation({
      query: ({ id, leaveId, rejectionReason }) => ({
        url: `/leaves/${id || leaveId}/reject`,
        method: 'PATCH',
        body: { rejectionReason },
      }),
      invalidatesTags: ['Leave', 'Attendance', 'Payroll'],
    }),
    cancelLeave: builder.mutation({
      query: ({ id }) => ({ url: `/leaves/${id}/cancel`, method: 'PATCH' }),
      invalidatesTags: ['Leave'],
    }),
    getLeaveBalance: builder.query({
      query: ({ employeeId, leaveType }) => `/leaves/employee/${employeeId}/balance/${leaveType}`,
      providesTags: ['Leave'],
    }),
    
    // Payroll
    getPayrolls: builder.query({
      query: (params) => ({ url: '/payroll', params }),
      providesTags: ['Payroll'],
    }),
    getPayroll: builder.query({
      query: (id) => `/payroll/${id}`,
      providesTags: ['Payroll'],
    }),
    getEmployeeMonthlyPayrollSummary: builder.query({
      query: ({ employeeId, year }: { employeeId: string; year: number }) => ({
        url: `/payroll/employee/${employeeId}/monthly-summary`,
        params: { year },
      }),
      providesTags: ['Payroll', 'EmployeeLedger'],
    }),
    getPayrollSummary: builder.query({
      query: (params) => ({ url: '/payroll/summary', params }),
      providesTags: ['Payroll', 'EmployeeLedger'],
    }),
    getEmployeeFinalSettlement: builder.query({
      query: (employeeId: string) => `/payroll/employee/${employeeId}/final-settlement`,
      providesTags: ['Payroll', 'EmployeeLedger'],
    }),
    createPayroll: builder.mutation({
      query: (data) => ({ url: '/payroll', method: 'POST', body: data }),
      invalidatesTags: ['Payroll'],
    }),
    updatePayroll: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/payroll/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Payroll'],
    }),
    deletePayroll: builder.mutation({
      query: (id) => ({ url: `/payroll/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Payroll'],
    }),
    generatePayroll: builder.mutation({
      query: (data) => ({ url: '/payroll/generate', method: 'POST', body: data }),
      invalidatesTags: ['Payroll', 'EmployeeLedger'],
    }),
    processPayroll: builder.mutation({
      query: ({ id }) => ({ url: `/payroll/${id}/process`, method: 'PATCH' }),
      invalidatesTags: ['Payroll'],
    }),
    markPayrollPaid: builder.mutation({
      query: ({ id, paymentDate, paymentMethod, amount }) => ({ 
        url: `/payroll/${id}/paid`, 
        method: 'PATCH',
        body: { paymentDate, paymentMethod, amount }
      }),
      invalidatesTags: ['Payroll', 'EmployeeLedger'],
    }),

    // Employee Ledger
    getEmployeeLedgerEntries: builder.query({
      query: (params) => ({ url: '/employee-ledger', params }),
      providesTags: ['EmployeeLedger'],
    }),
    getEmployeesWithLedgerBalances: builder.query<EmployeeWithBalance[], void>({
      query: () => ({ url: '/employee-ledger/employees-with-balances' }),
      providesTags: ['EmployeeLedger'],
    }),
    getEmployeeStatement: builder.query<EmployeeStatement, { employeeId: string; startDate?: string; endDate?: string }>({
      query: ({ employeeId, ...params }) => ({ url: `/employee-ledger/employee/${employeeId}/statement`, params }),
      providesTags: ['EmployeeLedger'],
    }),
    getEmployeeLedgerSummary: builder.query({
      query: (employeeId) => `/employee-ledger/employee/${employeeId}/summary`,
      providesTags: ['EmployeeLedger'],
    }),
    createEmployeeAdvancePayment: builder.mutation({
      query: (data) => ({ url: '/employee-ledger/advance', method: 'POST', body: data }),
      invalidatesTags: ['EmployeeLedger'],
    }),
    createEmployeePayment: builder.mutation({
      query: (data) => ({ url: '/employee-ledger/pay', method: 'POST', body: data }),
      invalidatesTags: ['EmployeeLedger', 'Payroll'],
    }),
    updateEmployeeLedgerEntry: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/employee-ledger/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['EmployeeLedger', 'Payroll'],
    }),
    deleteEmployeeLedgerEntry: builder.mutation({
      query: (id) => ({ url: `/employee-ledger/${id}`, method: 'DELETE' }),
      invalidatesTags: ['EmployeeLedger', 'Payroll'],
    }),
  }),
});

export const {
  useGetEmployeesQuery,
  useGetEmployeeQuery,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useDeleteEmployeeMutation,
  useGetDepartmentsQuery,
  useGetDepartmentQuery,
  useCreateDepartmentMutation,
  useUpdateDepartmentMutation,
  useDeleteDepartmentMutation,
  useGetDesignationsQuery,
  useGetDesignationQuery,
  useCreateDesignationMutation,
  useUpdateDesignationMutation,
  useDeleteDesignationMutation,
  useGetAttendancesQuery,
  useGetAttendanceQuery,
  useCreateAttendanceMutation,
  useMarkCheckInMutation,
  useMarkCheckOutMutation,
  useUpdateAttendanceMutation,
  useDeleteAttendanceMutation,
  useMarkBulkAttendanceMutation,
  useGetDailyAttendanceSummaryQuery,
  useGetEmployeeAttendanceStatsQuery,
  useGetEmployeeDailyBreakdownQuery,
  useGetLeavesQuery,
  useGetLeaveQuery,
  useCreateLeaveMutation,
  useUpdateLeaveMutation,
  useDeleteLeaveMutation,
  useApproveLeaveMutation,
  useRejectLeaveMutation,
  useCancelLeaveMutation,
  useGetLeaveBalanceQuery,
  useGetPayrollsQuery,
  useGetPayrollQuery,
  useGetEmployeeMonthlyPayrollSummaryQuery,
  useGetPayrollSummaryQuery,
  useGetEmployeeFinalSettlementQuery,
  useCreatePayrollMutation,
  useUpdatePayrollMutation,
  useDeletePayrollMutation,
  useGeneratePayrollMutation,
  useProcessPayrollMutation,
  useMarkPayrollPaidMutation,
  useGetEmployeeLedgerEntriesQuery,
  useGetEmployeesWithLedgerBalancesQuery,
  useGetEmployeeStatementQuery,
  useGetEmployeeLedgerSummaryQuery,
  useCreateEmployeeAdvancePaymentMutation,
  useCreateEmployeePaymentMutation,
  useUpdateEmployeeLedgerEntryMutation,
  useDeleteEmployeeLedgerEntryMutation,
} = hrApi;
