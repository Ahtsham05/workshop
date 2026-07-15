import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export interface BranchBankAccount {
  _id?: string;
  bankName?: string;
  accountTitle?: string;
  accountNumber?: string;
  iban?: string;
  instructions?: string;
  isActive?: boolean;
}

/** Default paper size used for invoices/receipts/statements printed from a branch */
export type PaperSize = 'thermal80' | 'thermal58' | 'a4' | 'a5';

/** A4/A5 invoice layout/design template */
export type InvoiceTemplate = 'standard' | 'compact' | 'modern' | 'classic' | 'bold';

/** Print orientation for the A5 paper size (ignored for other sizes) */
export type PrintOrientation = 'portrait' | 'landscape';

export interface BranchPrintSettings {
  paperSize: PaperSize;
  template?: InvoiceTemplate;
  printOrientation?: PrintOrientation;
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  nameUrdu?: string;
  location?: {
    address?: string;
    addressUrdu?: string;
    city?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  manager?: { id: string; name: string; email: string } | null;
  isDefault: boolean;
  isActive: boolean;
  /** Printed on receipts/invoices (thermal & HTML) for this branch */
  invoiceNote?: string;
  /** Default print paper size for this branch */
  printSettings?: BranchPrintSettings;
  /** Fee-collection bank accounts shown to parents/students in the portal */
  bankAccounts?: BranchBankAccount[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateBranchRequest {
  name: string;
  nameUrdu?: string;
  location?: {
    address?: string;
    addressUrdu?: string;
    city?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  manager?: string;
  isActive?: boolean;
  invoiceNote?: string;
  printSettings?: BranchPrintSettings;
  bankAccounts?: BranchBankAccount[];
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
