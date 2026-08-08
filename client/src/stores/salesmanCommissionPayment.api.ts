import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export interface SalesmanCommissionPayment {
  id: string;
  salesmanUserId: string;
  salesmanName?: string;
  amount: number;
  paymentMethod: 'cash' | 'bank' | 'wallet';
  walletType?: string;
  paymentDate: string;
  reference?: string;
  notes?: string;
  createdAt: string;
}

export interface CreateCommissionPaymentRequest {
  salesmanUserId: string;
  amount: number;
  paymentMethod?: 'cash' | 'bank' | 'wallet';
  walletType?: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
}

// Ledger data lives in a separate API slice (salesmanCommissionLedger.api.ts) — callers
// refetch it explicitly on success rather than relying on cross-slice tag invalidation.
export const salesmanCommissionPaymentApi = createApi({
  reducerPath: 'salesmanCommissionPaymentApi',
  baseQuery,
  tagTypes: ['CommissionPayment'],
  endpoints: (builder) => ({
    createCommissionPayment: builder.mutation<SalesmanCommissionPayment, CreateCommissionPaymentRequest>({
      query: (body) => ({ url: '/commission-payments', method: 'POST', body }),
      invalidatesTags: ['CommissionPayment'],
    }),
    deleteCommissionPayment: builder.mutation<void, string>({
      query: (id) => ({ url: `/commission-payments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['CommissionPayment'],
    }),
  }),
});

export const { useCreateCommissionPaymentMutation, useDeleteCommissionPaymentMutation } = salesmanCommissionPaymentApi;
