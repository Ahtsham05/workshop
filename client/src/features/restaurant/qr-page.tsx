import { useRef, useState } from 'react'
import { RestaurantShell } from '@/features/restaurant/shell'
import { useGetFloorsQuery, useGetTablesQuery } from '@/stores/restaurant.api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useReactToPrint } from 'react-to-print'
import { QrTableSheet } from '@/features/restaurant/print-templates'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { toast } from 'sonner'

export default function RestaurantQrPage() {
  const { data: floors = [] } = useGetFloorsQuery()
  const { data: tables = [] } = useGetTablesQuery()
  const { data: org } = useGetMyOrganizationQuery()
  const printRef = useRef<HTMLDivElement>(null)
  const [printPayload, setPrintPayload] = useState<{
    table: import('@/stores/restaurant.api').RestaurantTable
    orderUrl: string
    venueName: string
    floorName?: string
  } | null>(null)

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Table QR',
  })

  const base = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <RestaurantShell
      title='QR ordering & print'
      description='Print wallet-sized sheets for each table. Guests scan to browse your menu and submit orders.'
    >
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {tables.map((t) => {
          const floor =
            typeof t.floorId === 'object' && t.floorId && 'name' in t.floorId
              ? t.floorId.name
              : floors.find((f) => f.id === (t.floorId as string))?.name
          const url = `${base}/order/${t.qrToken}`
          const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`
          return (
            <Card key={t.id}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>
                  {floor ? `${floor} · ` : ''}Table {t.label}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div className='flex justify-center rounded-md bg-white p-2 dark:bg-muted/30'>
                  <img src={qrImg} alt='' className='h-40 w-40' />
                </div>
                <p className='break-all font-mono text-xs text-muted-foreground'>{url}</p>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    size='sm'
                    variant='secondary'
                    onClick={async () => {
                      await navigator.clipboard.writeText(url)
                      toast.success('Copied')
                    }}
                  >
                    Copy link
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      setPrintPayload({
                        table: t,
                        orderUrl: url,
                        venueName: org?.name || 'Restaurant',
                        floorName: floor,
                      })
                      setTimeout(() => handlePrint(), 60)
                    }}
                  >
                    Print sheet
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className='hidden'>
        <div ref={printRef}>
          {printPayload ? (
            <QrTableSheet
              table={printPayload.table}
              orderUrl={printPayload.orderUrl}
              venueName={printPayload.venueName}
              floorName={printPayload.floorName}
            />
          ) : null}
        </div>
      </div>
    </RestaurantShell>
  )
}
