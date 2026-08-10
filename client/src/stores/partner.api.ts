import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export type PartnerType = 'business_partner' | 'product_investor';

export interface Partner {
  id: string;
  organizationId: string;
  branchId?: { id: string; name: string } | string | null;
  name: string;
  partnerType: PartnerType;
  phone?: string;
  email?: string;
  cnic?: string;
  address?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePartnerRequest {
  branchId?: string | null;
  name: string;
  partnerType?: PartnerType;
  phone?: string;
  email?: string;
  cnic?: string;
  address?: string;
  isActive?: boolean;
  notes?: string;
}

export interface UpdatePartnerRequest {
  name?: string;
  partnerType?: PartnerType;
  phone?: string;
  email?: string;
  cnic?: string;
  address?: string;
  isActive?: boolean;
  notes?: string;
}

export interface PartnersResponse {
  results: Partner[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export const partnerApi = createApi({
  reducerPath: 'partnerApi',
  baseQuery,
  tagTypes: ['Partner'],
  endpoints: (builder) => ({
    getPartners: builder.query<
      PartnersResponse,
      { page?: number; limit?: number; partnerType?: PartnerType; isActive?: boolean; search?: string } | void
    >({
      query: (params) => ({ url: '/partners', params: params || undefined }),
      providesTags: ['Partner'],
    }),
    getAllPartners: builder.query<Partner[], { isActive?: boolean } | void>({
      query: (params) => ({ url: '/partners/all', params: params || undefined }),
      providesTags: ['Partner'],
    }),
    createPartner: builder.mutation<Partner, CreatePartnerRequest>({
      query: (body) => ({ url: '/partners', method: 'POST', body }),
      invalidatesTags: ['Partner'],
    }),
    updatePartner: builder.mutation<Partner, { id: string; data: UpdatePartnerRequest }>({
      query: ({ id, data }) => ({ url: `/partners/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: ['Partner'],
    }),
    deletePartner: builder.mutation<void, string>({
      query: (id) => ({ url: `/partners/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Partner'],
    }),
  }),
});

export const {
  useGetPartnersQuery,
  useGetAllPartnersQuery,
  useCreatePartnerMutation,
  useUpdatePartnerMutation,
  useDeletePartnerMutation,
} = partnerApi;
