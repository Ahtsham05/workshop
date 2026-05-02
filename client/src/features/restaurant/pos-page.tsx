import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RestaurantShell } from '@/features/restaurant/shell'
import { fetchAllProducts } from '@/stores/product.slice'
import type { AppDispatch, RootState } from '@/stores/store'
import {
  useCreateOrderMutation,
  useGetTablesQuery,
  useGetOrdersQuery,
  useLazyGetDeliveryCustomerLookupQuery,
  useUpdateOrderMutation,
  useUpdateOrderStatusMutation,
} from '@/stores/restaurant.api'
import type { DeliveryCustomerLookup, RestaurantOrder } from '@/stores/restaurant.api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useReactToPrint } from 'react-to-print'
import { KitchenTicket, CustomerReceipt } from '@/features/restaurant/print-templates'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import {
  PosMenuCatalog,
  type PosProduct,
  resolvePosProductImageUrl,
} from '@/features/restaurant/pos-catalog'
import {
  Armchair,
  Minus,
  Plus,
  Search,
  Truck,
  UtensilsCrossed,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type CartLine = {
  productId: string
  name: string
  unitPrice: number
  quantity: number
  thumbUrl?: string
}

type OrdersPanelFilter = 'table' | 'delivery'

function isActiveCounterStatus(status: string): boolean {
  return ['open', 'in_progress', 'ready', 'served', 'out_for_delivery'].includes(status)
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'PKR' })

/** Digits only — used to match CRM phone & saved delivery tickets */
function extractDigitsFromLabel(s: string): string {
  return String(s || '').replace(/\D/g, '')
}

function deliveryLinkPayload(
  linkedCustomerId: string | null,
  deliveryCustomerName: string,
): { customerId?: string; deliveryPhone?: string } {
  const digits = extractDigitsFromLabel(deliveryCustomerName)
  return {
    ...(digits.length >= 7 ? { deliveryPhone: digits } : {}),
    ...(linkedCustomerId ? { customerId: linkedCustomerId } : {}),
  }
}

function isUnpaidOrder(o: RestaurantOrder): boolean {
  return !['paid', 'cancelled'].includes(o.status)
}

/** Full ticket charged up front (Pay cash/card & send) — payment done; kitchen uses Kitchen display page */
function isFullyPrepaid(o: RestaurantOrder): boolean {
  const total = o.total ?? 0
  const prepaid = o.prepaidAmount ?? 0
  return total > 0 && prepaid >= total
}

/** Still owes money at POS (partial or no prepay) while ticket is open */
function needsPaymentAtCounter(o: RestaurantOrder): boolean {
  return isUnpaidOrder(o) && !isFullyPrepaid(o)
}

/** Allow settling from kitchen or ready list whenever the bill is not fully covered yet */
function canMarkPaid(order: RestaurantOrder): boolean {
  if (order.status === 'paid' || order.status === 'cancelled') return false
  const prepaid = order.prepaidAmount ?? 0
  const total = order.total ?? 0
  if (total > 0 && prepaid >= total) return false
  return true
}

export default function RestaurantPosPage() {
  const dispatch = useDispatch<AppDispatch>()
  const { data: org } = useGetMyOrganizationQuery()
  const products = useSelector((s: RootState) => s.product.data) as PosProduct[] | null
  const { data: tables = [] } = useGetTablesQuery()
  const { data: orders = [], refetch: refetchOrders } = useGetOrdersQuery(
    { limit: 120 },
    { pollingInterval: 8000 },
  )
  const [tableId, setTableId] = useState<string | undefined>()
  const [cart, setCart] = useState<CartLine[]>([])
  const [tax, setTax] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [service, setService] = useState(0)
  const [paidAmountInput, setPaidAmountInput] = useState(0)
  const [printOnFire, setPrintOnFire] = useState(false)
  const [ordersPanel, setOrdersPanel] = useState<OrdersPanelFilter>('table')
  const [ordersSearch, setOrdersSearch] = useState('')
  const [serviceMode, setServiceMode] = useState<'dine_in' | 'delivery'>('dine_in')
  const [deliveryCustomerName, setDeliveryCustomerName] = useState('')
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null)
  const [deliveryContext, setDeliveryContext] = useState<DeliveryCustomerLookup | null>(null)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const deliveryLabelRef = useRef(deliveryCustomerName)
  const deliveryLookupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [createOrder, { isLoading }] = useCreateOrderMutation()
  const [updateOrder, { isLoading: savingEdit }] = useUpdateOrderMutation()
  const [patchStatus] = useUpdateOrderStatusMutation()
  const [triggerDeliveryLookup, { isFetching: deliveryLookupLoading }] =
    useLazyGetDeliveryCustomerLookupQuery()

  const [lastOrder, setLastOrder] = useState<RestaurantOrder | null>(null)
  const [printOrder, setPrintOrder] = useState<RestaurantOrder | null>(null)
  const kitchenRef = useRef<HTMLDivElement>(null)
  const receiptRef = useRef<HTMLDivElement>(null)

  const printKitchen = useReactToPrint({
    contentRef: kitchenRef,
    onAfterPrint: () => setPrintOrder(null),
  })
  const printReceipt = useReactToPrint({
    contentRef: receiptRef,
    onAfterPrint: () => setPrintOrder(null),
  })

  useEffect(() => {
    dispatch(fetchAllProducts({}))
  }, [dispatch])

  deliveryLabelRef.current = deliveryCustomerName

  useEffect(() => {
    if (serviceMode !== 'delivery') {
      setDeliveryContext(null)
      return
    }
    const digits = extractDigitsFromLabel(deliveryCustomerName)
    if (digits.length < 7) {
      setDeliveryContext(null)
      setLinkedCustomerId(null)
      return
    }
    if (deliveryLookupDebounceRef.current) clearTimeout(deliveryLookupDebounceRef.current)
    deliveryLookupDebounceRef.current = setTimeout(() => {
      void triggerDeliveryLookup({
        phone: digits,
        excludeOrderId: editingOrderId || undefined,
      })
        .unwrap()
        .then((data) => {
          setDeliveryContext(data)
          setLinkedCustomerId(data.customer?.id ?? null)
          const raw = deliveryLabelRef.current.trim()
          const rawDigits = extractDigitsFromLabel(raw)
          if (
            data.customer &&
            raw === rawDigits &&
            rawDigits.length >= 7 &&
            rawDigits === data.normalizedPhone
          ) {
            setDeliveryCustomerName(
              `${data.customer.name} · ${data.customer.phone ?? data.normalizedPhone}`,
            )
          }
        })
        .catch(() => {
          setDeliveryContext(null)
          setLinkedCustomerId(null)
        })
    }, 450)
    return () => {
      if (deliveryLookupDebounceRef.current) clearTimeout(deliveryLookupDebounceRef.current)
    }
  }, [
    deliveryCustomerName,
    serviceMode,
    editingOrderId,
    triggerDeliveryLookup,
  ])

  /** Focus table ticket queue when staff picks a table cover */
  useEffect(() => {
    if (tableId) setOrdersPanel('table')
  }, [tableId])

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === tableId),
    [tables, tableId],
  )

  const tableSummary = useMemo(() => {
    if (serviceMode === 'delivery') {
      return {
        title: deliveryCustomerName.trim() || 'Delivery run',
        detail: 'Driver handoff · mark out for delivery, then collect COD and close as paid & delivered',
      }
    }
    if (!tableId) {
      return {
        title: 'Walk-in dine-in',
        detail: 'No table linked — use a table cover when guests sit',
      }
    }
    if (!selectedTable) return { title: 'Table', detail: '—' }
    const floorName =
      typeof selectedTable.floorId === 'object' &&
      selectedTable.floorId &&
      'name' in selectedTable.floorId
        ? selectedTable.floorId.name
        : null
    return {
      title: `Table ${selectedTable.label}`,
      detail: floorName ? `${floorName} · ${selectedTable.capacity} seats` : `${selectedTable.capacity} seats`,
    }
  }, [serviceMode, tableId, selectedTable, deliveryCustomerName])

  const subtotal = cart.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  const total = Math.max(0, subtotal + tax + service - discount)
  const balanceDue = Math.max(0, total - paidAmountInput)

  /** When a table is selected on the ticket, all tiles & lists below scope to that cover only */
  const scopedOrders = useMemo(() => {
    if (!tableId) return orders
    return orders.filter((o) => o.tableId === tableId)
  }, [orders, tableId])

  /**
   * Unpaid tickets still on the floor / in workflow (excludes full prepay — those stay on Kitchen display only).
   */
  const counterQueueOrders = useMemo(
    () =>
      scopedOrders.filter(
        (o) =>
          needsPaymentAtCounter(o) && isActiveCounterStatus(o.status),
      ),
    [scopedOrders],
  )

  const tableTicketOrders = useMemo(
    () => counterQueueOrders.filter((o) => o.serviceMode !== 'delivery'),
    [counterQueueOrders],
  )

  const deliveryTicketOrders = useMemo(
    () => counterQueueOrders.filter((o) => o.serviceMode === 'delivery'),
    [counterQueueOrders],
  )

  const displayedOrders = useMemo((): RestaurantOrder[] => {
    return ordersPanel === 'table' ? tableTicketOrders : deliveryTicketOrders
  }, [ordersPanel, tableTicketOrders, deliveryTicketOrders])

  const filteredDisplayedOrders = useMemo(() => {
    const q = ordersSearch.trim().toLowerCase()
    if (!q) return displayedOrders
    return displayedOrders.filter((o) => {
      const num = (o.orderNumber || '').toLowerCase()
      const label = (o.tableLabel || '').toLowerCase()
      const id = String(o.id || '').toLowerCase()
      return num.includes(q) || label.includes(q) || id.includes(q)
    })
  }, [displayedOrders, ordersSearch])

  const editingOrderMeta = useMemo(
    () => (editingOrderId ? orders.find((o) => o.id === editingOrderId) : undefined),
    [orders, editingOrderId],
  )

  const tableTicketCount = tableTicketOrders.length
  const deliveryTicketCount = deliveryTicketOrders.length

  const addLine = useCallback((p: PosProduct) => {
    const id = p.id || p._id
    if (!id) return
    const thumbUrl = resolvePosProductImageUrl(p)
    setCart((c) => {
      const i = c.findIndex((x) => x.productId === id)
      if (i >= 0) {
        const next = [...c]
        next[i] = { ...next[i], quantity: next[i].quantity + 1 }
        return next
      }
      return [
        ...c,
        {
          productId: id,
          name: p.name,
          unitPrice: p.price,
          quantity: 1,
          thumbUrl,
        },
      ]
    })
  }, [])

  const pickProduct = useCallback(
    (p: PosProduct) => {
      addLine(p)
    },
    [addLine],
  )

  const bumpQty = useCallback((idx: number, delta: number) => {
    setCart((c) => {
      const row = c[idx]
      if (!row) return c
      const nextQ = row.quantity + delta
      if (nextQ <= 0) return c.filter((_, i) => i !== idx)
      const copy = [...c]
      copy[idx] = { ...row, quantity: nextQ }
      return copy
    })
  }, [])

  const setLineQty = useCallback((idx: number, raw: number) => {
    const q = Math.floor(Number(raw))
    if (!Number.isFinite(q) || q <= 0) {
      setCart((c) => c.filter((_, i) => i !== idx))
      return
    }
    setCart((c) => {
      const copy = [...c]
      if (!copy[idx]) return c
      copy[idx] = { ...copy[idx], quantity: Math.min(999, q) }
      return copy
    })
  }, [])

  const setLineUnitPrice = useCallback((idx: number, raw: number) => {
    const p = Math.max(0, Number(raw))
    if (!Number.isFinite(p)) return
    setCart((c) => {
      const copy = [...c]
      if (!copy[idx]) return c
      copy[idx] = { ...copy[idx], unitPrice: p }
      return copy
    })
  }, [])

  const triggerKitchenPrint = useCallback(
    (order: RestaurantOrder) => {
      setPrintOrder(order)
      setTimeout(() => printKitchen(), 80)
    },
    [printKitchen],
  )

  const triggerReceiptPrint = useCallback(
    (order: RestaurantOrder) => {
      setPrintOrder(order)
      setTimeout(() => printReceipt(), 80)
    },
    [printReceipt],
  )

  const fireOrder = async (
    mode: 'kitchen-only' | 'kitchen-and-print' | 'prepay-cash' | 'prepay-card',
  ) => {
    if (editingOrderId) {
      toast.error('Save changes or cancel edit before sending a new ticket')
      return
    }
    if (!cart.length) {
      toast.error('Cart is empty')
      return
    }
    const prepay =
      mode === 'prepay-cash' ? 'cash' : mode === 'prepay-card' ? 'card' : undefined
    if (prepay && total <= 0) {
      toast.error('Nothing to charge')
      return
    }

    const shouldPrintKitchen =
      mode === 'kitchen-and-print' ||
      (mode === 'kitchen-only' && printOnFire) ||
      (Boolean(prepay) && printOnFire)

    try {
      const order = await createOrder({
        lines: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        tableId: serviceMode === 'dine_in' ? tableId || undefined : undefined,
        source: 'pos',
        serviceMode,
        ...(serviceMode === 'delivery' && deliveryCustomerName.trim()
          ? { customerName: deliveryCustomerName.trim() }
          : {}),
        ...(serviceMode === 'delivery'
          ? deliveryLinkPayload(linkedCustomerId, deliveryCustomerName)
          : {}),
        taxAmount: tax,
        discountAmount: discount,
        serviceChargeAmount: service,
        ...(prepay && total > 0
          ? { prepaidAmount: total, prepaidMethod: prepay }
          : {}),
      }).unwrap()

      setCart([])
      setPaidAmountInput(0)
      setLastOrder(order as RestaurantOrder)
      refetchOrders()
      toast.success(
        prepay ? `Collected ${fmt(total)} · ${order.orderNumber}` : `Sent ${order.orderNumber}`,
      )

      if (shouldPrintKitchen) {
        triggerKitchenPrint(order as RestaurantOrder)
      }
    } catch {
      toast.error('Could not send order')
    }
  }

  const clearEditModeAfterSuccess = () => {
    setEditingOrderId(null)
    setCart([])
    setTax(0)
    setDiscount(0)
    setService(0)
    setPaidAmountInput(0)
    setLinkedCustomerId(null)
    setDeliveryContext(null)
  }

  const markPaid = async (order: RestaurantOrder, method: string) => {
    if (!order?.id) return
    try {
      await patchStatus({
        orderId: order.id,
        status: 'paid',
        paymentMethod: method,
      }).unwrap()
      toast.success('Marked paid')
      refetchOrders()
      if (lastOrder?.id === order.id) setLastOrder(null)
      if (editingOrderId === order.id) clearEditModeAfterSuccess()
    } catch {
      toast.error('Update failed')
    }
  }

  const markPaidDelivered = async (order: RestaurantOrder, method: string) => {
    if (!order?.id) return
    try {
      await patchStatus({
        orderId: order.id,
        status: 'paid',
        paymentMethod: method,
        markDelivered: true,
      }).unwrap()
      toast.success('Paid & delivered')
      refetchOrders()
      if (lastOrder?.id === order.id) setLastOrder(null)
      if (editingOrderId === order.id) clearEditModeAfterSuccess()
    } catch {
      toast.error('Update failed')
    }
  }

  const markOutForDelivery = async (order: RestaurantOrder) => {
    if (!order?.id) return
    try {
      await patchStatus({
        orderId: order.id,
        status: 'out_for_delivery',
      }).unwrap()
      toast.success('Marked out for delivery')
      refetchOrders()
    } catch {
      toast.error('Update failed')
    }
  }

  const clearEditMode = () => {
    setEditingOrderId(null)
    setCart([])
    setTax(0)
    setDiscount(0)
    setService(0)
    setPaidAmountInput(0)
    setLinkedCustomerId(null)
    setDeliveryContext(null)
    toast.message('Edit cancelled')
  }

  const saveEditedOrder = async () => {
    if (!editingOrderId || !cart.length) {
      toast.error('Add at least one line')
      return
    }
    try {
      await updateOrder({
        orderId: editingOrderId,
        lines: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        ...(serviceMode === 'dine_in' ? { tableId: tableId ?? null } : {}),
        taxAmount: tax,
        discountAmount: discount,
        serviceChargeAmount: service,
        ...(serviceMode === 'delivery'
          ? {
              customerName: deliveryCustomerName.trim() || undefined,
              ...deliveryLinkPayload(linkedCustomerId, deliveryCustomerName),
            }
          : {}),
      }).unwrap()
      toast.success('Order updated')
      clearEditModeAfterSuccess()
      refetchOrders()
    } catch {
      toast.error('Could not save order')
    }
  }

  const beginEditOrder = useCallback(
    (order: RestaurantOrder) => {
      if (order.status === 'paid' || order.status === 'cancelled') {
        toast.error('This ticket is already closed')
        return
      }
      const mode: 'dine_in' | 'delivery' =
        order.serviceMode === 'delivery' ? 'delivery' : 'dine_in'
      setServiceMode(mode)
      setEditingOrderId(order.id)
      setTax(order.taxAmount ?? 0)
      setDiscount(order.discountAmount ?? 0)
      setService(order.serviceChargeAmount ?? 0)
      setPaidAmountInput(order.prepaidAmount ?? 0)
      setDeliveryCustomerName(order.customerName ?? '')
      setLinkedCustomerId(order.customerId ? String(order.customerId) : null)
      setTableId(order.tableId)
      const next: CartLine[] = []
      for (const line of order.lines) {
        const rawId = line.productId as unknown
        const pid =
          rawId && typeof rawId === 'object' && '_id' in (rawId as object)
            ? String((rawId as { _id: string })._id)
            : rawId
              ? String(rawId)
              : ''
        if (!pid) continue
        const p = products?.find((x) => (x.id || x._id) === pid)
        const thumbUrl = p ? resolvePosProductImageUrl(p) : undefined
        next.push({
          productId: pid,
          name: line.name,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          thumbUrl,
        })
      }
      setCart(next)
      toast.message(`Editing ${order.orderNumber}`)
    },
    [products],
  )

  const fillPaidFromTotal = () => {
    setPaidAmountInput(total)
  }

  const productThumbFallback = useCallback(
    (productId: string) => {
      const p = products?.find((x) => (x.id || x._id) === productId)
      return p ? resolvePosProductImageUrl(p) : undefined
    },
    [products],
  )

  return (
    <RestaurantShell
      title='Point of sale'
      description='Table service or delivery: fire tickets to the kitchen, track balances below, and settle cash or COD.'
    >
      <div className='grid gap-4 xl:grid-cols-12'>
        <PosMenuCatalog products={products} onPickProduct={pickProduct} />

        <div className='flex min-h-0 flex-col gap-3 xl:col-span-5'>
          <Tabs
            value={serviceMode}
            onValueChange={(v) => {
              const m = v as 'dine_in' | 'delivery'
              setEditingOrderId(null)
              setCart([])
              setTax(0)
              setDiscount(0)
              setService(0)
              setPaidAmountInput(0)
              setLinkedCustomerId(null)
              setDeliveryContext(null)
              setDeliveryCustomerName('')
              setServiceMode(m)
              if (m === 'delivery') {
                setTableId(undefined)
              }
            }}
            className='w-full gap-3'
          >
            <TabsList className='grid h-auto w-full grid-cols-2 gap-1 p-1'>
              <TabsTrigger value='dine_in' className='text-xs sm:text-sm'>
                Table tickets
              </TabsTrigger>
              <TabsTrigger value='delivery' className='text-xs sm:text-sm'>
                Orders for delivery
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {serviceMode === 'dine_in' ? (
            <p className='rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground'>
              Seat guests on a table cover, send to the kitchen, then collect payment from{' '}
              <strong className='text-foreground'>Table tickets</strong> below.
            </p>
          ) : (
            <p className='rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground'>
              Delivery runs appear under <strong className='text-foreground'>Orders for delivery</strong>. Mark{' '}
              <strong className='text-foreground'>Out for delivery</strong>, then when you receive cash use{' '}
              <strong className='text-foreground'>Cash received · Paid &amp; delivered</strong>.
            </p>
          )}

          {editingOrderId ? (
            <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2'>
              <p className='text-xs font-medium text-foreground'>Editing an open ticket · save or cancel</p>
              <div className='flex gap-2'>
                <Button type='button' variant='outline' size='sm' onClick={clearEditMode}>
                  Cancel
                </Button>
                <Button
                  type='button'
                  size='sm'
                  onClick={saveEditedOrder}
                  disabled={savingEdit || !cart.length}
                >
                  Save changes
                </Button>
              </div>
            </div>
          ) : null}

          <Card className='overflow-hidden border-border/60 shadow-md'>
            <CardHeader className='border-b border-border/50 bg-gradient-to-r from-muted/40 to-muted/10 px-4 py-3'>
              <CardTitle className='text-sm font-semibold'>
                {serviceMode === 'delivery' ? 'Delivery' : 'Table cover'}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3 p-4'>
              {serviceMode === 'delivery' ? (
                <div className='space-y-3'>
                  <div className='space-y-2'>
                    <Label htmlFor='pos-delivery-name' className='text-xs text-muted-foreground'>
                      Customer · phone or label
                    </Label>
                    <Input
                      id='pos-delivery-name'
                      placeholder='e.g. 03211626195 or Name · phone'
                      value={deliveryCustomerName}
                      onChange={(e) => setDeliveryCustomerName(e.target.value)}
                      className='border-border/70'
                      autoComplete='tel'
                    />
                    <p className='text-[10px] leading-relaxed text-muted-foreground'>
                      Enter at least <strong className='text-foreground'>7 digits</strong> to load saved customer
                      details (Customers module) and recent delivery tickets for this branch.
                    </p>
                  </div>

                  {(deliveryLookupLoading ||
                    (deliveryContext &&
                      extractDigitsFromLabel(deliveryCustomerName).length >= 7)) && (
                    <div className='rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5 text-xs'>
                      {deliveryLookupLoading ? (
                        <p className='text-muted-foreground'>Looking up customer &amp; order history…</p>
                      ) : deliveryContext ? (
                        <div className='space-y-3'>
                          {deliveryContext.customer ? (
                            <div className='space-y-1'>
                              <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
                                Saved customer
                              </p>
                              <p className='font-semibold text-foreground'>{deliveryContext.customer.name}</p>
                              <div className='grid gap-0.5 text-muted-foreground'>
                                {deliveryContext.customer.phone ? (
                                  <p>
                                    <span className='text-foreground/80'>Phone:</span>{' '}
                                    {deliveryContext.customer.phone}
                                  </p>
                                ) : null}
                                {deliveryContext.customer.address ? (
                                  <p>
                                    <span className='text-foreground/80'>Address:</span>{' '}
                                    {deliveryContext.customer.address}
                                  </p>
                                ) : null}
                                {deliveryContext.customer.email ? (
                                  <p>
                                    <span className='text-foreground/80'>Email:</span>{' '}
                                    {deliveryContext.customer.email}
                                  </p>
                                ) : null}
                                {deliveryContext.customer.balance != null &&
                                deliveryContext.customer.balance !== 0 ? (
                                  <p>
                                    <span className='text-foreground/80'>Balance:</span>{' '}
                                    {fmt(Number(deliveryContext.customer.balance))}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <p className='text-muted-foreground'>
                              No CRM profile for this number yet — history below is from past delivery tickets only.
                            </p>
                          )}

                          {deliveryContext.recentOrders.length > 0 ? (
                            <div className='border-t border-border/50 pt-2'>
                              <p className='mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
                                Recent delivery tickets
                              </p>
                              <ul className='max-h-36 space-y-2 overflow-y-auto pr-1'>
                                {deliveryContext.recentOrders.map((row) => (
                                  <li
                                    key={row.id}
                                    className='rounded-md border border-border/40 bg-background/80 px-2 py-1.5'
                                  >
                                    <div className='flex flex-wrap items-baseline justify-between gap-1'>
                                      <span className='font-mono font-medium text-foreground'>
                                        {row.orderNumber}
                                      </span>
                                      <span className='tabular-nums text-foreground'>{fmt(row.total)}</span>
                                    </div>
                                    <div className='mt-0.5 flex flex-wrap gap-1'>
                                      <Badge variant='outline' className='text-[10px]'>
                                        {row.status.replace(/_/g, ' ')}
                                      </Badge>
                                      {row.createdAt ? (
                                        <span className='text-[10px] text-muted-foreground'>
                                          {new Date(row.createdAt).toLocaleString()}
                                        </span>
                                      ) : null}
                                    </div>
                                    {row.linePreview ? (
                                      <p className='mt-1 line-clamp-2 text-[10px] text-muted-foreground'>
                                        {row.linePreview}
                                      </p>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : !deliveryContext.customer ? (
                            <p className='text-[11px] text-muted-foreground'>No prior tickets with this number.</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : (
                <Select
                  value={tableId ?? '__walkin'}
                  onValueChange={(v) => setTableId(v === '__walkin' ? undefined : v)}
                >
                  <SelectTrigger className='border-border/70'>
                    <SelectValue placeholder='Walk-in' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='__walkin'>Walk-in (no table yet)</SelectItem>
                    {tables.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {typeof t.floorId === 'object' && t.floorId && 'name' in t.floorId
                          ? `${t.floorId.name} · `
                          : ''}
                        Table {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className='rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 to-transparent px-4 py-3'>
                <p className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                  Active cover
                </p>
                <p className='text-xl font-bold tracking-tight text-foreground'>{tableSummary.title}</p>
                <p className='text-xs text-muted-foreground'>{tableSummary.detail}</p>
              </div>
            </CardContent>
          </Card>

          <Card className='flex flex-col overflow-hidden border-border/60 shadow-md'>
            <CardHeader className='shrink-0 border-b border-border/50 bg-gradient-to-r from-muted/40 to-muted/10 px-4 py-3'>
              <div className='flex items-center justify-between gap-2'>
                <CardTitle className='text-sm font-semibold'>
                  {editingOrderMeta ? `Ticket · ${editingOrderMeta.orderNumber}` : 'Ticket'}
                </CardTitle>
                <Badge variant='secondary' className='font-mono text-xs'>
                  {cart.length} lines
                </Badge>
              </div>
              <p className='text-[11px] font-normal text-muted-foreground'>
                Invoice-style lines scroll above · totals &amp; send buttons stay fixed below
              </p>
            </CardHeader>
            <CardContent className='flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0'>
              <ScrollArea
                type='always'
                className='h-[clamp(160px,calc(100vh-30rem),320px)] shrink-0 border-b border-border/50 bg-muted/10'
              >
                <ul className='space-y-2 p-3'>
                  {cart.length === 0 ? (
                    <li className='rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground'>
                      <UtensilsCrossed className='mx-auto mb-2 h-9 w-9 opacity-25' />
                      Add dishes from the menu to start a ticket.
                    </li>
                  ) : (
                    cart.map((l, idx) => {
                      const thumb = l.thumbUrl || productThumbFallback(l.productId)
                      const lineTotal = l.quantity * l.unitPrice
                      return (
                        <li
                          key={`${l.productId}-${idx}`}
                          className='rounded-lg border border-border/70 bg-card px-2 py-2 shadow-sm'
                        >
                          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2'>
                            <div className='flex min-w-0 flex-[1.4] items-center gap-2'>
                              <div className='relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border/50'>
                                {thumb ? (
                                  <img
                                    src={thumb}
                                    alt=''
                                    className='h-full w-full object-cover'
                                    loading='lazy'
                                  />
                                ) : (
                                  <div className='flex h-full w-full items-center justify-center'>
                                    <UtensilsCrossed className='h-4 w-4 text-muted-foreground/45' />
                                  </div>
                                )}
                              </div>
                              <span className='truncate text-sm font-semibold leading-tight text-foreground'>
                                {l.name}
                              </span>
                            </div>

                            <div className='flex flex-wrap items-center gap-x-2 gap-y-2 sm:flex-[2] sm:justify-end'>
                              <div className='flex items-center gap-1.5'>
                                <span className='sr-only sm:not-sr-only sm:text-[10px] sm:font-semibold sm:uppercase sm:text-muted-foreground'>
                                  Unit
                                </span>
                                <Input
                                  type='number'
                                  inputMode='decimal'
                                  step='0.01'
                                  className='h-9 w-[5.75rem] border-border bg-background text-right text-sm font-semibold tabular-nums'
                                  value={l.unitPrice}
                                  onChange={(e) => setLineUnitPrice(idx, Number(e.target.value))}
                                />
                              </div>

                              <div className='flex h-9 overflow-hidden rounded-md border border-input bg-background'>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='icon'
                                  className='h-9 w-9 shrink-0 rounded-none border-r border-border/60 px-0 hover:bg-muted'
                                  onClick={() => bumpQty(idx, -1)}
                                  aria-label='Decrease quantity'
                                >
                                  <Minus className='h-3.5 w-3.5' />
                                </Button>
                                <input
                                  type='number'
                                  min={1}
                                  className='w-11 min-w-[2.75rem] border-0 bg-transparent text-center text-sm font-bold tabular-nums text-foreground [appearance:textfield] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                                  value={l.quantity}
                                  onChange={(e) => setLineQty(idx, Number(e.target.value))}
                                />
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='icon'
                                  className='h-9 w-9 shrink-0 rounded-none border-l border-border/60 px-0 hover:bg-muted'
                                  onClick={() => bumpQty(idx, 1)}
                                  aria-label='Increase quantity'
                                >
                                  <Plus className='h-3.5 w-3.5' />
                                </Button>
                              </div>

                              <span className='min-w-[5.5rem] text-right text-sm font-bold tabular-nums'>
                                {fmt(lineTotal)}
                              </span>

                              <Button
                                variant='ghost'
                                size='icon'
                                type='button'
                                className='h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive'
                                onClick={() =>
                                  setCart((c) => c.filter((_, i) => i !== idx))
                                }
                                aria-label='Remove line'
                              >
                                ✕
                              </Button>
                            </div>
                          </div>
                        </li>
                      )
                    })
                  )}
                </ul>
              </ScrollArea>

              <div className='shrink-0 space-y-3 bg-muted/15 p-4 text-sm'>
                <div className='flex justify-between gap-4'>
                  <span className='text-muted-foreground'>Subtotal</span>
                  <span className='tabular-nums font-medium'>{fmt(subtotal)}</span>
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-muted-foreground'>Tax</span>
                  <Input
                    type='number'
                    className='h-9 w-28 border-border/70 text-right tabular-nums'
                    value={tax}
                    onChange={(e) => setTax(Number(e.target.value))}
                  />
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-muted-foreground'>Discount</span>
                  <Input
                    type='number'
                    className='h-9 w-28 border-border/70 text-right tabular-nums'
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                  />
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-muted-foreground'>Service</span>
                  <Input
                    type='number'
                    className='h-9 w-28 border-border/70 text-right tabular-nums'
                    value={service}
                    onChange={(e) => setService(Number(e.target.value))}
                  />
                </div>
                <Separator />
                <div className='flex justify-between text-base font-bold'>
                  <span>Total</span>
                  <span className='tabular-nums'>{fmt(total)}</span>
                </div>
                <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
                  <div className='min-w-0 flex-1 space-y-1'>
                    <Label className='text-xs text-muted-foreground'>Paid amount</Label>
                    <div className='flex gap-2'>
                      <Input
                        type='number'
                        className='h-10 min-w-0 flex-1 border-border/70 text-right tabular-nums'
                        value={paidAmountInput}
                        onChange={(e) => setPaidAmountInput(Number(e.target.value))}
                      />
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='shrink-0'
                        onClick={fillPaidFromTotal}
                      >
                        Full
                      </Button>
                    </div>
                  </div>
                  <div className='text-right'>
                    <p className='text-xs text-muted-foreground'>Balance due</p>
                    <p className='text-lg font-bold tabular-nums text-foreground'>{fmt(balanceDue)}</p>
                  </div>
                </div>
              </div>

              {!editingOrderId ? (
                <div className='shrink-0 space-y-4 border-t border-border/60 bg-gradient-to-b from-muted/25 to-muted/40 px-4 py-4'>
                  <div className='flex items-start gap-3 rounded-lg border border-border/50 bg-background/80 px-3 py-2.5'>
                    <Checkbox
                      id='pos-print-on-fire'
                      checked={printOnFire}
                      onCheckedChange={(v) => setPrintOnFire(Boolean(v))}
                      className='mt-0.5'
                    />
                    <Label htmlFor='pos-print-on-fire' className='cursor-pointer text-xs leading-relaxed text-muted-foreground'>
                      Also print kitchen ticket when using <span className='font-medium text-foreground'>Fire to kitchen</span>{' '}
                      or prepaid send
                    </Label>
                  </div>

                  <div>
                    <p className='mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                      Send to kitchen
                    </p>
                    <div className='grid gap-2 sm:grid-cols-2'>
                      <Button
                        type='button'
                        variant='default'
                        size='lg'
                        className='w-full font-semibold shadow-md'
                        disabled={isLoading || !cart.length}
                        onClick={() => fireOrder('kitchen-only')}
                      >
                        Fire to kitchen
                      </Button>
                      <Button
                        type='button'
                        variant='secondary'
                        size='lg'
                        className='w-full border border-border font-semibold shadow-sm'
                        disabled={isLoading || !cart.length}
                        onClick={() => fireOrder('kitchen-and-print')}
                      >
                        Fire to kitchen & print
                      </Button>
                    </div>
                  </div>

                  <div className='rounded-xl border border-dashed border-primary/30 bg-background/60 p-3'>
                    <p className='mb-2 text-xs font-semibold text-foreground'>
                      Pay full amount before sending to kitchen
                    </p>
                    <div className='grid gap-2 sm:grid-cols-2'>
                      <Button
                        type='button'
                        variant='outline'
                        size='lg'
                        className='w-full font-medium'
                        disabled={isLoading || !cart.length || total <= 0}
                        onClick={() => fireOrder('prepay-cash')}
                      >
                        Pay cash & send
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        size='lg'
                        className='w-full font-medium'
                        disabled={isLoading || !cart.length || total <= 0}
                        onClick={() => fireOrder('prepay-card')}
                      >
                        Pay card & send
                      </Button>
                    </div>
                    <p className='mt-2 text-[11px] leading-relaxed text-muted-foreground'>
                      Full prepay skips the POS kitchen queue below — cooks work it on{' '}
                      <Link
                        to='/restaurant/kitchen'
                        className='font-medium text-primary underline-offset-2 hover:underline'
                      >
                        Kitchen display
                      </Link>
                      . Reprint from <span className='font-medium text-foreground'>Last sent</span> after you fire.
                    </p>
                  </div>
                </div>
              ) : (
                <div className='shrink-0 border-t border-border/60 bg-muted/20 px-4 py-3 text-center text-xs text-muted-foreground'>
                  Use <span className='font-medium text-foreground'>Save changes</span> above to update this ticket in the
                  kitchen queue.
                </div>
              )}
            </CardContent>
          </Card>

          {lastOrder ? (
            <Card className='border-border/60 shadow-sm'>
              <CardHeader className='border-b border-border/50 bg-muted/15 px-4 py-3'>
                <CardTitle className='text-sm font-semibold'>
                  Last sent · {lastOrder.orderNumber}
                </CardTitle>
              </CardHeader>
              <CardContent className='flex flex-wrap gap-2 pt-4'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => triggerKitchenPrint(lastOrder)}
                >
                  Reprint kitchen
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => triggerReceiptPrint(lastOrder)}
                >
                  Reprint receipt
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <div className='mt-4 space-y-2'>
        <p className='text-xs text-muted-foreground'>
          Switch between table service and delivery queues.{' '}
          {tableId ? (
            <>
              Counts match <span className='font-medium text-foreground'>{tableSummary.title}</span> when a table is
              selected — walk-in shows all branch tickets.
            </>
          ) : (
            <>Pick a table above to scope counts to one cover.</>
          )}
        </p>
        <div className='grid gap-3 sm:grid-cols-2'>
          <MetricTile
            icon={Armchair}
            label='Table tickets'
            value={tableTicketCount}
            hint='Dine-in & counter (excl. delivery)'
            selected={ordersPanel === 'table'}
            onClick={() => setOrdersPanel('table')}
            className='border-sky-500/25 bg-gradient-to-br from-sky-500/10 to-transparent'
          />
          <MetricTile
            icon={Truck}
            label='Orders for delivery'
            value={deliveryTicketCount}
            hint='COD · out for delivery → paid'
            selected={ordersPanel === 'delivery'}
            onClick={() => setOrdersPanel('delivery')}
            className='border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-transparent'
          />
        </div>
      </div>

      <Card className='mt-4 overflow-hidden border-border/60 shadow-md'>
        <CardHeader className='space-y-3 border-b border-border/50 bg-gradient-to-r from-muted/40 to-muted/10 px-4 py-3'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
            <div className='min-w-0'>
              <CardTitle className='flex flex-wrap items-center gap-2 text-base font-semibold'>
                <span>
                  {ordersPanel === 'table' && 'Ticket queue · table service'}
                  {ordersPanel === 'delivery' && 'Ticket queue · delivery'}
                </span>
                {tableId ? (
                  <Badge variant='outline' className='text-xs font-normal'>
                    {tableSummary.title}
                  </Badge>
                ) : (
                  <Badge variant='secondary' className='text-xs font-normal'>
                    All covers
                  </Badge>
                )}
              </CardTitle>
              <p className='mt-1 text-xs font-normal text-muted-foreground'>
                {ordersPanel === 'table' &&
                  'Open tickets that still owe money at the POS (walk-in and seated). Full prepay-at-fire orders stay off this list — see Kitchen display.'}
                {ordersPanel === 'delivery' &&
                  'Delivery runs that still need payment. Mark out for delivery, then record cash or card as paid & delivered.'}
              </p>
            </div>
            <div className='relative w-full shrink-0 sm:w-72'>
              <Search className='pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                type='search'
                placeholder='Search ticket #, table…'
                value={ordersSearch}
                onChange={(e) => setOrdersSearch(e.target.value)}
                className='h-9 border-border/70 pl-8'
                aria-label='Search orders'
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className='p-4'>
          {displayedOrders.length === 0 ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>
              {ordersPanel === 'table' && 'No table-service tickets match this filter.'}
              {ordersPanel === 'delivery' && 'No delivery tickets need payment right now.'}
            </p>
          ) : filteredDisplayedOrders.length === 0 ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>
              No tickets match &ldquo;{ordersSearch.trim()}&rdquo;. Clear search or try another ticket number or table.
            </p>
          ) : (
            <div
              className={cn(
                'max-h-[min(420px,48vh)] min-h-[140px] overflow-y-scroll overflow-x-hidden rounded-lg border border-border/40 bg-muted/5 pr-2',
                '[scrollbar-width:thin] [scrollbar-color:hsl(var(--muted-foreground)/0.55)_hsl(var(--muted)/0.5)]',
                '[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-muted/40',
              )}
            >
              <ul className='space-y-3 p-1'>
                {filteredDisplayedOrders.map((o) => (
                  <PosOrderRow
                    key={o.id}
                    order={o}
                    payEnabled={canMarkPaid(o)}
                    editing={editingOrderId === o.id}
                    onSelect={() => beginEditOrder(o)}
                    onKitchenPrint={() => triggerKitchenPrint(o)}
                    onReceiptPrint={() => triggerReceiptPrint(o)}
                    onPayCash={() => markPaid(o, 'cash')}
                    onPayCard={() => markPaid(o, 'card')}
                    onOutForDelivery={() => markOutForDelivery(o)}
                    onPaidDeliveredCash={() => markPaidDelivered(o, 'cash')}
                    onPaidDeliveredCard={() => markPaidDelivered(o, 'card')}
                  />
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className='hidden'>
        <div ref={kitchenRef}>
          {printOrder ? (
            <KitchenTicket order={printOrder} venueName={org?.name} />
          ) : null}
        </div>
        <div ref={receiptRef}>
          {printOrder ? (
            <CustomerReceipt order={printOrder} venueName={org?.name} />
          ) : null}
        </div>
      </div>
    </RestaurantShell>
  )
}

function PosOrderRow({
  order,
  payEnabled,
  editing,
  onSelect,
  onKitchenPrint,
  onReceiptPrint,
  onPayCash,
  onPayCard,
  onOutForDelivery,
  onPaidDeliveredCash,
  onPaidDeliveredCard,
}: {
  order: RestaurantOrder
  payEnabled: boolean
  editing?: boolean
  onSelect: () => void
  onKitchenPrint: () => void
  onReceiptPrint: () => void
  onPayCash: () => void
  onPayCard: () => void
  onOutForDelivery: () => void
  onPaidDeliveredCash: () => void
  onPaidDeliveredCard: () => void
}) {
  const isDelivery = order.serviceMode === 'delivery'
  const outForDelivery = order.status === 'out_for_delivery'

  const modeLabel =
    order.serviceMode === 'delivery'
      ? 'Delivery'
      : order.serviceMode === 'takeaway'
        ? 'Takeaway'
        : 'Dine-in'

  return (
    <li
      className={cn(
        'rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors',
        editing ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '',
        'cursor-pointer hover:bg-muted/30',
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      role='button'
      tabIndex={0}
    >
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <p className='font-mono text-sm font-semibold'>{order.orderNumber}</p>
          <p className='truncate text-xs text-muted-foreground'>
            {order.tableLabel ||
              (isDelivery ? order.customerName || 'Delivery' : 'Walk-in')}
          </p>
          <p className='mt-1 text-sm font-medium'>{fmt(order.total)}</p>
          {order.prepaidAmount != null && order.prepaidAmount > 0 ? (
            <Badge variant='secondary' className='mt-1 text-[10px]'>
              Prepaid {fmt(order.prepaidAmount)}
              {order.prepaidMethod ? ` · ${order.prepaidMethod}` : ''}
            </Badge>
          ) : null}
          {order.deliveredAt ? (
            <Badge variant='outline' className='mt-1 text-[10px]'>
              Delivered {new Date(order.deliveredAt).toLocaleString()}
            </Badge>
          ) : null}
        </div>
        <div className='flex flex-wrap items-center justify-end gap-1'>
          <Badge variant={isDelivery ? 'default' : 'secondary'} className='text-[10px]'>
            {modeLabel}
          </Badge>
          <Badge variant='outline' className='text-[10px]'>
            {order.status.replace(/_/g, ' ')}
          </Badge>
        </div>
      </div>
      <div
        className='mt-3 flex flex-wrap gap-2'
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Button type='button' variant='outline' size='sm' onClick={onKitchenPrint}>
          Reprint kitchen
        </Button>
        <Button type='button' variant='outline' size='sm' onClick={onReceiptPrint}>
          Reprint receipt
        </Button>

        {isDelivery && payEnabled && !outForDelivery ? (
          <Button type='button' variant='secondary' size='sm' onClick={onOutForDelivery}>
            Out for delivery
          </Button>
        ) : null}

        {isDelivery && payEnabled && outForDelivery ? (
          <>
            <Button type='button' size='sm' onClick={onPaidDeliveredCash}>
              Cash · Paid & delivered
            </Button>
            <Button type='button' size='sm' variant='secondary' onClick={onPaidDeliveredCard}>
              Card · Paid & delivered
            </Button>
          </>
        ) : null}

        {!isDelivery && payEnabled ? (
          <>
            <Button type='button' size='sm' onClick={onPayCash}>
              Pay cash
            </Button>
            <Button type='button' size='sm' variant='secondary' onClick={onPayCard}>
              Pay card
            </Button>
          </>
        ) : null}

        {isDelivery && payEnabled && !outForDelivery ? (
          <>
            <Button type='button' size='sm' variant='outline' onClick={onPayCash}>
              Pay cash
            </Button>
            <Button type='button' size='sm' variant='outline' onClick={onPayCard}>
              Pay card
            </Button>
          </>
        ) : null}

        {!payEnabled && order.status === 'paid' ? (
          <Badge variant='secondary' className='text-[10px]'>
            Paid
          </Badge>
        ) : null}
        {!payEnabled && order.status !== 'paid' ? (
          <span className='self-center text-[11px] text-muted-foreground'>
            Balanced or prepaid — nothing to collect at POS
          </span>
        ) : null}
      </div>
    </li>
  )
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
  selected,
  onClick,
  className,
}: {
  icon: LucideIcon
  label: string
  value: number | string
  hint: string
  selected?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition',
        onClick && 'cursor-pointer hover:shadow-md',
        selected &&
          'ring-2 ring-primary ring-offset-2 ring-offset-background dark:ring-offset-background',
        className,
      )}
    >
      <div className='flex items-start justify-between gap-2'>
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
            {label}
          </p>
          <p className='mt-1 text-3xl font-bold tabular-nums tracking-tight'>{value}</p>
          <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>
        </div>
        <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background/80 shadow-inner ring-1 ring-border/60'>
          <Icon className='h-5 w-5 text-foreground/80' />
        </span>
      </div>
    </button>
  )
}
