import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export interface Payment {
  id: string;
  organizationId: string | { id: string; name: string; email?: string };
  userId: string | { id: string; name: string; email: string };
  planType: 'single' | 'multi' | 'starter' | 'growth' | 'business' | 'enterprise';
  months: number;
  amount: number;
  paymentMethod: 'bank_transfer';
  transactionId?: string;
  screenshotUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string | { id: string; name: string; email: string };
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanConfig {
  planType: string;
  label: string;
  durationDays?: number;
  maxBranches: number;
  maxUsers: number;
  price?: number;
  pricePerMonth?: number | null;
  priceLabel?: string;
  description: string;
  features: string[];
  badge?: string | null;
}

export interface BankDetails {
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban: string;
  swiftCode?: string;
  branch?: string;
  instructions: string[];
}

export interface BankDetailsResponse {
  bankDetails: BankDetails;
  plans: Record<string, PlanConfig>;
}

export interface PaymentsResponse {
  results: Payment[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface SubmitPaymentRequest {
  planType: 'single' | 'multi' | 'starter' | 'growth' | 'business' | 'enterprise';
  months: number;
  transactionId?: string;
  screenshotUrl?: string;
  screenshotPublicId?: string;
}

export interface RejectPaymentRequest {
  rejectionReason: string;
}

export interface UploadScreenshotResponse {
  url: string;
  publicId: string;
}

export interface TrialStatus {
  trialExpired: boolean;
  daysRemaining: number;
  subscription: any;
}

export interface AdminOrganizationUser {
  id: string;
  name: string;
  email: string;
  systemRole: 'system_admin' | 'superAdmin' | 'branchAdmin' | 'staff';
  isActive: boolean;
  isEmailVerified: boolean;
  role?: { id: string; name: string } | null;
  branches: Array<{ id: string; name: string }>;
  createdAt: string;
}

export interface AdminOrganizationBranch {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isDefault: boolean;
  manager?: { id: string; name: string; email: string } | null;
  location?: { city?: string; country?: string };
  createdAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  systemRole: string;
  isActive: boolean;
  organizationName: string;
  branchDisplay: string;
  roleName: string;
  createdAt?: string;
}

export const subscriptionApi = createApi({
  reducerPath: 'subscriptionApi',
  baseQuery,
  tagTypes: ['Payment', 'AdminPayment', 'AdminOrganization', 'AdminUser'],
  endpoints: (builder) => ({
    // -- User-facing endpoints --

    getBankDetails: builder.query<BankDetailsResponse, void>({
      query: () => '/payments/bank-details',
    }),

    getTrialStatus: builder.query<TrialStatus, void>({
      query: () => '/payments/trial/status',
    }),

    submitPayment: builder.mutation<Payment, SubmitPaymentRequest>({
      query: (body) => ({
        url: '/payments',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Payment'],
    }),

    getMyPayments: builder.query<PaymentsResponse, { status?: string; page?: number; limit?: number }>({
      query: (params = {}) => ({
        url: '/payments/my',
        params,
      }),
      providesTags: ['Payment'],
    }),

    getPayment: builder.query<Payment, string>({
      query: (paymentId) => `/payments/${paymentId}`,
      providesTags: (_result, _err, id) => [{ type: 'Payment', id }],
    }),

    // -- Admin endpoints --

    adminGetAllPayments: builder.query<
      PaymentsResponse,
      { status?: string; planType?: string; page?: number; limit?: number }
    >({
      query: (params = {}) => ({
        url: '/admin/payments',
        params,
      }),
      providesTags: ['AdminPayment'],
    }),

    adminGetPayment: builder.query<Payment, string>({
      query: (paymentId) => `/admin/payments/${paymentId}`,
      providesTags: (_result, _err, id) => [{ type: 'AdminPayment', id }],
    }),

    adminApprovePayment: builder.mutation<Payment, string>({
      query: (paymentId) => ({
        url: `/admin/payments/${paymentId}/approve`,
        method: 'PATCH',
      }),
      invalidatesTags: ['AdminPayment', 'Payment'],
    }),

    adminRejectPayment: builder.mutation<Payment, { paymentId: string; rejectionReason: string }>({
      query: ({ paymentId, rejectionReason }) => ({
        url: `/admin/payments/${paymentId}/reject`,
        method: 'PATCH',
        body: { rejectionReason },
      }),
      invalidatesTags: ['AdminPayment', 'Payment'],
    }),

    adminGetAllOrganizations: builder.query<
      { results: any[]; page: number; limit: number; totalPages: number; totalResults: number },
      { page?: number; limit?: number }
    >({
      query: (params = {}) => ({
        url: '/admin/organizations',
        params,
      }),
      providesTags: ['AdminOrganization'],
    }),

    adminGetOrganization: builder.query<
      {
        organization: any;
        totalUsers: number;
        totalBranches: number;
        payments: Payment[];
        organizationUsers: AdminOrganizationUser[];
        organizationBranches: AdminOrganizationBranch[];
      },
      string
    >({
      query: (orgId) => `/admin/organizations/${orgId}`,
      providesTags: (_result, _err, orgId) => [{ type: 'AdminOrganization', id: orgId }],
    }),

    adminGetDashboard: builder.query<
      { stats: { totalOrgs: number; totalUsers: number; pendingPayments: number; approvedPayments: number }; recentPending: Payment[] },
      void
    >({
      query: () => '/admin/dashboard',
    }),

    adminGetAllUsers: builder.query<
      { results: AdminUser[]; page: number; limit: number; totalPages: number; totalResults: number },
      { page?: number; limit?: number }
    >({
      query: (params = {}) => ({
        url: '/admin/users',
        params,
      }),
      providesTags: ['AdminUser'],
    }),

    adminDeleteUser: builder.mutation<void, string>({
      query: (userId) => ({
        url: `/admin/users/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['AdminUser', 'AdminOrganization', 'AdminPayment'],
    }),

    adminDeleteOrganization: builder.mutation<
      { success: boolean; message: string; deletedOrganization: any },
      string
    >({
      query: (orgId) => ({
        url: `/admin/organizations/${orgId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['AdminPayment', 'AdminOrganization'],
    }),
  }),
});

export const {
  useGetBankDetailsQuery,
  useGetTrialStatusQuery,
  useSubmitPaymentMutation,
  useGetMyPaymentsQuery,
  useGetPaymentQuery,
  useAdminGetAllPaymentsQuery,
  useAdminGetPaymentQuery,
  useAdminApprovePaymentMutation,
  useAdminRejectPaymentMutation,
  useAdminGetAllOrganizationsQuery,
  useAdminGetOrganizationQuery,
  useAdminGetDashboardQuery,
  useAdminGetAllUsersQuery,
  useAdminDeleteUserMutation,
  useAdminDeleteOrganizationMutation,
} = subscriptionApi;
