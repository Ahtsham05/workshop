import { subscriptionApi } from './subscription.api'
import type { ImpersonationStartResult } from '@/lib/impersonation'

export type ImpersonationSessionRow = {
  id: string
  adminName: string
  targetUserId: string
  targetName: string
  targetEmail: string
  organizationId: string | null
  organizationName: string
  reason: string
  startedAt: string
  expiresAt: string
  endedAt: string | null
  endedBy: 'admin' | 'expired' | 'admin_panel' | null
  active: boolean
  writeCount: number
  ip: string
}

const api = subscriptionApi.enhanceEndpoints({ addTagTypes: ['AdminImpersonation'] }).injectEndpoints({
  endpoints: (builder) => ({
    adminImpersonateUser: builder.mutation<ImpersonationStartResult, { userId: string; minutes: number; reason: string }>({
      query: ({ userId, ...body }) => ({ url: `/admin/users/${userId}/impersonate`, method: 'POST', body }),
      invalidatesTags: ['AdminImpersonation'],
    }),
    adminListImpersonations: builder.query<{ results: ImpersonationSessionRow[] }, { organizationId?: string; targetUserId?: string; limit?: number }>({
      query: (params) => ({ url: '/admin/impersonations', params }),
      providesTags: ['AdminImpersonation'],
    }),
    adminEndImpersonation: builder.mutation<{ ended: boolean }, string>({
      query: (sessionId) => ({ url: `/admin/impersonations/${sessionId}/end`, method: 'POST' }),
      invalidatesTags: ['AdminImpersonation'],
    }),
  }),
})

export const { useAdminImpersonateUserMutation, useAdminListImpersonationsQuery, useAdminEndImpersonationMutation } = api
