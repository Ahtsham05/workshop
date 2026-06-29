import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './base-query';

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

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: AiToolCall[];
  createdAt: string;
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
  }),
});

export const {
  useListConversationsQuery,
  useCreateConversationMutation,
  useDeleteConversationMutation,
  useGetMessagesQuery,
  useSendMessageMutation,
} = aiAssistantApi;
