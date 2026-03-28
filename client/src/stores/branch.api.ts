import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  location?: {
    address?: string;
    city?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  manager?: { id: string; name: string; email: string } | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBranchRequest {
  name: string;
  location?: {
    address?: string;
    city?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  manager?: string;
  isActive?: boolean;
}

export interface BranchesResponse {
  results: Branch[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export const branchApi = createApi({
  reducerPath: 'branchApi',
  baseQuery,
  tagTypes: ['Branch'],
  endpoints: (builder) => ({
    getMyBranches: builder.query<Branch[], void>({
      query: () => '/branches/my',
      providesTags: ['Branch'],
    }),
    getBranches: builder.query<BranchesResponse, { page?: number; limit?: number }>({
      query: (params) => ({
        url: '/branches',
        params,
      }),
      providesTags: ['Branch'],
    }),
    getBranch: builder.query<Branch, string>({
      query: (branchId) => `/branches/${branchId}`,
      providesTags: (_result, _error, id) => [{ type: 'Branch', id }],
    }),
    createBranch: builder.mutation<Branch, CreateBranchRequest>({
      query: (body) => ({
        url: '/branches',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Branch'],
    }),
    updateBranch: builder.mutation<Branch, { branchId: string; body: Partial<CreateBranchRequest> }>({
      query: ({ branchId, body }) => ({
        url: `/branches/${branchId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Branch'],
    }),
    deleteBranch: builder.mutation<void, string>({
      query: (branchId) => ({
        url: `/branches/${branchId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Branch'],
    }),
  }),
});

export const {
  useGetMyBranchesQuery,
  useGetBranchesQuery,
  useGetBranchQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
} = branchApi;
