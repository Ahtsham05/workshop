import { createApi } from '@reduxjs/toolkit/query/react'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

const prepareHeaders = (headers: Headers) => {
  const token = localStorage.getItem('accessToken')
  if (token) headers.set('authorization', `Bearer ${token}`)
  const activeBranchId = localStorage.getItem('activeBranchId')
  if (activeBranchId) headers.set('x-branch-id', activeBranchId)
  return headers
}

const cloudBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  const baseQuery = createAppFetchBaseQuery({ baseUrl: `${baseUrl}/whatsapp-cloud`, prepareHeaders })
  return baseQuery(args, api, extra)
}

export type WhatsAppCloudConnection = {
  id?: string
  status: 'pending' | 'connected' | 'disconnected' | 'token_expired' | 'webhook_pending' | 'error'
  connected: boolean
  wabaId?: string
  phoneNumberId?: string
  displayPhoneNumber?: string
  verifiedName?: string
  webhookSubscribed?: boolean
  qualityRating?: string
  messagingLimit?: string
  connectedAt?: string
  lastError?: string
}

export type WhatsAppConversation = {
  id: string
  contactPhone: string
  contactName?: string
  avatarUrl?: string
  lastMessageAt?: string
  lastMessagePreview?: string
  lastMessageDirection?: 'inbound' | 'outbound'
  unreadCount: number
  status: 'open' | 'closed' | 'spam'
}

export type WhatsAppMessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed'

export type WhatsAppMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  type: string
  content: { text?: string; caption?: string; mediaUrl?: string; mediaMimeType?: string; filename?: string }
  status: WhatsAppMessageStatus
  errorMessage?: string
  errorCode?: string
  createdAt: string
}

export type WhatsAppTemplate = {
  id: string
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED'
  internalCategory: string
  variableCount: number
  rejectionReason?: string
  components?: Array<{ type: string; text?: string }>
  updatedAt: string
}

export type WhatsAppTemplateSuggestion = {
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  internalCategory: string
  bodyText: string
  variableCount: number
  alreadyCreated: boolean
  status: WhatsAppTemplate['status'] | null
}

export type FunnelRange = 'today' | '7d' | '30d'

export type FunnelStage = {
  key: 'sent' | 'delivered' | 'read' | 'replied'
  label: string
  count: number
  percentOfSent: number
}

export type FunnelStats = {
  range: FunnelRange
  since: string
  stages: FunnelStage[]
}

export type ActivityEventType =
  | 'message_received'
  | 'message_sent'
  | 'message_queued'
  | 'message_delivered'
  | 'message_read'
  | 'message_failed'
  | 'template_approved'
  | 'conversation_started'

export type ActivityEvent = {
  id: string
  type: ActivityEventType
  description: string
  phone?: string
  timestamp: string
}

export type ExpiringConversation = {
  conversationId: string
  name: string
  phone?: string
  lastInboundAt: string
  expiresAt: string
  minutesRemaining: number
}

export type ExpiringWindows = {
  expiringWithinHour: number
  items: ExpiringConversation[]
}

export const whatsappCloudApi = createApi({
  reducerPath: 'whatsappCloudApi',
  baseQuery: cloudBaseQuery,
  tagTypes: ['WhatsAppConnection', 'WhatsAppConversations', 'WhatsAppMessages', 'WhatsAppAnalytics', 'WhatsAppTemplates'],
  endpoints: (builder) => ({
    getCloudConnection: builder.query<WhatsAppCloudConnection, void>({
      query: () => '/connection',
      providesTags: ['WhatsAppConnection'],
    }),
    startEmbeddedSignup: builder.mutation<
      { appId: string; configId: string; redirectUri: string; frontendRedirectUrl: string; state: string },
      void
    >({
      query: () => ({ url: '/connection/embedded-signup/start', method: 'POST' }),
    }),
    reconnectCloud: builder.mutation<WhatsAppCloudConnection, void>({
      query: () => ({ url: '/connection/reconnect', method: 'POST' }),
      invalidatesTags: ['WhatsAppConnection'],
    }),
    disconnectCloud: builder.mutation<WhatsAppCloudConnection, void>({
      query: () => ({ url: '/connection/disconnect', method: 'POST' }),
      invalidatesTags: ['WhatsAppConnection'],
    }),
    getConversations: builder.query<
      { results: WhatsAppConversation[]; totalResults: number; page: number; totalPages: number },
      { search?: string; unreadOnly?: boolean; page?: number; limit?: number }
    >({
      query: (params) => ({ url: '/conversations', params }),
      providesTags: ['WhatsAppConversations'],
    }),
    getConversationMessages: builder.query<
      { results: WhatsAppMessage[]; totalResults: number },
      { id: string; page?: number; limit?: number }
    >({
      query: ({ id, ...params }) => ({ url: `/conversations/${id}/messages`, params }),
      providesTags: (_r, _e, arg) => [{ type: 'WhatsAppMessages', id: arg.id }],
    }),
    getUnreadCount: builder.query<{ count: number }, void>({
      query: () => '/conversations/unread-count',
      providesTags: ['WhatsAppConversations'],
    }),
    markConversationRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/conversations/${id}/read`, method: 'POST' }),
      invalidatesTags: ['WhatsAppConversations'],
    }),
    sendInboxMessage: builder.mutation<
      { success: boolean; wamid?: string; message?: WhatsAppMessage },
      { phone: string; text: string; conversationId?: string }
    >({
      query: (body) => ({ url: '/messages/send', method: 'POST', body }),
      invalidatesTags: ['WhatsAppConversations', 'WhatsAppMessages'],
    }),
    sendInboxMedia: builder.mutation<
      { success: boolean; wamid?: string; message?: WhatsAppMessage },
      { phone: string; conversationId?: string; caption?: string; file: File }
    >({
      query: ({ file, ...rest }) => {
        const formData = new FormData()
        formData.append('file', file)
        if (rest.conversationId) formData.append('conversationId', rest.conversationId)
        if (rest.caption) formData.append('caption', rest.caption)
        formData.append('phone', rest.phone)
        return { url: '/messages/send-media', method: 'POST', body: formData }
      },
      invalidatesTags: ['WhatsAppConversations', 'WhatsAppMessages'],
    }),
    getAnalyticsOverview: builder.query<
      {
        messagesSent: number
        messagesReceived: number
        deliveryRate: number
        readRate: number
        failedMessages: number
        activeConversations: number
        connection: WhatsAppCloudConnection | null
      },
      { from?: string; to?: string } | void
    >({
      query: (params) => ({ url: '/analytics/overview', params: params || undefined }),
      providesTags: ['WhatsAppAnalytics'],
    }),
    getFunnelStats: builder.query<FunnelStats, { range?: FunnelRange } | void>({
      query: (params) => ({ url: '/analytics/funnel-stats', params: params || undefined }),
      providesTags: ['WhatsAppAnalytics'],
    }),
    getActivityFeed: builder.query<{ results: ActivityEvent[] }, { limit?: number } | void>({
      query: (params) => ({ url: '/analytics/activity-feed', params: params || undefined }),
      providesTags: ['WhatsAppAnalytics'],
    }),
    getExpiringWindows: builder.query<ExpiringWindows, void>({
      query: () => '/analytics/expiring-windows',
      providesTags: ['WhatsAppAnalytics'],
    }),
    syncTemplates: builder.mutation<{ synced: number }, void>({
      query: () => ({ url: '/templates/sync', method: 'POST' }),
      invalidatesTags: ['WhatsAppTemplates'],
    }),
    getTemplates: builder.query<{ results: WhatsAppTemplate[]; totalResults: number }, { status?: string } | void>({
      query: (params) => ({ url: '/templates', params: params || undefined }),
      providesTags: ['WhatsAppTemplates'],
    }),
    getSuggestedTemplates: builder.query<{ suggestions: WhatsAppTemplateSuggestion[] }, void>({
      query: () => '/templates/suggestions',
      providesTags: ['WhatsAppTemplates'],
    }),
    createTemplate: builder.mutation<
      WhatsAppTemplate,
      { name: string; language?: string; category: string; bodyText: string; internalCategory?: string }
    >({
      query: (body) => ({ url: '/templates', method: 'POST', body }),
      invalidatesTags: ['WhatsAppTemplates'],
    }),
    checkTemplateStatus: builder.mutation<WhatsAppTemplate, string>({
      query: (id) => ({ url: `/templates/${id}/check-status`, method: 'POST' }),
      invalidatesTags: ['WhatsAppTemplates'],
    }),
    sendCloudInvoicePdf: builder.mutation<
      { success: boolean; wamid?: string },
      { phone: string; pdfBase64: string; filename?: string; caption?: string }
    >({
      query: (body) => ({ url: '/pos/send-invoice', method: 'POST', body }),
    }),
  }),
})

export const {
  useGetCloudConnectionQuery,
  useStartEmbeddedSignupMutation,
  useReconnectCloudMutation,
  useDisconnectCloudMutation,
  useGetConversationsQuery,
  useGetConversationMessagesQuery,
  useGetUnreadCountQuery,
  useMarkConversationReadMutation,
  useSendInboxMessageMutation,
  useSendInboxMediaMutation,
  useGetAnalyticsOverviewQuery,
  useGetFunnelStatsQuery,
  useGetActivityFeedQuery,
  useGetExpiringWindowsQuery,
  useSyncTemplatesMutation,
  useSendCloudInvoicePdfMutation,
  useGetTemplatesQuery,
  useGetSuggestedTemplatesQuery,
  useCreateTemplateMutation,
  useCheckTemplateStatusMutation,
} = whatsappCloudApi
