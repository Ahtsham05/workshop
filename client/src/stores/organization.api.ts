import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

export interface SubscriptionLimits {
  maxBranches: number;
  maxUsers: number;
}

export interface Subscription {
  planType: 'trial' | 'single' | 'multi' | 'starter' | 'growth' | 'business' | 'enterprise';
  status: 'active' | 'expired' | 'pending';
  startDate?: string;
  endDate?: string;
  isTrial: boolean;
  limits: SubscriptionLimits;
}

export interface SubscriptionUsage {
  subscription: Subscription | null;
  branchesUsed: number;
  usersUsed: number;
}

export interface Organization {
  id: string;
  name: string;
  businessType: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  website?: string;
  description?: string;
  logo?: { url: string; publicId: string };
  owner: string | { id: string; name: string; email: string };
  subscription?: Subscription;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SetupOrganizationRequest {
  name: string;
  businessType: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  website?: string;
  description?: string;
}

export const organizationApi = createApi({
  reducerPath: 'organizationApi',
  baseQuery,
  tagTypes: ['Organization'],
  endpoints: (builder) => ({
    setupOrganization: builder.mutation<{ organization: Organization; branch: any }, SetupOrganizationRequest>({
      query: (body) => ({
        url: '/organizations/setup',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Organization'],
    }),
    getMyOrganization: builder.query<Organization, void>({
      query: () => '/organizations/me',
      providesTags: ['Organization'],
    }),
    updateOrganization: builder.mutation<Organization, { orgId: string; body: Partial<SetupOrganizationRequest> }>({
      query: ({ orgId, body }) => ({
        url: `/organizations/${orgId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Organization'],
    }),
    getSubscriptionUsage: builder.query<SubscriptionUsage, void>({
      query: () => '/payments/subscription/usage',
      providesTags: ['Organization'],
    }),
  }),
});

export const {
  useSetupOrganizationMutation,
  useGetMyOrganizationQuery,
  useUpdateOrganizationMutation,
  useGetSubscriptionUsageQuery,
} = organizationApi;
