import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';
import { invoiceApi } from './invoice.api';
import { invalidateWalletCaches } from './wallet-cache-invalidation';

export interface AiConversation {
  id: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface AiToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface AiInvoicePreview {
  customerId: string;
  customerName: string;
  customerBalance: number;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
}

export interface AiPendingAction {
  kind: 'create_invoice';
  status: 'pending' | 'executed' | 'cancelled' | 'failed';
  preview: AiInvoicePreview;
  result?: { invoiceId: string; invoiceNumber: string };
  error?: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: AiToolCall[];
  createdAt: string;
  /** Set when the user clicked Stop mid-stream — content holds whatever had streamed by then. */
  interrupted?: boolean;
  /** A create_invoice preview awaiting the user clicking Confirm/Cancel — see ActionConfirmationCard. */
  pendingAction?: AiPendingAction;
}

export const aiAssistantApi = createApi({
  reducerPath: 'aiAssistantApi',
  baseQuery,
  tagTypes: ['AiConversation', 'AiMessage'],
  endpoints: (builder) => ({
    listConversations: builder.query<AiConversation[], void>({
      query: () => '/ai-assistant/conversations',
      providesTags: ['AiConversation'],
    }),
    createConversation: builder.mutation<AiConversation, { title?: string } | void>({
      query: (body) => ({ url: '/ai-assistant/conversations', method: 'POST', body: body || {} }),
      invalidatesTags: ['AiConversation'],
    }),
    deleteConversation: builder.mutation<void, string>({
      query: (conversationId) => ({ url: `/ai-assistant/conversations/${conversationId}`, method: 'DELETE' }),
      invalidatesTags: ['AiConversation'],
    }),
    getMessages: builder.query<AiMessage[], string>({
      query: (conversationId) => `/ai-assistant/conversations/${conversationId}/messages`,
      providesTags: (_result, _error, conversationId) => [{ type: 'AiMessage', id: conversationId }],
    }),
    sendMessage: builder.mutation<AiMessage, { conversationId: string; text: string }>({
      query: ({ conversationId, text }) => ({
        url: `/ai-assistant/conversations/${conversationId}/messages`,
        method: 'POST',
        body: { text },
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: 'AiMessage', id: arg.conversationId },
        'AiConversation',
      ],
    }),
    confirmAction: builder.mutation<AiMessage, { conversationId: string; messageId: string }>({
      query: ({ conversationId, messageId }) => ({
        url: `/ai-assistant/conversations/${conversationId}/messages/${messageId}/confirm-action`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'AiMessage', id: arg.conversationId }],
      // create_invoice posts to Cash Book and shows up on the Invoices page — both live in
      // separate RTK Query slices from this one, so they need their own explicit invalidation
      // (see wallet-cache-invalidation.ts's header comment for why this doesn't happen for free).
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(invoiceApi.util.invalidateTags(['Invoice']));
          invalidateWalletCaches(dispatch);
        } catch {
          // confirm failed — nothing external was written, nothing to invalidate
        }
      },
    }),
    cancelAction: builder.mutation<AiMessage, { conversationId: string; messageId: string }>({
      query: ({ conversationId, messageId }) => ({
        url: `/ai-assistant/conversations/${conversationId}/messages/${messageId}/cancel-action`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'AiMessage', id: arg.conversationId }],
    }),
  }),
});

export const {
  useListConversationsQuery,
  useCreateConversationMutation,
  useDeleteConversationMutation,
  useGetMessagesQuery,
  useSendMessageMutation,
  useConfirmActionMutation,
  useCancelActionMutation,
} = aiAssistantApi;
