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
  nameUrdu?: string;
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
  nameUrdu?: string;
  /** Urdu label for the auto-created default branch (optional). */
  defaultBranchNameUrdu?: string;
  businessType: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  website?: string;
  description?: string;
  logoFile?: File | null;
}

export const organizationApi = createApi({
  reducerPath: 'organizationApi',
  baseQuery,
  tagTypes: ['Organization'],
  endpoints: (builder) => ({
    setupOrganization: builder.mutation<{ organization: Organization; branch: any }, SetupOrganizationRequest>({
      query: (body) => {
        const formData = new FormData();
        formData.append('name', body.name);
        if (body.nameUrdu != null) formData.append('nameUrdu', body.nameUrdu);
        if (body.defaultBranchNameUrdu != null) formData.append('defaultBranchNameUrdu', body.defaultBranchNameUrdu);
        formData.append('businessType', body.businessType);
        if (body.email) formData.append('email', body.email);
        if (body.phone) formData.append('phone', body.phone);
        if (body.address) formData.append('address', body.address);
        if (body.city) formData.append('city', body.city);
        if (body.country) formData.append('country', body.country);
        if (body.taxNumber) formData.append('taxNumber', body.taxNumber);
        if (body.website) formData.append('website', body.website);
        if (body.description) formData.append('description', body.description);
        if (body.logoFile) formData.append('logo', body.logoFile);

        return {
          url: '/organizations/setup',
          method: 'POST',
          body: formData,
        };
      },
      invalidatesTags: ['Organization'],
    }),
    getMyOrganization: builder.query<Organization, void>({
      query: () => '/organizations/me',
      providesTags: ['Organization'],
      keepUnusedDataFor: 60, // Re-fetch after 60s so plan changes propagate quickly
    }),
    updateOrganization: builder.mutation<
      Organization,
      { orgId: string; body: Partial<SetupOrganizationRequest>; logoFile?: File | null; removeLogo?: boolean }
    >({
      query: ({ orgId, body, logoFile, removeLogo }) => {
        const formData = new FormData();
        if (body.name) formData.append('name', body.name);
        if (body.nameUrdu !== undefined) formData.append('nameUrdu', body.nameUrdu);
        if (body.businessType) formData.append('businessType', body.businessType);
        if (body.email) formData.append('email', body.email);
        if (body.phone) formData.append('phone', body.phone);
        if (body.address) formData.append('address', body.address);
        if (body.city) formData.append('city', body.city);
        if (body.country) formData.append('country', body.country);
        if (body.taxNumber) formData.append('taxNumber', body.taxNumber);
        if (body.website) formData.append('website', body.website);
        if (body.description) formData.append('description', body.description);
        if (logoFile) formData.append('logo', logoFile);
        if (removeLogo) formData.append('removeLogo', 'true');

        return {
          url: `/organizations/${orgId}`,
          method: 'PATCH',
          body: formData,
        };
      },
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
