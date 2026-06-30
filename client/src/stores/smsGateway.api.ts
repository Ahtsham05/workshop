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

const smsBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  const baseQuery = createAppFetchBaseQuery({ baseUrl: `${baseUrl}/sms-gateway`, prepareHeaders })
  return baseQuery(args, api, extra)
}

export type SmsDevice = {
  deviceId: string
  deviceName: string
  token: string
  isOnline: boolean
  lastSeen?: string
  simSlot: number
  phoneNumber?: string
  smsSentToday: number
  smsSentTotal: number
  createdAt: string
}

export type SmsMessage = {
  _id: string
  to: string
  message: string
  status: 'pending' | 'dispatched' | 'sent' | 'delivered' | 'failed'
  error?: string
  source: string
  sentAt?: string
  createdAt: string
}

export const smsGatewayApi = createApi({
  reducerPath: 'smsGatewayApi',
  baseQuery: smsBaseQuery,
  tagTypes: ['SmsDevices', 'SmsMessages'],
  endpoints: (builder) => ({
    getDevices: builder.query<SmsDevice[], void>({
      query: () => '/devices',
      providesTags: ['SmsDevices'],
    }),
    registerDevice: builder.mutation<SmsDevice & { token: string }, { deviceName: string; simSlot?: number; phoneNumber?: string }>({
      query: (body) => ({ url: '/devices', method: 'POST', body }),
      invalidatesTags: ['SmsDevices'],
    }),
    deleteDevice: builder.mutation<void, string>({
      query: (deviceId) => ({ url: `/devices/${deviceId}`, method: 'DELETE' }),
      invalidatesTags: ['SmsDevices'],
    }),
    sendSms: builder.mutation<SmsMessage, { to: string; message: string; source?: string; refId?: string }>({
      query: (body) => ({ url: '/send', method: 'POST', body }),
      invalidatesTags: ['SmsMessages'],
    }),
    sendBulkSms: builder.mutation<{ results: { to: string; status: string }[]; total: number; sent: number }, { recipients: { to: string; name?: string }[]; message: string; source?: string }>({
      query: (body) => ({ url: '/send-bulk', method: 'POST', body }),
      invalidatesTags: ['SmsMessages'],
    }),
    getMessages: builder.query<{ results: SmsMessage[]; total: number; page: number; totalPages: number }, { page?: number; limit?: number; status?: string }>({
      query: (params) => ({ url: '/messages', params }),
      providesTags: ['SmsMessages'],
    }),
  }),
})

export const {
  useGetDevicesQuery,
  useRegisterDeviceMutation,
  useDeleteDeviceMutation,
  useSendSmsMutation,
  useSendBulkSmsMutation,
  useGetMessagesQuery,
} = smsGatewayApi
