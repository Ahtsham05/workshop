import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export type CommissionLedgerTransactionType = 'commission_earned' | 'commission_reversed' | 'commission_payment' | 'adjustment';

export interface CommissionLedgerEntry {
  id: string;
  salesmanUserId: { id: string; name: string; email: string } | string;
  transactionType: CommissionLedgerTransactionType;
  transactionDate: string;
  reference?: string;
  referenceId?: string;
  referenceModel?: string;
  debit: number;
  credit: number;
  balance: number;
  rate?: number;
  saleAmount?: number;
  notes?: string;
  createdAt: string;
}

export interface CommissionLedgerResponse {
  results: CommissionLedgerEntry[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface CommissionBalance {
  salesmanUserId: string;
  balance: number;
}

export const salesmanCommissionLedgerApi = createApi({
  reducerPath: 'salesmanCommissionLedgerApi',
  baseQuery,
  tagTypes: ['CommissionLedger'],
  endpoints: (builder) => ({
    getCommissionLedgerEntries: builder.query<
      CommissionLedgerResponse,
      { page?: number; limit?: number; salesmanUserId?: string; transactionType?: CommissionLedgerTransactionType } | void
    >({
      query: (params) => ({ url: '/commission-ledger', params: params || undefined }),
      providesTags: ['CommissionLedger'],
    }),
    getCommissionBalance: builder.query<CommissionBalance, { salesmanUserId: string }>({
      query: (params) => ({ url: '/commission-ledger/balance', params }),
      providesTags: ['CommissionLedger'],
    }),
  }),
});

export const { useGetCommissionLedgerEntriesQuery, useGetCommissionBalanceQuery } = salesmanCommissionLedgerApi;
