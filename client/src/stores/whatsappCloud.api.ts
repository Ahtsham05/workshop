import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
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
  const baseQuery = fetchBaseQuery({ baseUrl: `${baseUrl}/whatsapp-cloud`, prepareHeaders })
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
  lastMessageAt?: string
  lastMessagePreview?: string
  lastMessageDirection?: 'inbound' | 'outbound'
  unreadCount: number
  status: 'open' | 'closed' | 'spam'
}

export type WhatsAppMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  type: string
  content: { text?: string; caption?: string; mediaUrl?: string; filename?: string }
  status: string
  createdAt: string
}

export const whatsappCloudApi = createApi({
  reducerPath: 'whatsappCloudApi',
  baseQuery: cloudBaseQuery,
  tagTypes: ['WhatsAppConnection', 'WhatsAppConversations', 'WhatsAppMessages', 'WhatsAppAnalytics'],
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
    sendInboxMessage: builder.mutation<{ success: boolean }, { phone: string; text: string; conversationId?: string }>({
      query: (body) => ({ url: '/messages/send', method: 'POST', body }),
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
    syncTemplates: builder.mutation<{ synced: number }, void>({
      query: () => ({ url: '/templates/sync', method: 'POST' }),
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
  useGetAnalyticsOverviewQuery,
  useSyncTemplatesMutation,
  useSendCloudInvoicePdfMutation,
} = whatsappCloudApi
