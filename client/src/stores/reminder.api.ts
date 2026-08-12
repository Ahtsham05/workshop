import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import type { RelatedRecordType } from './communicationLog.api'

export type ReminderPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ReminderStatus = 'pending' | 'completed' | 'snoozed' | 'cancelled'
export type ReminderRepeat = 'none' | 'daily' | 'weekly' | 'monthly'
export type ReminderChannel = 'push' | 'whatsapp'

export interface Reminder {
  id: string
  _id?: string
  organizationId: string
  branchId: string
  title: string
  description?: string
  relatedType?: RelatedRecordType
  relatedId?: string
  dueAt: string
  priority: ReminderPriority
  status: ReminderStatus
  assignedTo: string
  createdBy?: string
  notifyChannels: ReminderChannel[]
  whatsappPhone?: string
  repeat: ReminderRepeat
  remindedAt?: string | null
  completedAt?: string
  snoozedUntil?: string
  sourceCommunicationLogId?: string
  createdAt: string
  updatedAt: string
}

export interface CreateReminderInput {
  title: string
  description?: string
  relatedType?: RelatedRecordType
  relatedId?: string
  dueAt: string
  priority?: ReminderPriority
  assignedTo?: string
  notifyChannels?: ReminderChannel[]
  whatsappPhone?: string
  repeat?: ReminderRepeat
}

export interface ReminderListParams {
  status?: ReminderStatus
  priority?: ReminderPriority
  relatedType?: RelatedRecordType
  relatedId?: string
  search?: string
  from?: string
  to?: string
  limit?: number
}

export interface ReminderListResult {
  results: Reminder[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export const reminderApi = createApi({
  reducerPath: 'reminderApi',
  baseQuery,
  tagTypes: ['Reminder'],
  endpoints: (builder) => ({
    getReminders: builder.query<ReminderListResult, ReminderListParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()
        Object.entries(params || {}).forEach(([key, value]) => {
          if (value !== undefined && value !== '') searchParams.set(key, String(value))
        })
        const qs = searchParams.toString()
        return { url: `/reminders${qs ? `?${qs}` : ''}` }
      },
      providesTags: ['Reminder'],
    }),
    createReminder: builder.mutation<Reminder, CreateReminderInput>({
      query: (body) => ({ url: '/reminders', method: 'POST', body }),
      invalidatesTags: ['Reminder'],
    }),
    updateReminder: builder.mutation<Reminder, { id: string } & Partial<CreateReminderInput>>({
      query: ({ id, ...body }) => ({ url: `/reminders/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Reminder'],
    }),
    completeReminder: builder.mutation<Reminder, string>({
      query: (id) => ({ url: `/reminders/${id}/complete`, method: 'POST' }),
      invalidatesTags: ['Reminder'],
    }),
    snoozeReminder: builder.mutation<Reminder, { id: string; snoozedUntil: string }>({
      query: ({ id, snoozedUntil }) => ({ url: `/reminders/${id}/snooze`, method: 'POST', body: { snoozedUntil } }),
      invalidatesTags: ['Reminder'],
    }),
    deleteReminder: builder.mutation<void, string>({
      query: (id) => ({ url: `/reminders/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Reminder'],
    }),
  }),
})

export const {
  useGetRemindersQuery,
  useCreateReminderMutation,
  useUpdateReminderMutation,
  useCompleteReminderMutation,
  useSnoozeReminderMutation,
  useDeleteReminderMutation,
} = reminderApi
