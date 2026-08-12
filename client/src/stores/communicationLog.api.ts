import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export type CommunicationType = 'call' | 'whatsapp' | 'sms' | 'email' | 'meeting' | 'note' | 'visit' | 'other'
export type CommunicationOutcome = 'positive' | 'neutral' | 'negative' | 'no_answer' | 'follow_up_needed'
export type RelatedRecordType = 'Customer' | 'Supplier' | 'Lead'

export interface CommunicationLog {
  id: string
  _id?: string
  organizationId: string
  branchId: string
  relatedType: RelatedRecordType
  relatedId: string
  type: CommunicationType
  direction: 'outgoing' | 'incoming'
  subject?: string
  notes: string
  outcome?: CommunicationOutcome
  reminderId?: string
  createdBy?: { id: string; name?: string } | string
  updatedBy?: string
  createdAt: string
  updatedAt: string
}

export interface CreateCommunicationLogInput {
  relatedType: RelatedRecordType
  relatedId: string
  type: CommunicationType
  direction?: 'outgoing' | 'incoming'
  subject?: string
  notes: string
  outcome?: CommunicationOutcome
  followUpAt?: string
  followUpPriority?: 'low' | 'medium' | 'high' | 'urgent'
}

export interface CommunicationLogListResult {
  results: CommunicationLog[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export const communicationLogApi = createApi({
  reducerPath: 'communicationLogApi',
  baseQuery,
  tagTypes: ['CommunicationLog'],
  endpoints: (builder) => ({
    getCommunicationLogs: builder.query<
      CommunicationLogListResult,
      { relatedType: RelatedRecordType; relatedId: string; limit?: number } | void
    >({
      query: (params) => {
        const searchParams = new URLSearchParams()
        if (params?.relatedType) searchParams.set('relatedType', params.relatedType)
        if (params?.relatedId) searchParams.set('relatedId', params.relatedId)
        if (params?.limit) searchParams.set('limit', String(params.limit))
        const qs = searchParams.toString()
        return { url: `/communication-logs${qs ? `?${qs}` : ''}` }
      },
      providesTags: ['CommunicationLog'],
    }),
    createCommunicationLog: builder.mutation<CommunicationLog, CreateCommunicationLogInput>({
      query: (body) => ({ url: '/communication-logs', method: 'POST', body }),
      invalidatesTags: ['CommunicationLog'],
    }),
    updateCommunicationLog: builder.mutation<CommunicationLog, { id: string } & Partial<CreateCommunicationLogInput>>({
      query: ({ id, ...body }) => ({ url: `/communication-logs/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['CommunicationLog'],
    }),
    deleteCommunicationLog: builder.mutation<void, string>({
      query: (id) => ({ url: `/communication-logs/${id}`, method: 'DELETE' }),
      invalidatesTags: ['CommunicationLog'],
    }),
  }),
})

export const {
  useGetCommunicationLogsQuery,
  useCreateCommunicationLogMutation,
  useUpdateCommunicationLogMutation,
  useDeleteCommunicationLogMutation,
} = communicationLogApi
