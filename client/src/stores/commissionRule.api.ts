import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export type CommissionRuleScope = 'organization' | 'branch' | 'salesman';

export interface CommissionRule {
  id: string;
  scope: CommissionRuleScope;
  branchId?: { id: string; name: string } | string | null;
  salesmanUserId?: { id: string; name: string; email: string } | string | null;
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
  salesmanUserId?: string;
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

export const commissionRuleApi = createApi({
  reducerPath: 'commissionRuleApi',
  baseQuery,
  tagTypes: ['CommissionRule'],
  endpoints: (builder) => ({
    getCommissionRules: builder.query<
      CommissionRulesResponse,
      { page?: number; limit?: number; scope?: CommissionRuleScope; salesmanUserId?: string } | void
    >({
      query: (params) => ({ url: '/commission-rules', params: params || undefined }),
      providesTags: ['CommissionRule'],
    }),
    resolveCommissionRate: builder.query<ResolvedCommissionRate, { salesmanUserId: string; date?: string }>({
      query: (params) => ({ url: '/commission-rules/resolve', params }),
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
  useCreateCommissionRuleMutation,
  useUpdateCommissionRuleMutation,
  useDeleteCommissionRuleMutation,
} = commissionRuleApi;
