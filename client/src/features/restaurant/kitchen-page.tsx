import { useMemo, useRef, useState } from 'react'
import { RestaurantShell } from '@/features/restaurant/shell'
import {
  useGetOrdersQuery,
  useUpdateLineKitchenStatusMutation,
  useGetRestaurantStatsQuery,
} from '@/stores/restaurant.api'
import type { RestaurantOrder, OrderLine } from '@/stores/restaurant.api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useReactToPrint } from 'react-to-print'
import { KitchenTicket } from '@/features/restaurant/print-templates'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { toast } from 'sonner'

export default function RestaurantKitchenPage() {
  const { data: orders = [], refetch } = useGetOrdersQuery({ limit: 80 })
  const { data: org } = useGetMyOrganizationQuery()
  const { refetch: refetchStats } = useGetRestaurantStatsQuery()
  const [patchLine] = useUpdateLineKitchenStatusMutation()

  const active = useMemo(
    () =>
      orders.filter((o) =>
        ['open', 'in_progress', 'ready', 'served', 'out_for_delivery'].includes(o.status),
      ),
    [orders],
  )

  const printRef = useRef<HTMLDivElement>(null)
  const [printOrder, setPrintOrder] = useState<RestaurantOrder | null>(null)
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Kitchen ticket',
  })

  const bumpLine = async (
    order: RestaurantOrder,
    line: OrderLine & { _id?: string },
    status: 'preparing' | 'ready' | 'served',
  ) => {
    const lineId = (line as { id?: string }).id || line._id
    if (!lineId || !order.id) return
    try {
      await patchLine({ orderId: order.id, lineId, status }).unwrap()
      refetch()
      refetchStats()
      toast.success('Updated')
    } catch {
      toast.error('Could not update')
    }
  }

  return (
    <RestaurantShell
      title='Kitchen display'
      description='All active tickets (including full prepay from POS). Bump lines here — payment queue only shows balances still due.'
    >
      <div className='grid gap-4 lg:grid-cols-2 xl:grid-cols-3'>
        {active.map((order) => (
          <Card key={order.id} className='border-l-4 border-l-orange-500'>
            <CardHeader className='flex flex-row items-start justify-between gap-2 pb-2'>
              <div>
                <CardTitle className='font-mono text-base'>{order.orderNumber}</CardTitle>
                <div className='text-xs text-muted-foreground'>
                  {order.tableLabel || 'Walk-in'} · {order.source}
                </div>
              </div>
              <Badge variant='outline'>{order.status}</Badge>
            </CardHeader>
            <CardContent className='space-y-2'>
              <ScrollArea className='max-h-56'>
                <ul className='space-y-2 text-sm'>
                  {order.lines.map((line) => (
                    <li
                      key={(line as { id?: string }).id || line._id || line.name}
                      className='flex flex-col gap-2 rounded-md border px-2 py-2'
                    >
                      <div className='flex justify-between gap-2'>
                        <span className='font-medium'>
                          {line.quantity}× {line.name}
                        </span>
                        <Badge variant='secondary' className='text-[10px] uppercase'>
                          {line.station || 'kitchen'}
                        </Badge>
                      </div>
                      <div className='flex flex-wrap gap-1'>
                        <SmallBump
                          active={line.status === 'preparing'}
                          onClick={() => bumpLine(order, line, 'preparing')}
                        >
                          Prep
                        </SmallBump>
                        <SmallBump
                          active={line.status === 'ready'}
                          onClick={() => bumpLine(order, line, 'ready')}
                        >
                          Ready
                        </SmallBump>
                        <SmallBump
                          active={line.status === 'served'}
                          onClick={() => bumpLine(order, line, 'served')}
                        >
                          Out
                        </SmallBump>
                      </div>
                      {line.notes ? (
                        <div className='text-xs text-amber-700 dark:text-amber-300'>
                          Chef note: {line.notes}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
              <Button
                variant='outline'
                size='sm'
                className='w-full'
                onClick={() => {
                  setPrintOrder(order)
                  setTimeout(() => handlePrint(), 50)
                }}
              >
                Reprint ticket
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='hidden'>
        <div ref={printRef}>
          {printOrder ? (
            <KitchenTicket order={printOrder} venueName={org?.name} />
          ) : null}
        </div>
      </div>
    </RestaurantShell>
  )
}

function SmallBump({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <Button
      type='button'
      size='sm'
      variant={active ? 'default' : 'outline'}
      className='h-7 text-xs'
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
