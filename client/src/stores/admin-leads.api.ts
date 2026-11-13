import { organizationApi } from './organization.api'
import { subscriptionApi } from './subscription.api'

/**
 * System-admin console: the organizations list (search / filters / pages) and the trial
 * signup sales pipeline. Injected into the existing subscriptionApi slice so it shares its
 * cache and the 'AdminOrganization' tag (deleting an org refreshes these lists too).
 */

export type LeadStage = 'new' | 'contacted' | 'demo' | 'negotiation' | 'won' | 'lost'
export type LeadTemperature = 'hot' | 'warm' | 'cold'
export type SubscriptionBucket = 'trial' | 'paid' | 'trial_expired' | 'lapsed' | 'pastDue' | 'gracePeriod' | string

export type OrgSubscriptionView = {
  planKey: string
  status: string
  bucket: SubscriptionBucket
  isTrial: boolean
  isPaid: boolean
  periodEnd: string | null
  daysRemaining: number | null
}

export type AdminOrgRow = {
  id: string
  name: string
  businessType: string
  email: string
  phone: string
  city: string
  country: string
  isActive: boolean
  createdAt: string
  owner: { id: string; name: string; email: string } | null
  subscription: OrgSubscriptionView
  usage: { users: number; branches: number; invoices: number; lastActivityAt: string | null }
  lead: {
    id: string
    stage: LeadStage
    temperature: LeadTemperature
    nextFollowUpAt: string | null
    nextFollowUpNote: string
    lastContactedAt: string | null
    isNew: boolean
  } | null
}

export type OrgBucket = 'all' | 'new' | 'trial' | 'paid' | 'trial_expired' | 'lapsed' | 'followup'

export type AdminOrgListArgs = {
  search?: string
  bucket?: OrgBucket
  businessType?: string
  plan?: string
  stage?: LeadStage | ''
  sortBy?: string
  page?: number
  limit?: number
}

export type AdminOrgList = {
  results: AdminOrgRow[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
  counts: Record<OrgBucket, number>
  facets: { businessTypes: string[]; plans: string[] }
}

export type LeadOrganization = {
  id: string
  name: string
  businessType: string
  email: string
  phone: string
  city: string
  country: string
  createdAt: string
  owner: { id: string; name: string; email: string } | null
  subscription: OrgSubscriptionView
}

export type PipelineLead = {
  id: string
  organizationId: string
  stage: LeadStage
  temperature: LeadTemperature
  source: 'self_signup' | 'backfill' | 'manual'
  expectedPlan: string
  expectedValue: number
  lostReason: string
  tags: string[]
  nextFollowUpAt: string | null
  nextFollowUpNote: string
  manualFollowUp: boolean
  lastContactedAt: string | null
  wonAt: string | null
  lostAt: string | null
  isNew: boolean
  createdAt: string
  assignedTo: { id: string; name: string } | null
  organization: LeadOrganization
}

export type PipelineStats = {
  newUnseen: number
  newThisWeek: number
  overdue: number
  dueToday: number
  dueNow: number
  activeTrials: number
  open: number
  won30: number
  lost30: number
  conversionRate30: number | null
  pipelineValue: number
  byStage: Record<LeadStage, number>
}

export type Touchpoint = {
  key: string
  day: number
  title: string
  goal: string
  channel: 'call' | 'whatsapp' | 'email'
  dueAt: string
  doneAt: string | null
  skippedAt: string | null
}

export type LeadActivity = {
  id: string
  type: 'call' | 'whatsapp' | 'email' | 'meeting' | 'note' | 'stage' | 'system'
  outcome: string | null
  text: string
  at: string
  byName: string
}

export type LeadDetail = PipelineLead & {
  playbook: Touchpoint[]
  activities: LeadActivity[]
  usage: {
    users: number
    branches: number
    invoices: number
    products: number
    lastInvoiceAt: string | null
    ownerLastSeenAt: string | null
  }
}

export type LeadAlerts = {
  serverNow: string
  newSignups: { organizationId: string; createdAt: string; name: string; businessType: string; phone: string; ownerName: string }[]
  dueFollowUps: { organizationId: string; dueAt: string; note: string; name: string; businessType: string; phone: string; ownerName: string }[]
}

export type LeadUpdate = Partial<{
  stage: LeadStage
  temperature: LeadTemperature
  expectedPlan: string
  expectedValue: number
  lostReason: string
  tags: string[]
  nextFollowUpAt: string | null
  nextFollowUpNote: string
}>

export type LeadActivityInput = {
  type: 'call' | 'whatsapp' | 'email' | 'meeting' | 'note'
  outcome?: string | null
  text?: string
  completeTouchpoint?: string | null
  nextFollowUpAt?: string | null
  nextFollowUpNote?: string
}

export type PurgeCandidate = {
  id: string
  name: string
  businessType: string
  phone: string
  city: string
  owner: { name: string; email: string } | null
  createdAt: string
  periodEnd: string | null
  users: number
  realInvoices: number
  lastInvoiceAt: string | null
  /** Set when the server will refuse this org (e.g. the admin's own org). */
  blocked: string | null
}

export type PurgeResult = {
  success: boolean
  id: string
  name: string
  message: string
  totalDocuments: number
  collections: number
  usersDeleted: number
  usersDetached: number
  leftovers: Record<string, number>
  backupFile: string
  durationMs: number
}

export type ActivationPlan = {
  key: string
  name: string
  description: string
  badge: string | null
  priceUsdMonthly: number
  pricePkrMonthly: number
  limits: { maxUsers: number; maxBranches: number; maxInvoicesPerMonth: number }
  isPublic: boolean
}

export type ActivationCurrent = {
  planKey: string
  planName: string
  status: string
  currentPeriodEnd: string | null
  paymentSource: string | null
  hasCardSubscription?: boolean
}

export type ActivationOptions = {
  organization: { id: string; name: string; ownerName: string; ownerEmail: string }
  current: ActivationCurrent
  plans: ActivationPlan[]
  months: number[]
  pkrPerUsd: number
}

export type ActivationAppliedAs = 'new' | 'renewal' | 'upgrade' | 'scheduledDowngrade' | 'custom'

export type ActivationPreview = {
  plan: { key: string; name: string; priceUsdMonthly: number }
  current: ActivationCurrent
  direction: 'new' | 'upgrade' | 'downgrade' | 'same'
  appliedAs: ActivationAppliedAs
  periodStart: string
  periodEnd: string
  scheduled: boolean
  quote: { months: number; usdAmount: number; amountPkr: number; pkrPerUsd: number }
  warnings: { limit: string; used: number; allowed: number; message: string }[]
}

export type ActivationPayment = {
  amountPkr: number
  method: 'cash' | 'bank_transfer' | 'jazzcash' | 'easypaisa' | 'card' | 'other'
  transactionId?: string
  payerName?: string
  paidOn?: string
}

export type ActivationInput = {
  orgId: string
  planKey: string
  months?: number
  until?: string
  note: string
  notifyOwner: boolean
  payment: ActivationPayment | null
}

const api = subscriptionApi.enhanceEndpoints({ addTagTypes: ['AdminLead'] }).injectEndpoints({
  endpoints: (builder) => ({
    adminListOrganizations: builder.query<AdminOrgList, AdminOrgListArgs>({
      query: (params) => ({ url: '/admin/organizations', params }),
      providesTags: ['AdminOrganization', 'AdminLead'],
    }),
    adminGetLeadPipeline: builder.query<{ results: PipelineLead[]; stats: PipelineStats; serverNow: string }, { search?: string } | void>({
      query: (params) => ({ url: '/admin/leads', params: params || {} }),
      providesTags: ['AdminLead'],
    }),
    adminGetLeadAlerts: builder.query<LeadAlerts, void>({
      query: () => '/admin/leads/alerts',
      providesTags: ['AdminLead'],
    }),
    adminGetLead: builder.query<LeadDetail, string>({
      query: (orgId) => `/admin/leads/${orgId}`,
      providesTags: (_r, _e, orgId) => [{ type: 'AdminLead', id: orgId }],
    }),
    adminUpdateLead: builder.mutation<LeadDetail, { orgId: string; body: LeadUpdate }>({
      query: ({ orgId, body }) => ({ url: `/admin/leads/${orgId}`, method: 'PATCH', body }),
      invalidatesTags: ['AdminLead'],
    }),
    adminAddLeadActivity: builder.mutation<LeadDetail, { orgId: string; body: LeadActivityInput }>({
      query: ({ orgId, body }) => ({ url: `/admin/leads/${orgId}/activities`, method: 'POST', body }),
      invalidatesTags: ['AdminLead'],
    }),
    adminSetLeadTouchpoint: builder.mutation<LeadDetail, { orgId: string; key: string; action: 'done' | 'skip' | 'reopen' }>({
      query: ({ orgId, key, action }) => ({ url: `/admin/leads/${orgId}/playbook/${key}`, method: 'POST', body: { action } }),
      invalidatesTags: ['AdminLead'],
    }),
    adminSnoozeLead: builder.mutation<LeadDetail, { orgId: string; minutes: number }>({
      query: ({ orgId, minutes }) => ({ url: `/admin/leads/${orgId}/snooze`, method: 'POST', body: { minutes } }),
      invalidatesTags: ['AdminLead'],
    }),
    adminGetPurgeCandidates: builder.query<{ bucket: string; results: PurgeCandidate[] }, { bucket: 'trial_expired' | 'lapsed' }>({
      query: (params) => ({ url: '/admin/organizations/purge-candidates', params }),
      keepUnusedDataFor: 0,
    }),
    /**
     * Deletes one org (backup → transaction → verify on the server). No cache invalidation
     * here — the bulk dialog runs many of these in a row and refreshes the lists once at the end.
     */
    adminPurgeOrganization: builder.mutation<PurgeResult, { orgId: string; expectBucket?: 'trial_expired' | 'lapsed' }>({
      query: ({ orgId, expectBucket }) => ({
        url: `/admin/organizations/${orgId}`,
        method: 'DELETE',
        params: expectBucket ? { expectBucket } : undefined,
        // backup + transaction over ~170 collections; a large org can take a while on Atlas
        timeout: 120_000,
      }),
    }),
    adminGetActivationOptions: builder.query<ActivationOptions, string>({
      query: (orgId) => `/admin/organizations/${orgId}/activation`,
      keepUnusedDataFor: 0,
    }),
    adminPreviewActivation: builder.query<ActivationPreview, { orgId: string; planKey: string; months?: number; until?: string }>({
      query: ({ orgId, ...params }) => ({ url: `/admin/organizations/${orgId}/activation/preview`, params }),
      keepUnusedDataFor: 0,
    }),
    adminActivatePlan: builder.mutation<ActivationPreview & { receiptNumber: string | null; paymentId: string | null }, ActivationInput>({
      query: ({ orgId, ...body }) => ({ url: `/admin/organizations/${orgId}/activation`, method: 'POST', body }),
      invalidatesTags: ['AdminOrganization', 'AdminPayment', 'AdminLead'],
    }),
    /** One-click business type switch (org + all its users). Logged on the lead history. */
    adminSetBusinessType: builder.mutation<
      { id: string; businessType: string; previousBusinessType: string },
      { orgId: string; businessType: string }
    >({
      query: ({ orgId, businessType }) => ({
        url: `/admin/organizations/${orgId}/business-type`,
        method: 'PATCH',
        body: { businessType },
      }),
      invalidatesTags: ['AdminOrganization', 'AdminLead'],
      // If the admin switched their own org, their own menus must follow right away.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          dispatch(organizationApi.util.invalidateTags(['Organization']))
        } catch {
          // The caller shows the error.
        }
      },
    }),
    adminAcknowledgeLeads: builder.mutation<{ acknowledged: number }, { organizationIds?: string[] }>({
      query: (body) => ({ url: '/admin/leads/acknowledge', method: 'POST', body }),
      invalidatesTags: ['AdminLead'],
    }),
  }),
})

export const {
  useAdminListOrganizationsQuery,
  useAdminGetLeadPipelineQuery,
  useAdminGetLeadAlertsQuery,
  useAdminGetLeadQuery,
  useAdminUpdateLeadMutation,
  useAdminAddLeadActivityMutation,
  useAdminSetLeadTouchpointMutation,
  useAdminSnoozeLeadMutation,
  useAdminAcknowledgeLeadsMutation,
  useAdminGetPurgeCandidatesQuery,
  useAdminPurgeOrganizationMutation,
  useAdminGetActivationOptionsQuery,
  useAdminPreviewActivationQuery,
  useAdminActivatePlanMutation,
  useAdminSetBusinessTypeMutation,
} = api

export const adminLeadsApi = api

/** One shared poll for the alerts feed (header badge + watchdog) — see notification-query-options.ts. */
export const LEAD_ALERTS_POLL_OPTIONS = {
  pollingInterval: 60_000,
  // Not RTK's refetchOnFocus (fires on every focus); the bell refetches on focus only when
  // the copy is stale — see useRefetchOnFocusIfStale in components/layout/admin-leads-bell.tsx.
  refetchOnFocus: false,
  refetchOnReconnect: true,
} as const
