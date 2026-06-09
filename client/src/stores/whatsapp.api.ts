import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const baseQuery = fetchBaseQuery({
    baseUrl: `${baseUrl}/whatsapp`,
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('accessToken')
      if (token) headers.set('authorization', `Bearer ${token}`)
      const activeBranchId = localStorage.getItem('activeBranchId')
      if (activeBranchId) headers.set('x-branch-id', activeBranchId)
      return headers
    },
  })
  return baseQuery(args, api, extraOptions)
}

export type WhatsAppCloudConnection = {
  id?: string
  status?: string
  connected?: boolean
  wabaId?: string
  phoneNumberId?: string
  displayPhoneNumber?: string
  verifiedName?: string
  webhookSubscribed?: boolean
}

export type WhatsAppStatus = {
  state: 'READY' | 'DISCONNECTED'
  connected?: boolean
  displayPhoneNumber?: string
  verifiedName?: string
  webhookSubscribed?: boolean
  status?: string
  branchConnection?: WhatsAppCloudConnection | null
}

export const whatsappApi = createApi({
  reducerPath: 'whatsappApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['WhatsApp'],
  endpoints: (builder) => ({
    getWhatsAppStatus: builder.query<WhatsAppStatus, void>({
      query: () => ({ url: '/status', headers: { 'Cache-Control': 'no-cache' } }),
      providesTags: ['WhatsApp'],
    }),
    connectWhatsApp: builder.mutation<
      { appId: string; configId: string; redirectUri: string; state: string },
      void
    >({
      query: () => ({ url: '/connect', method: 'POST' }),
    }),
    disconnectWhatsApp: builder.mutation<{ message: string }, void>({
      query: () => ({ url: '/disconnect', method: 'POST' }),
      invalidatesTags: ['WhatsApp'],
    }),
    clearWhatsAppSession: builder.mutation<{ message: string }, void>({
      query: () => ({ url: '/disconnect', method: 'POST' }),
      invalidatesTags: ['WhatsApp'],
    }),
    testWhatsApp: builder.mutation<{ success: boolean; message: string }, { phone?: string } | void>({
      query: (body) => ({ url: '/test', method: 'POST', body: body || {} }),
    }),
    sendWhatsAppMessage: builder.mutation<{ success: boolean }, { phone: string; message: string }>({
      query: (body) => ({ url: '/send', method: 'POST', body }),
    }),
    sendWhatsAppDocument: builder.mutation<
      { success: boolean; message: string },
      { phone: string; pdfBase64: string; filename?: string; caption?: string; mimetype?: string }
    >({
      query: (body) => ({ url: '/send-document', method: 'POST', body }),
    }),
    sendInvoicePdfWhatsApp: builder.mutation<
      { success: boolean; message: string },
      { phone: string; pdfBase64: string; filename?: string; caption?: string; invoiceNumber?: string }
    >({
      query: (body) => ({ url: '/send-invoice-pdf', method: 'POST', body }),
    }),
  }),
})

export const {
  useGetWhatsAppStatusQuery,
  useConnectWhatsAppMutation,
  useDisconnectWhatsAppMutation,
  useClearWhatsAppSessionMutation,
  useTestWhatsAppMutation,
  useSendWhatsAppMessageMutation,
  useSendWhatsAppDocumentMutation,
  useSendInvoicePdfWhatsAppMutation,
} = whatsappApi
