import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export interface SalesmanProfile {
  id: string;
  userId: { id: string; name: string; email: string } | string;
  salesmanCode: string;
  phone?: string;
  cnic?: string;
  defaultCommissionRate: number;
  status: 'active' | 'inactive';
  joiningDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSalesmanProfileRequest {
  userId: string;
  phone?: string;
  cnic?: string;
  defaultCommissionRate?: number;
  status?: 'active' | 'inactive';
  joiningDate?: string;
  notes?: string;
}

export interface UpdateSalesmanProfileRequest {
  phone?: string;
  cnic?: string;
  defaultCommissionRate?: number;
  status?: 'active' | 'inactive';
  joiningDate?: string;
  notes?: string;
}

export interface SalesmanProfilesResponse {
  results: SalesmanProfile[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export const salesmanProfileApi = createApi({
  reducerPath: 'salesmanProfileApi',
  baseQuery,
  tagTypes: ['SalesmanProfile'],
  endpoints: (builder) => ({
    getSalesmanProfiles: builder.query<
      SalesmanProfilesResponse,
      { page?: number; limit?: number; status?: 'active' | 'inactive'; search?: string; fieldName?: string } | void
    >({
      query: (params) => ({ url: '/salesmen', params: params || undefined }),
      providesTags: ['SalesmanProfile'],
    }),
    getAllSalesmanProfiles: builder.query<SalesmanProfile[], { status?: 'active' | 'inactive' } | void>({
      query: (params) => ({ url: '/salesmen/all', params: params || undefined }),
      providesTags: ['SalesmanProfile'],
    }),
    getSalesmanProfile: builder.query<SalesmanProfile, string>({
      query: (id) => `/salesmen/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'SalesmanProfile', id }],
    }),
    createSalesmanProfile: builder.mutation<SalesmanProfile, CreateSalesmanProfileRequest>({
      query: (body) => ({ url: '/salesmen', method: 'POST', body }),
      invalidatesTags: ['SalesmanProfile'],
    }),
    updateSalesmanProfile: builder.mutation<SalesmanProfile, { id: string; data: UpdateSalesmanProfileRequest }>({
      query: ({ id, data }) => ({ url: `/salesmen/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'SalesmanProfile', id }, 'SalesmanProfile'],
    }),
    deleteSalesmanProfile: builder.mutation<void, string>({
      query: (id) => ({ url: `/salesmen/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SalesmanProfile'],
    }),
  }),
});

export const {
  useGetSalesmanProfilesQuery,
  useGetAllSalesmanProfilesQuery,
  useGetSalesmanProfileQuery,
  useCreateSalesmanProfileMutation,
  useUpdateSalesmanProfileMutation,
  useDeleteSalesmanProfileMutation,
} = salesmanProfileApi;
