import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export type CommissionRuleScope = 'organization' | 'branch' | 'salesman';

/** Matches SalesmanCommissionLedger's referenceModel values on the server. */
export type CommissionModule = 'Invoice' | 'SimSale' | 'LoadTransaction' | 'RepairJob' | 'ServiceInvoice';

export const COMMISSION_MODULES: { value: CommissionModule; label: string }[] = [
  { value: 'Invoice', label: 'Sales / Invoices' },
  { value: 'SimSale', label: 'Sim Sale' },
  { value: 'LoadTransaction', label: 'Load Sale' },
  { value: 'RepairJob', label: 'Repairs' },
  { value: 'ServiceInvoice', label: 'Services' },
];

export interface CommissionRule {
  id: string;
  scope: CommissionRuleScope;
  branchId?: { id: string; name: string } | string | null;
  salesmanId?: { id: string; name: string; salesmanCode: string } | string | null;
  /** null = a general rate covering every module with no more specific module rule. */
  module?: CommissionModule | null;
  rate: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommissionRuleRequest {
  scope: CommissionRuleScope;
  branchId?: string;
  salesmanId?: string;
  module?: CommissionModule | null;
  rate: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  isActive?: boolean;
  notes?: string;
}

export interface UpdateCommissionRuleRequest {
  rate?: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  isActive?: boolean;
  notes?: string;
}

export interface CommissionRulesResponse {
  results: CommissionRule[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface ResolvedCommissionRate {
  rate: number;
  source: 'salesman' | 'branch' | 'organization' | 'profile_default' | 'none';
  ruleId: string | null;
}

export type SalesmanModuleRates = Record<CommissionModule, ResolvedCommissionRate>;

export const commissionRuleApi = createApi({
  reducerPath: 'commissionRuleApi',
  baseQuery,
  tagTypes: ['CommissionRule'],
  endpoints: (builder) => ({
    getCommissionRules: builder.query<
      CommissionRulesResponse,
      { page?: number; limit?: number; scope?: CommissionRuleScope; salesmanId?: string; module?: CommissionModule } | void
    >({
      query: (params) => ({ url: '/commission-rules', params: params || undefined }),
      providesTags: ['CommissionRule'],
    }),
    resolveCommissionRate: builder.query<ResolvedCommissionRate, { salesmanId: string; module?: CommissionModule; date?: string }>({
      query: (params) => ({ url: '/commission-rules/resolve', params }),
    }),
    getSalesmanModuleRates: builder.query<SalesmanModuleRates, { salesmanId: string; date?: string }>({
      query: (params) => ({ url: '/commission-rules/salesman-module-rates', params }),
      providesTags: ['CommissionRule'],
    }),
    createCommissionRule: builder.mutation<CommissionRule, CreateCommissionRuleRequest>({
      query: (body) => ({ url: '/commission-rules', method: 'POST', body }),
      invalidatesTags: ['CommissionRule'],
    }),
    updateCommissionRule: builder.mutation<CommissionRule, { id: string; data: UpdateCommissionRuleRequest }>({
      query: ({ id, data }) => ({ url: `/commission-rules/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['CommissionRule'],
    }),
    deleteCommissionRule: builder.mutation<void, string>({
      query: (id) => ({ url: `/commission-rules/${id}`, method: 'DELETE' }),
      invalidatesTags: ['CommissionRule'],
    }),
  }),
});

export const {
  useGetCommissionRulesQuery,
  useLazyResolveCommissionRateQuery,
  useGetSalesmanModuleRatesQuery,
  useLazyGetSalesmanModuleRatesQuery,
  useCreateCommissionRuleMutation,
  useUpdateCommissionRuleMutation,
  useDeleteCommissionRuleMutation,
} = commissionRuleApi;
