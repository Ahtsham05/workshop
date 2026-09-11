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

export type TaxSystem = 'NONE' | 'VAT' | 'SALES_TAX' | 'GST' | 'CUSTOM';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

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
  /** ISO 3166-1 alpha-2 code — added alongside the legacy free-text `country` above. */
  countryCode?: string;
  taxNumber?: string;
  website?: string;
  description?: string;
  logo?: { url: string; publicId: string };
  owner: string | { id: string; name: string; email: string };
  subscription?: Subscription;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Localization / Currency / Tax settings
  baseCurrency?: string | null;
  enabledCurrencies?: string[];
  taxSystem?: TaxSystem;
  taxInclusivePricingDefault?: boolean;
  defaultTaxCategoryId?: string | null;
  locale?: string;
  dateFormat?: DateFormat;
}

export interface UpdateOrganizationSettingsRequest {
  countryCode?: string | null;
  baseCurrency?: string | null;
  enabledCurrencies?: string[];
  taxSystem?: TaxSystem;
  taxInclusivePricingDefault?: boolean;
  defaultTaxCategoryId?: string | null;
  locale?: string;
  dateFormat?: DateFormat;
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
  countryCode?: string;
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
        if (body.countryCode) formData.append('countryCode', body.countryCode);
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
        if (body.countryCode) formData.append('countryCode', body.countryCode);
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
    // Plain-JSON variant of updateOrganization for the Localization/Currency/Tax settings
    // pages, which need to send a real array (enabledCurrencies) and booleans — FormData
    // (used above for the Business Profile tab, which also uploads a logo file) can't
    // represent those without lossy string-encoding tricks.
    updateOrganizationSettings: builder.mutation<Organization, { orgId: string; body: UpdateOrganizationSettingsRequest }>({
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
    // Wipes and reseeds this trial org's sample data (Products, Customers, Suppliers,
    // Categories, Invoices, Purchases, Expenses). The server responds immediately and
    // runs the actual clear+reseed in the background (it can take a minute or two), so
    // this resolves right away with just a status message, not the finished counts.
    resetDemoData: builder.mutation<{ success: boolean; message: string }, string>({
      query: (orgId) => ({
        url: `/organizations/${orgId}/demo-data/reset`,
        method: 'POST',
      }),
    }),
  }),
});

export const {
  useSetupOrganizationMutation,
  useGetMyOrganizationQuery,
  useLazyGetMyOrganizationQuery,
  useUpdateOrganizationMutation,
  useUpdateOrganizationSettingsMutation,
  useGetSubscriptionUsageQuery,
  useResetDemoDataMutation,
} = organizationApi;
