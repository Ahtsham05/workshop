import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const baseQuery = fetchBaseQuery({
    baseUrl: `${baseUrl}/business-whatsapp`,
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

export type WhatsAppConnectionState =
  | 'DISCONNECTED'
  | 'QR_READY'
  | 'LOADING'
  | 'READY'
  | 'AUTH_FAILURE'
  | 'SERVERLESS_UNSUPPORTED'

export type WhatsAppProviderMode = 'auto' | 'cloud' | 'web'

export type BusinessWhatsAppStatus = {
  provider: WhatsAppProviderMode
  activeProvider: 'cloud' | 'web' | 'none'
  state: WhatsAppConnectionState
  qrImage: string | null
  cloud: {
    configured: boolean
    ready: boolean
    phoneNumberId: string | null
    apiVersion?: string
    hasAccessToken?: boolean
    businessAccountId?: string | null
    source?: string
  }
  web: {
    state: WhatsAppConnectionState
    qrImage: string | null
    ready: boolean
  }
}

export type WhatsAppCloudConfig = {
  provider: WhatsAppProviderMode
  cloud: {
    configured: boolean
    phoneNumberId: string | null
    apiVersion: string
    hasAccessToken: boolean
    businessAccountId: string | null
    source: string
  }
}

export const businessWhatsappApi = createApi({
  reducerPath: 'businessWhatsappApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['BusinessWhatsApp'],
  endpoints: (builder) => ({
    getBusinessWhatsAppStatus: builder.query<BusinessWhatsAppStatus, void>({
      query: () => ({ url: '/status', headers: { 'Cache-Control': 'no-cache' } }),
      providesTags: ['BusinessWhatsApp'],
    }),
    getWhatsAppCloudConfig: builder.query<WhatsAppCloudConfig, void>({
      query: () => '/cloud-config',
      providesTags: ['BusinessWhatsApp'],
    }),
    updateWhatsAppCloudConfig: builder.mutation<
      WhatsAppCloudConfig,
      {
        provider?: WhatsAppProviderMode
        cloudAccessToken?: string
        cloudPhoneNumberId?: string
        cloudApiVersion?: string
        cloudBusinessAccountId?: string
      }
    >({
      query: (body) => ({ url: '/cloud-config', method: 'PATCH', body }),
      invalidatesTags: ['BusinessWhatsApp'],
    }),
    connectBusinessWhatsApp: builder.mutation<{ message: string; state: string }, void>({
      query: () => ({ url: '/connect', method: 'POST' }),
      invalidatesTags: ['BusinessWhatsApp'],
    }),
    disconnectBusinessWhatsApp: builder.mutation<{ message: string; state: string }, void>({
      query: () => ({ url: '/disconnect', method: 'POST' }),
      invalidatesTags: ['BusinessWhatsApp'],
    }),
    clearBusinessWhatsAppSession: builder.mutation<{ message: string; state: string }, void>({
      query: () => ({ url: '/clear-session', method: 'POST' }),
      invalidatesTags: ['BusinessWhatsApp'],
    }),
    sendInvoicePdfWhatsApp: builder.mutation<
      { success: boolean; message: string; provider?: string },
      { phone: string; pdfBase64: string; filename?: string; caption?: string; invoiceNumber?: string }
    >({
      query: (body) => ({
        url: '/send-invoice-pdf',
        method: 'POST',
        body,
      }),
    }),
  }),
})

export const {
  useGetBusinessWhatsAppStatusQuery,
  useGetWhatsAppCloudConfigQuery,
  useUpdateWhatsAppCloudConfigMutation,
  useConnectBusinessWhatsAppMutation,
  useDisconnectBusinessWhatsAppMutation,
  useClearBusinessWhatsAppSessionMutation,
  useSendInvoicePdfWhatsAppMutation,
} = businessWhatsappApi
