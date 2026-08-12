import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'won' | 'lost'
export type LeadSource = 'whatsapp' | 'referral' | 'walk_in' | 'facebook' | 'manual' | 'other'

export interface LeadStageHistoryEntry {
  stage: LeadStage
  enteredAt: string
  changedBy?: string
  note?: string
}

export interface LeadUserRef {
  id?: string
  _id?: string
  name: string
  email?: string
}

export interface Lead {
  id: string
  _id?: string
  organizationId: string
  branchId: string
  name: string
  companyName?: string
  email?: string
  phone?: string
  whatsapp?: string
  address?: string
  source: LeadSource
  stage: LeadStage
  stageEnteredAt: string
  stageHistory: LeadStageHistoryEntry[]
  estimatedValue: number
  assignedTo: string | LeadUserRef
  createdBy?: string | LeadUserRef
  lostReason?: string
  wonAt?: string
  lostAt?: string
  convertedCustomerId?: string
  convertedAt?: string
  createdAt: string
  updatedAt: string
}

export interface CreateLeadInput {
  name: string
  companyName?: string
  email?: string
  phone?: string
  whatsapp?: string
  address?: string
  source?: LeadSource
  estimatedValue?: number
  assignedTo?: string
}

export interface LeadListParams {
  stage?: LeadStage
  source?: LeadSource
  assignedTo?: string
  search?: string
  sortBy?: string
  limit?: number
  page?: number
}

export interface LeadListResult {
  results: Lead[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface ChangeLeadStageInput {
  id: string
  stage: LeadStage
  note?: string
  confirmSkip?: boolean
  lostReason?: string
}

export interface LeadDuplicateMatch {
  _id: string
  name: string
  companyName?: string
  stage: LeadStage
  phone?: string
  whatsapp?: string
  email?: string
  assignedTo?: string
  createdAt: string
}

export interface ConvertLeadInput {
  id: string
  name?: string
  email?: string
  phone?: string
  whatsapp?: string
  address?: string
  forceCreateNew?: boolean
}

export interface ConvertLeadResult {
  lead: Lead
  customer: { _id: string; name: string }
  alreadyConverted: boolean
  linkedExisting?: boolean
}

export type LeadTimelineEventKind = 'stage_change' | 'communication' | 'reminder' | 'quotation'

export interface LeadTimelineEvent {
  kind: LeadTimelineEventKind
  timestamp: string
  stage?: LeadStage
  note?: string
  changedBy?: string
  data?: Record<string, unknown>
}

export interface LeadTimelineResult {
  lead: Lead
  events: LeadTimelineEvent[]
}

export interface LeadStatsResult {
  totalCount: number
  byStage: { stage: LeadStage; count: number; totalValue: number }[]
  bySource: { source: LeadSource; count: number }[]
  wonCount: number
  lostCount: number
  conversionRate: number
  avgDaysToClose: number | null
}

// Single canonical arg shape for fetching the whole Kanban board — every consumer
// (the board itself, and the optimistic stage-change update below) must use this
// exact object so RTK Query resolves them to the same cache entry. Mirrors the
// REMINDER_POLL_OPTIONS "one named constant" convention in reminder-query-options.ts.
export const LEADS_BOARD_QUERY_PARAMS: LeadListParams = { limit: 500, sortBy: 'stageEnteredAt:desc' }

export const leadApi = createApi({
  reducerPath: 'leadApi',
  baseQuery,
  tagTypes: ['Lead', 'LeadStats', 'LeadTimeline'],
  endpoints: (builder) => ({
    getLeads: builder.query<LeadListResult, LeadListParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        Object.entries(params || {}).forEach(([key, value]) => {
          if (value !== undefined && value !== '') searchParams.set(key, String(value))
        })
        const qs = searchParams.toString()
        return { url: `/leads${qs ? `?${qs}` : ''}` }
      },
      providesTags: (result) =>
        result
          ? [...result.results.map((lead) => ({ type: 'Lead' as const, id: lead._id || lead.id })), { type: 'Lead' as const, id: 'LIST' }]
          : [{ type: 'Lead' as const, id: 'LIST' }],
    }),
    getLead: builder.query<Lead, string>({
      query: (id) => ({ url: `/leads/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'Lead', id }],
    }),
    getLeadTimeline: builder.query<LeadTimelineResult, string>({
      query: (id) => ({ url: `/leads/${id}/timeline` }),
      providesTags: (_r, _e, id) => [{ type: 'LeadTimeline', id }],
    }),
    getLeadStats: builder.query<LeadStatsResult, void>({
      query: () => ({ url: '/leads/stats' }),
      providesTags: ['LeadStats'],
    }),
    getLeadByCustomerId: builder.query<Lead | null, string>({
      query: (customerId) => ({ url: `/leads/by-customer/${customerId}` }),
      providesTags: (result) => (result ? [{ type: 'Lead' as const, id: result._id || result.id }] : []),
    }),
    checkLeadDuplicates: builder.query<
      { duplicates: LeadDuplicateMatch[] },
      { phone?: string; whatsapp?: string; email?: string; excludeId?: string }
    >({
      query: (params) => {
        const searchParams = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
          if (value) searchParams.set(key, String(value))
        })
        return { url: `/leads/check-duplicate?${searchParams.toString()}` }
      },
    }),
    createLead: builder.mutation<Lead, CreateLeadInput>({
      query: (body) => ({ url: '/leads', method: 'POST', body }),
      invalidatesTags: [{ type: 'Lead', id: 'LIST' }, 'LeadStats'],
    }),
    updateLead: builder.mutation<Lead, { id: string } & Partial<CreateLeadInput>>({
      query: ({ id, ...body }) => ({ url: `/leads/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Lead', id }, { type: 'Lead', id: 'LIST' }],
    }),
    changeLeadStage: builder.mutation<Lead, ChangeLeadStageInput>({
      query: ({ id, ...body }) => ({ url: `/leads/${id}/stage`, method: 'POST', body }),
      // Optimistic update so a Kanban drag feels instant instead of waiting on the
      // round trip — reverted automatically if the request fails (e.g. the 409
      // skip-confirmation case, which the caller retries with confirmSkip:true).
      async onQueryStarted({ id, stage }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          leadApi.util.updateQueryData('getLeads', LEADS_BOARD_QUERY_PARAMS, (draft) => {
            const lead = draft.results.find((l) => (l._id || l.id) === id)
            if (lead) {
              lead.stage = stage
              lead.stageEnteredAt = new Date().toISOString()
            }
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Lead', id }, { type: 'Lead', id: 'LIST' }, 'LeadStats', { type: 'LeadTimeline', id }],
    }),
    convertLead: builder.mutation<ConvertLeadResult, ConvertLeadInput>({
      query: ({ id, ...body }) => ({ url: `/leads/${id}/convert`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Lead', id }, { type: 'Lead', id: 'LIST' }, 'LeadStats', { type: 'LeadTimeline', id }],
    }),
    deleteLead: builder.mutation<void, string>({
      query: (id) => ({ url: `/leads/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Lead', id }, { type: 'Lead', id: 'LIST' }, 'LeadStats'],
    }),
  }),
})

export const {
  useGetLeadsQuery,
  useGetLeadQuery,
  useGetLeadTimelineQuery,
  useGetLeadStatsQuery,
  useGetLeadByCustomerIdQuery,
  useLazyCheckLeadDuplicatesQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useChangeLeadStageMutation,
  useConvertLeadMutation,
  useDeleteLeadMutation,
} = leadApi
