import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

/** Team chat between the branches of one organization — see server/src/services/chat.service.js. */

export type ChatConversationType = 'organization' | 'branch' | 'direct' | 'group'
export type ChatMessageKind = 'text' | 'product' | 'attachment' | 'system'

/**
 * WhatsApp-style delivery state of a message, as its sender sees it:
 * pending (clock) → sent (✓) → delivered (grey ✓✓) → read (blue ✓✓); failed = not sent.
 */
export type ChatMessageStatus = 'pending' | 'failed' | 'sent' | 'delivered' | 'read'

export interface ChatLastMessage {
  text: string
  kind: ChatMessageKind
  senderId: string | null
  senderName: string
  at: string
  /** Status of this newest message for its sender (null when it isn't yours / a system note). */
  status?: ChatMessageStatus | null
}

export interface ChatConversation {
  id: string
  type: ChatConversationType
  name: string
  description: string
  branchId: string | null
  participantIds: string[]
  adminIds: string[]
  directUser: { id: string; name: string; photoUrl: string; online: boolean; lastSeenAt: string | null } | null
  lastMessage: ChatLastMessage | null
  lastMessageAt: string | null
  unread: number
  lastReadAt: string | null
  muted: boolean
  pinned: boolean
  createdAt: string
}

export interface ChatAttachment {
  url: string
  publicId?: string
  name: string
  mimeType: string
  size: number
  width?: number | null
  height?: number | null
  /** Seconds (video / audio). */
  duration?: number | null
  /** A voice note recorded in the chat (not a picked audio file), with its loudness bars (0–100). */
  voice?: boolean
  waveform?: number[]
  /** Client-only, while sending: the picked file's local preview and upload progress (0–1). */
  localUrl?: string
  progress?: number
}

export interface ChatUploadSignature {
  cloudName: string
  apiKey: string
  folder: string
  timestamp: number
  signature: string
}

export interface ChatProductCard {
  productId: string
  name: string
  sku: string
  barcode: string
  price: number | null
  stock: number | null
  unit: string
  imageUrl: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string | null
  senderName: string
  senderBranchId: string | null
  senderBranchName: string
  kind: ChatMessageKind
  text: string
  attachments: ChatAttachment[]
  product: ChatProductCard | null
  replyTo: { messageId: string; text: string; senderName: string } | null
  reactions: { emoji: string; userIds: string[] }[]
  /** Voice notes: who (other than the sender) has played it. */
  playedBy?: string[]
  clientId: string
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  /** Client-only: optimistic bubble waiting for the server, or one that failed to send. */
  pending?: boolean
  failed?: boolean
}

export interface ChatMessagesPage {
  messages: ChatMessage[]
  hasMore: boolean
}

export interface ChatMember {
  id: string
  name: string
  photoUrl: string
  online: boolean
  lastSeenAt: string | null
  lastReadAt: string | null
  /** How far their device has received messages (always ≥ lastReadAt). */
  lastDeliveredAt: string | null
}

export interface ChatConversationDetail {
  id: string
  type: ChatConversationType
  adminIds: string[]
  createdBy: string | null
  members: ChatMember[]
}

export interface ChatPerson {
  id: string
  name: string
  email: string
  photoUrl: string
  role: 'admin' | 'staff'
  branches: { id: string; name: string }[]
  allBranches: boolean
  online: boolean
  lastSeenAt: string | null
  isMe: boolean
}

export interface ChatSearchHit {
  id: string
  conversationId: string
  conversationName: string
  senderName: string
  senderBranchName: string
  text: string
  createdAt: string
}

export interface ChatBranchStock {
  branchId: string
  branchName: string
  productId: string | null
  stock: number | null
  price: number | null
}

export interface SendChatMessageArgs {
  conversationId: string
  text?: string
  productId?: string
  attachments?: ChatAttachment[]
  replyToId?: string
  clientId: string
}

export const REACTION_EMOJIS = ['👍', '✅', '❤️', '😂', '🙏', '❓', '👀', '🔥'] as const

export const chatApi = createApi({
  reducerPath: 'chatApi',
  baseQuery,
  tagTypes: ['ChatConversations', 'ChatDetail', 'ChatDirectory', 'ChatMessages'],
  // Chat data is pushed live over the socket; on reconnect the provider refetches.
  refetchOnReconnect: true,
  endpoints: (builder) => ({
    getChatConversations: builder.query<ChatConversation[], void>({
      query: () => '/chat/conversations',
      providesTags: ['ChatConversations'],
    }),
    getChatConversation: builder.query<ChatConversationDetail, string>({
      query: (id) => `/chat/conversations/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'ChatDetail', id }],
    }),
    getChatMessages: builder.query<ChatMessagesPage, string>({
      query: (id) => ({ url: `/chat/conversations/${id}/messages`, params: { limit: 40 } }),
      providesTags: (_r, _e, id) => [{ type: 'ChatMessages', id }],
      // Every open thread keeps its cache for a while so switching back is instant.
      keepUnusedDataFor: 300,
    }),
    /** Scrolling back: the page before the oldest message on screen. */
    getOlderChatMessages: builder.query<ChatMessagesPage, { id: string; before: string }>({
      query: ({ id, before }) => ({ url: `/chat/conversations/${id}/messages`, params: { limit: 40, before } }),
      keepUnusedDataFor: 60,
    }),
    getChatDirectory: builder.query<ChatPerson[], void>({
      query: () => '/chat/directory',
      providesTags: ['ChatDirectory'],
    }),
    searchChat: builder.query<ChatSearchHit[], string>({
      query: (q) => ({ url: '/chat/search', params: { q } }),
    }),
    getChatProductStock: builder.query<ChatBranchStock[], string>({
      query: (productId) => `/chat/products/${productId}/stock`,
      keepUnusedDataFor: 30,
    }),
    sendChatMessage: builder.mutation<ChatMessage, SendChatMessageArgs>({
      query: ({ conversationId, ...body }) => ({ url: `/chat/conversations/${conversationId}/messages`, method: 'POST', body }),
    }),
    editChatMessage: builder.mutation<ChatMessage, { id: string; text: string }>({
      query: ({ id, text }) => ({ url: `/chat/messages/${id}`, method: 'PATCH', body: { text } }),
    }),
    deleteChatMessage: builder.mutation<ChatMessage, string>({
      query: (id) => ({ url: `/chat/messages/${id}`, method: 'DELETE' }),
    }),
    reactToChatMessage: builder.mutation<ChatMessage, { id: string; emoji: string }>({
      query: ({ id, emoji }) => ({ url: `/chat/messages/${id}/reactions`, method: 'POST', body: { emoji } }),
    }),
    markChatVoicePlayed: builder.mutation<ChatMessage, string>({
      query: (id) => ({ url: `/chat/messages/${id}/played`, method: 'POST' }),
    }),
    markChatRead: builder.mutation<{ lastReadAt: string }, string>({
      query: (id) => ({ url: `/chat/conversations/${id}/read`, method: 'POST' }),
    }),
    openDirectChat: builder.mutation<{ id: string }, string>({
      query: (userId) => ({ url: '/chat/conversations/direct', method: 'POST', body: { userId } }),
      invalidatesTags: ['ChatConversations'],
    }),
    createChatGroup: builder.mutation<{ id: string }, { name: string; description?: string; participantIds: string[] }>({
      query: (body) => ({ url: '/chat/conversations/group', method: 'POST', body }),
      invalidatesTags: ['ChatConversations'],
    }),
    updateChatGroup: builder.mutation<{ id: string }, { id: string; name?: string; description?: string; addIds?: string[]; removeIds?: string[] }>({
      query: ({ id, ...body }) => ({ url: `/chat/conversations/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => ['ChatConversations', { type: 'ChatDetail', id }],
    }),
    leaveChatGroup: builder.mutation<void, string>({
      query: (id) => ({ url: `/chat/conversations/${id}/leave`, method: 'POST' }),
      invalidatesTags: ['ChatConversations'],
    }),
    setChatPreferences: builder.mutation<{ muted?: boolean; pinned?: boolean }, { id: string; muted?: boolean; pinned?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/chat/conversations/${id}/preferences`, method: 'PATCH', body }),
      async onQueryStarted({ id, ...prefs }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          chatApi.util.updateQueryData('getChatConversations', undefined, (draft) => {
            const conversation = draft.find((c) => c.id === id)
            if (conversation) Object.assign(conversation, prefs)
          })
        )
        try {
          await queryFulfilled
        } catch {
          patch.undo()
        }
      },
    }),
    /** Short-lived signature for uploading straight to Cloudinary (see lib/chat-media.ts). */
    getChatUploadSignature: builder.mutation<ChatUploadSignature, void>({
      query: () => ({ url: '/chat/attachments/signature', method: 'POST' }),
    }),
  }),
})

export const {
  useGetChatConversationsQuery,
  useGetChatConversationQuery,
  useGetChatMessagesQuery,
  useLazyGetOlderChatMessagesQuery,
  useGetChatDirectoryQuery,
  useSearchChatQuery,
  useGetChatProductStockQuery,
  useSendChatMessageMutation,
  useEditChatMessageMutation,
  useDeleteChatMessageMutation,
  useReactToChatMessageMutation,
  useMarkChatReadMutation,
  useMarkChatVoicePlayedMutation,
  useOpenDirectChatMutation,
  useCreateChatGroupMutation,
  useUpdateChatGroupMutation,
  useLeaveChatGroupMutation,
  useSetChatPreferencesMutation,
  useGetChatUploadSignatureMutation,
} = chatApi
