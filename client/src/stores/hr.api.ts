import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1';

// Custom base query with auth handling
const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const baseQuery = fetchBaseQuery({
    baseUrl: baseUrl,
    prepareHeaders: (headers) => {
      // Get token from localStorage
      const token = localStorage.getItem('accessToken');
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
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

export const hrApi = createApi({
  reducerPath: 'hrApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Employee', 'Department', 'Attendance', 'Leave', 'Payroll'],
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
    
    // Attendance
    getAttendances: builder.query({
      query: (params) => ({ url: '/attendance', params }),
      providesTags: ['Attendance'],
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
      invalidatesTags: ['Attendance'],
    }),
    markCheckOut: builder.mutation({
      query: (data) => ({ url: '/attendance/checkout', method: 'POST', body: data }),
      invalidatesTags: ['Attendance'],
    }),
    updateAttendance: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/attendance/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Attendance'],
    }),
    deleteAttendance: builder.mutation({
      query: (id) => ({ url: `/attendance/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Attendance'],
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
      invalidatesTags: ['Leave'],
    }),
    updateLeave: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/leaves/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Leave'],
    }),
    deleteLeave: builder.mutation({
      query: (id) => ({ url: `/leaves/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Leave'],
    }),
    approveLeave: builder.mutation({
      query: ({ id }) => ({ url: `/leaves/${id}/approve`, method: 'PATCH' }),
      invalidatesTags: ['Leave'],
    }),
    rejectLeave: builder.mutation({
      query: ({ id, rejectionReason }) => ({ url: `/leaves/${id}/reject`, method: 'PATCH', body: { rejectionReason } }),
      invalidatesTags: ['Leave'],
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
      invalidatesTags: ['Payroll'],
    }),
    processPayroll: builder.mutation({
      query: ({ id }) => ({ url: `/payroll/${id}/process`, method: 'PATCH' }),
      invalidatesTags: ['Payroll'],
    }),
    markPayrollPaid: builder.mutation({
      query: ({ id, paymentDate, paymentMethod }) => ({ 
        url: `/payroll/${id}/paid`, 
        method: 'PATCH',
        body: { paymentDate, paymentMethod }
      }),
      invalidatesTags: ['Payroll'],
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
  useGetAttendancesQuery,
  useGetAttendanceQuery,
  useCreateAttendanceMutation,
  useMarkCheckInMutation,
  useMarkCheckOutMutation,
  useUpdateAttendanceMutation,
  useDeleteAttendanceMutation,
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
  useCreatePayrollMutation,
  useUpdatePayrollMutation,
  useDeletePayrollMutation,
  useGeneratePayrollMutation,
  useProcessPayrollMutation,
  useMarkPayrollPaidMutation,
} = hrApi;
