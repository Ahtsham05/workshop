import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export type ProfitShareLedgerTransactionType = 'share_earned' | 'share_reversed' | 'share_payment' | 'adjustment';

export interface PartnerProfitShareLedgerEntry {
  id: string;
  partnerId: { id: string; name: string; partnerType: string } | string;
  transactionType: ProfitShareLedgerTransactionType;
  transactionDate: string;
  reference?: string;
  referenceId?: string;
  referenceModel?: string;
  productId?: { id: string; name: string } | string | null;
  ruleId?: string;
  debit: number;
  credit: number;
  balance: number;
  shareType?: 'percentage_of_profit' | 'fixed_per_unit';
  rate?: number;
  saleProfit?: number;
  notes?: string;
  createdAt: string;
}

export interface PartnerProfitShareLedgerResponse {
  results: PartnerProfitShareLedgerEntry[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface PartnerProfitShareBalance {
  partnerId: string;
  balance: number;
}

export const partnerProfitShareLedgerApi = createApi({
  reducerPath: 'partnerProfitShareLedgerApi',
  baseQuery,
  tagTypes: ['PartnerProfitShareLedger'],
  endpoints: (builder) => ({
    getPartnerProfitShareLedgerEntries: builder.query<
      PartnerProfitShareLedgerResponse,
      { page?: number; limit?: number; partnerId?: string; productId?: string; transactionType?: ProfitShareLedgerTransactionType } | void
    >({
      query: (params) => ({ url: '/partner-profit-share-ledger', params: params || undefined }),
      providesTags: ['PartnerProfitShareLedger'],
    }),
    getPartnerProfitShareBalance: builder.query<PartnerProfitShareBalance, { partnerId: string }>({
      query: (params) => ({ url: '/partner-profit-share-ledger/balance', params }),
      providesTags: ['PartnerProfitShareLedger'],
    }),
  }),
});

export const { useGetPartnerProfitShareLedgerEntriesQuery, useGetPartnerProfitShareBalanceQuery } =
  partnerProfitShareLedgerApi;
