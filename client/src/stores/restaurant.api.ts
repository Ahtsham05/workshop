import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface RestaurantFloor {
  id: string
  name: string
  sortOrder?: number
}

export interface RestaurantTable {
  id: string
  floorId: string | { id: string; name: string; sortOrder?: number }
  label: string
  capacity: number
  qrToken: string
  status: 'available' | 'occupied' | 'reserved' | 'cleaning'
}

export interface OrderLine {
  _id?: string
  productId?: string
  name: string
  quantity: number
  unitPrice: number
  notes?: string
  station?: string
  status?: string
}

export interface RestaurantOrder {
  id: string
  orderNumber: string
  tableId?: string
  tableLabel?: string
  source: string
  /** dine_in = table service; takeaway = pickup / counter; delivery = home delivery */
  serviceMode?: 'dine_in' | 'takeaway' | 'delivery'
  customerName?: string
  guestCount?: number
  lines: OrderLine[]
  status: string
  subtotal: number
  taxAmount?: number
  discountAmount?: number
  serviceChargeAmount?: number
  total: number
  notes?: string
  paymentMethod?: string
  paidAt?: string
  createdAt?: string
  /** Collected at POS before or when firing; kitchen flow unchanged */
  prepaidAmount?: number
  prepaidMethod?: string
  prepaidAt?: string
  deliveredAt?: string
  customerId?: string
  deliveryPhone?: string
}

export interface DeliveryCustomerLookupCustomer {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  whatsapp?: string
  balance?: number
}

export interface DeliveryCustomerLookupOrder {
  id: string
  orderNumber: string
  status: string
  total: number
  createdAt?: string
  customerName?: string
  linePreview?: string
}

export interface DeliveryCustomerLookup {
  normalizedPhone: string
  customer: DeliveryCustomerLookupCustomer | null
  recentOrders: DeliveryCustomerLookupOrder[]
}

export interface RestaurantReservation {
  id: string
  tableId?: string | RestaurantTable
  customerName: string
  phone?: string
  partySize: number
  startAt: string
  endAt?: string
  status: string
  notes?: string
}

export interface RestaurantStats {
  todayOrders: number
  todayRevenue: number
  openOrders: number
  tablesOccupied: number
}

export const restaurantApi = createApi({
  reducerPath: 'restaurantApi',
  baseQuery,
  tagTypes: [
    'RestaurantStats',
    'RestaurantFloor',
    'RestaurantTable',
    'RestaurantOrder',
    'RestaurantReservation',
  ],
  endpoints: (builder) => ({
    getRestaurantStats: builder.query<RestaurantStats, void>({
      query: () => ({ url: '/restaurant/stats' }),
      providesTags: ['RestaurantStats'],
    }),
    getFloors: builder.query<RestaurantFloor[], void>({
      query: () => ({ url: '/restaurant/floors' }),
      providesTags: ['RestaurantFloor'],
    }),
    createFloor: builder.mutation<RestaurantFloor, { name: string; sortOrder?: number }>({
      query: (body) => ({ url: '/restaurant/floors', method: 'POST', body }),
      invalidatesTags: ['RestaurantFloor', 'RestaurantTable'],
    }),
    updateFloor: builder.mutation<
      RestaurantFloor,
      { floorId: string; body: Partial<{ name: string; sortOrder: number }> }
    >({
      query: ({ floorId, body }) => ({
        url: `/restaurant/floors/${floorId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['RestaurantFloor'],
    }),
    deleteFloor: builder.mutation<void, string>({
      query: (floorId) => ({ url: `/restaurant/floors/${floorId}`, method: 'DELETE' }),
      invalidatesTags: ['RestaurantFloor', 'RestaurantTable'],
    }),
    getTables: builder.query<RestaurantTable[], { floorId?: string } | void>({
      query: (params) => ({
        url: '/restaurant/tables',
        params: params || {},
      }),
      providesTags: ['RestaurantTable'],
    }),
    createTable: builder.mutation<
      RestaurantTable,
      { floorId: string; label: string; capacity?: number }
    >({
      query: (body) => ({ url: '/restaurant/tables', method: 'POST', body }),
      invalidatesTags: ['RestaurantTable'],
    }),
    updateTable: builder.mutation<
      RestaurantTable,
      { tableId: string; body: Partial<RestaurantTable> }
    >({
      query: ({ tableId, body }) => ({
        url: `/restaurant/tables/${tableId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['RestaurantTable', 'RestaurantStats'],
    }),
    regenerateTableQr: builder.mutation<RestaurantTable, string>({
      query: (tableId) => ({
        url: `/restaurant/tables/${tableId}/regenerate-qr`,
        method: 'POST',
      }),
      invalidatesTags: ['RestaurantTable'],
    }),
    getOrders: builder.query<
      RestaurantOrder[],
      { status?: string; source?: string; serviceMode?: string; limit?: number } | void
    >({
      query: (params) => ({ url: '/restaurant/orders', params: params || {} }),
      providesTags: ['RestaurantOrder'],
    }),
    getOrder: builder.query<RestaurantOrder, string>({
      query: (orderId) => ({ url: `/restaurant/orders/${orderId}` }),
      providesTags: (_r, _e, id) => [{ type: 'RestaurantOrder', id }],
    }),
    createOrder: builder.mutation<
      RestaurantOrder,
      {
        lines: {
          productId: string
          quantity: number
          notes?: string
          station?: string
          unitPrice?: number
        }[]
        tableId?: string
        tableLabel?: string
        source?: string
        customerName?: string
        guestCount?: number
        taxAmount?: number
        discountAmount?: number
        serviceChargeAmount?: number
        notes?: string
        prepaidAmount?: number
        prepaidMethod?: string
        serviceMode?: 'dine_in' | 'takeaway' | 'delivery'
        customerId?: string
        deliveryPhone?: string
      }
    >({
      query: (body) => ({ url: '/restaurant/orders', method: 'POST', body }),
      invalidatesTags: ['RestaurantOrder', 'RestaurantStats', 'RestaurantTable'],
    }),
    updateOrderStatus: builder.mutation<
      RestaurantOrder,
      { orderId: string; status: string; paymentMethod?: string; markDelivered?: boolean }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/restaurant/orders/${orderId}/status`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['RestaurantOrder', 'RestaurantStats', 'RestaurantTable'],
    }),
    updateOrder: builder.mutation<
      RestaurantOrder,
      {
        orderId: string
        lines: {
          productId: string
          quantity: number
          notes?: string
          station?: string
          unitPrice?: number
        }[]
        tableId?: string | null
        taxAmount?: number
        discountAmount?: number
        serviceChargeAmount?: number
        customerName?: string
        notes?: string
        customerId?: string | null
        deliveryPhone?: string
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/restaurant/orders/${orderId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['RestaurantOrder', 'RestaurantStats', 'RestaurantTable'],
    }),
    getDeliveryCustomerLookup: builder.query<
      DeliveryCustomerLookup,
      { phone: string; excludeOrderId?: string }
    >({
      query: (params) => ({
        url: '/restaurant/delivery-customer-lookup',
        params,
      }),
    }),
    updateLineKitchenStatus: builder.mutation<
      RestaurantOrder,
      { orderId: string; lineId: string; status: string }
    >({
      query: ({ orderId, lineId, status }) => ({
        url: `/restaurant/orders/${orderId}/lines/${lineId}/kitchen`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: ['RestaurantOrder'],
    }),
    getReservations: builder.query<
      RestaurantReservation[],
      { from?: string; to?: string } | void
    >({
      query: (params) => ({
        url: '/restaurant/reservations',
        params: params || {},
      }),
      providesTags: ['RestaurantReservation'],
    }),
    createReservation: builder.mutation<
      RestaurantReservation,
      {
        tableId?: string
        customerName: string
        phone?: string
        partySize: number
        startAt: string
        endAt?: string
        notes?: string
      }
    >({
      query: (body) => ({ url: '/restaurant/reservations', method: 'POST', body }),
      invalidatesTags: ['RestaurantReservation'],
    }),
    updateReservation: builder.mutation<
      RestaurantReservation,
      { reservationId: string; body: Partial<RestaurantReservation> }
    >({
      query: ({ reservationId, body }) => ({
        url: `/restaurant/reservations/${reservationId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['RestaurantReservation'],
    }),
  }),
})

export const {
  useGetRestaurantStatsQuery,
  useGetFloorsQuery,
  useCreateFloorMutation,
  useUpdateFloorMutation,
  useDeleteFloorMutation,
  useGetTablesQuery,
  useCreateTableMutation,
  useUpdateTableMutation,
  useRegenerateTableQrMutation,
  useGetOrdersQuery,
  useLazyGetDeliveryCustomerLookupQuery,
  useGetOrderQuery,
  useCreateOrderMutation,
  useUpdateOrderStatusMutation,
  useUpdateOrderMutation,
  useUpdateLineKitchenStatusMutation,
  useGetReservationsQuery,
  useCreateReservationMutation,
  useUpdateReservationMutation,
} = restaurantApi
