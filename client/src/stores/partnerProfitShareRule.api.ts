import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export type ProfitShareRuleScope = 'organization' | 'branch' | 'product';
export type ProfitShareType = 'percentage_of_profit' | 'fixed_per_unit';

export interface PartnerProfitShareRule {
  id: string;
  partnerId: { id: string; name: string; partnerType: string } | string;
  scope: ProfitShareRuleScope;
  branchId?: { id: string; name: string } | string | null;
  productId?: { id: string; name: string } | string | null;
  shareType: ProfitShareType;
  rate: number;
  sourcePurchaseId?: { id: string; invoiceNumber: string } | string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfitShareRuleRequest {
  partnerId: string;
  scope: ProfitShareRuleScope;
  branchId?: string;
  productId?: string;
  shareType: ProfitShareType;
  rate: number;
  sourcePurchaseId?: string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  isActive?: boolean;
  notes?: string;
}

export interface UpdateProfitShareRuleRequest {
  shareType?: ProfitShareType;
  rate?: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  isActive?: boolean;
  notes?: string;
}

export interface ProfitShareRulesResponse {
  results: PartnerProfitShareRule[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface ResolvedProfitShareRule {
  partnerId: string;
  ruleId: string;
  shareType: ProfitShareType;
  rate: number;
  scope?: ProfitShareRuleScope;
}

export interface ResolvedProfitShareRules {
  orgRules: ResolvedProfitShareRule[];
  productRules?: ResolvedProfitShareRule[];
}

export const partnerProfitShareRuleApi = createApi({
  reducerPath: 'partnerProfitShareRuleApi',
  baseQuery,
  tagTypes: ['PartnerProfitShareRule'],
  endpoints: (builder) => ({
    getProfitShareRules: builder.query<
      ProfitShareRulesResponse,
      { page?: number; limit?: number; partnerId?: string; scope?: ProfitShareRuleScope; productId?: string; isActive?: boolean } | void
    >({
      query: (params) => ({ url: '/partner-profit-share-rules', params: params || undefined }),
      providesTags: ['PartnerProfitShareRule'],
    }),
    resolveProfitShareRules: builder.query<ResolvedProfitShareRules, { productId?: string; date?: string }>({
      query: (params) => ({ url: '/partner-profit-share-rules/resolve', params }),
    }),
    createProfitShareRule: builder.mutation<PartnerProfitShareRule, CreateProfitShareRuleRequest>({
      query: (body) => ({ url: '/partner-profit-share-rules', method: 'POST', body }),
      invalidatesTags: ['PartnerProfitShareRule'],
    }),
    updateProfitShareRule: builder.mutation<PartnerProfitShareRule, { id: string; data: UpdateProfitShareRuleRequest }>({
      query: ({ id, data }) => ({ url: `/partner-profit-share-rules/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['PartnerProfitShareRule'],
    }),
    deleteProfitShareRule: builder.mutation<void, string>({
      query: (id) => ({ url: `/partner-profit-share-rules/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PartnerProfitShareRule'],
    }),
  }),
});

export const {
  useGetProfitShareRulesQuery,
  useLazyResolveProfitShareRulesQuery,
  useCreateProfitShareRuleMutation,
  useUpdateProfitShareRuleMutation,
  useDeleteProfitShareRuleMutation,
} = partnerProfitShareRuleApi;
