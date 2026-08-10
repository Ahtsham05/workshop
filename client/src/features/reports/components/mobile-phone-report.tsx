import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PackageCheck, Smartphone, Wallet, TrendingUp } from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { formatBusinessDate } from '@/lib/business-timezone'
import {
  useGetUsedPhoneStatsQuery, useGetBuybacksQuery, type PhoneBuybackRecord,
} from '@/stores/usedPhoneBuyback.api'
import { useGetNewPhoneStatsQuery } from '@/stores/newPhones.api'
import { useGetImeisQuery, type ImeiRecord } from '@/stores/imei.api'
import { fetchAllProducts } from '@/stores/product.slice'
import { isUsedPhonesBucketProduct, gradeBadgeClasses, ptaBadgeConfig } from '@/features/mobile-shop/old-phones/constants'
import type { RootState, AppDispatch } from '@/stores/store'

interface MobilePhoneReportProps {
  startDate: string
  endDate: string
}

const fmt = (n?: number) => `Rs ${(n ?? 0).toLocaleString()}`

interface PhoneProductOption {
  id?: string
  _id?: string
  trackImei?: boolean
  name?: string
  category?: string
}

type RefDoc<T> = string | (T & { id: string }) | null | undefined

/** invoiceId/purchaseId only carry the human-facing number once the API populates them —
 *  a bare id string means the caller didn't ask for that (never the case here, but keeps
 *  this safe against any future endpoint that returns the raw id). */
const invoiceNumberOf = (ref: RefDoc<{ invoiceNumber?: string }>) =>
  ref && typeof ref === 'object' ? ref.invoiceNumber || '—' : '—'

const paymentMethodOf = (ref: RefDoc<{ paymentMethod?: string; walletType?: string }>) => {
  if (!ref || typeof ref !== 'object') return '—'
  if (ref.paymentMethod === 'wallet') return `Wallet${ref.walletType ? ` (${ref.walletType})` : ''}`
  return ref.paymentMethod || '—'
}

/** The list/detail endpoints populate imeiRecordId; the raw create response won't be. */
const getImeiSummary = (b: PhoneBuybackRecord) =>
  typeof b.imeiRecordId === 'object' && b.imeiRecordId !== null ? b.imeiRecordId : null

function UsedPhonesTab({ startDate, endDate }: MobilePhoneReportProps) {
  const { data: stats, isFetching: statsLoading } = useGetUsedPhoneStatsQuery({ dateFrom: startDate, dateTo: endDate })
  const { data, isFetching: isLoading } = useGetBuybacksQuery({ dateFrom: startDate, dateTo: endDate, limit: 50, sortBy: 'buybackDate:-1' })
  const rows = data?.results ?? []

  return (
    <div className='space-y-4'>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Card className={kpiCardClass('sky')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>In Stock</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('sky'))}><PackageCheck className='h-4 w-4' /></div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{statsLoading ? <Skeleton className='h-7 w-12' /> : stats?.in_stock ?? 0}</div>
            <p className='text-xs text-muted-foreground'>Bought, not yet sold</p>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('violet')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Sold</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('violet'))}><Smartphone className='h-4 w-4' /></div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{statsLoading ? <Skeleton className='h-7 w-12' /> : stats?.sold ?? 0}</div>
            <p className='text-xs text-muted-foreground'>Resold in period</p>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('orange')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Capital in Stock</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('orange'))}><Wallet className='h-4 w-4' /></div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-orange-600'>{statsLoading ? <Skeleton className='h-7 w-20' /> : fmt(stats?.capitalInStock)}</div>
            <p className='text-xs text-muted-foreground'>Tied up in unsold units</p>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('emerald')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Realized Profit</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('emerald'))}><TrendingUp className='h-4 w-4' /></div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-emerald-600'>{statsLoading ? <Skeleton className='h-7 w-20' /> : fmt(stats?.soldProfit)}</div>
            <p className='text-xs text-muted-foreground'>On units sold in period</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className='text-base'>Buybacks in period</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='space-y-2'>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className='h-12 w-full' />)}</div>
          ) : rows.length === 0 ? (
            <p className='py-8 text-center text-sm text-muted-foreground'>No buybacks in this period.</p>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead>Grade / PTA</TableHead>
                    <TableHead>Bought On</TableHead>
                    <TableHead>Buy Price</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sale Invoice #</TableHead>
                    <TableHead>Sale Price</TableHead>
                    <TableHead>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((b) => {
                    const summary = getImeiSummary(b)
                    const status = summary?.status ?? 'in_stock'
                    const isSold = status === 'sold'
                    const grade = summary?.condition?.grade
                    const pta = summary?.condition?.ptaStatus ?? 'unknown'
                    const profit = isSold ? (summary?.salePrice ?? 0) - b.agreedPrice : undefined
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className='font-medium whitespace-nowrap'>{[b.brand, b.model].filter(Boolean).join(' ') || '—'}</div>
                          <div className='text-xs text-muted-foreground font-mono'>
                            {summary?.imei2 ? `${b.imei} · ${summary.imei2}` : b.imei}
                          </div>
                        </TableCell>
                        <TableCell className='whitespace-nowrap'>
                          <div>{b.sellerName}</div>
                          <div className='text-xs text-muted-foreground'>{b.sellerPhone || '—'}</div>
                        </TableCell>
                        <TableCell className='whitespace-nowrap'>
                          <div className='flex items-center gap-1'>
                            {grade ? <Badge className={cn('text-xs font-bold', gradeBadgeClasses[grade])}>{grade}</Badge> : <span className='text-muted-foreground'>—</span>}
                            <Badge className={cn('text-xs', ptaBadgeConfig[pta].color)}>{ptaBadgeConfig[pta].label}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className='whitespace-nowrap'>{formatBusinessDate(b.buybackDate)}</TableCell>
                        <TableCell className='whitespace-nowrap'>{fmt(b.agreedPrice)}</TableCell>
                        <TableCell className='whitespace-nowrap capitalize'>
                          {b.paymentMethod === 'wallet' ? `Wallet${b.walletType ? ` (${b.walletType})` : ''}` : b.paymentMethod}
                        </TableCell>
                        <TableCell>
                          <Badge variant={isSold ? 'default' : 'secondary'} className='text-xs'>{status}</Badge>
                        </TableCell>
                        <TableCell className='whitespace-nowrap font-mono text-xs'>{isSold ? invoiceNumberOf(summary?.invoiceId) : '—'}</TableCell>
                        <TableCell className='whitespace-nowrap'>{isSold ? fmt(summary?.salePrice) : '—'}</TableCell>
                        <TableCell className={cn('whitespace-nowrap font-medium', profit != null && (profit >= 0 ? 'text-emerald-600' : 'text-destructive'))}>
                          {profit != null ? fmt(profit) : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function NewPhonesTab({ startDate, endDate }: MobilePhoneReportProps) {
  const dispatch = useDispatch<AppDispatch>()
  const productsRedux = useSelector((s: RootState) => (s as unknown as { product?: { products?: PhoneProductOption[] } }).product?.products ?? [])
  useEffect(() => { dispatch(fetchAllProducts({}) as unknown as never) }, [dispatch])
  const phoneProductIds = useMemo(
    () => productsRedux.filter((p) => p.trackImei && !isUsedPhonesBucketProduct(p)).map((p) => (p.id || p._id) as string).filter(Boolean).join(','),
    [productsRedux],
  )

  const { data: stats, isFetching: statsLoading } = useGetNewPhoneStatsQuery({ dateFrom: startDate, dateTo: endDate })
  const { data, isFetching: isLoading } = useGetImeisQuery(
    { productId: phoneProductIds, status: 'sold', dateFrom: startDate, dateTo: endDate, limit: 50, sortBy: 'saleDate:-1' },
    { skip: !phoneProductIds },
  )
  const rows: ImeiRecord[] = data?.results ?? []

  return (
    <div className='space-y-4'>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <Card className={kpiCardClass('sky')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>In Stock</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('sky'))}><PackageCheck className='h-4 w-4' /></div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{statsLoading ? <Skeleton className='h-7 w-12' /> : stats?.in_stock ?? 0}</div>
            <p className='text-xs text-muted-foreground'>Bought, not yet sold</p>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('violet')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Sold</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('violet'))}><Smartphone className='h-4 w-4' /></div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{statsLoading ? <Skeleton className='h-7 w-12' /> : stats?.sold ?? 0}</div>
            <p className='text-xs text-muted-foreground'>Sold in period</p>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('orange')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Capital in Stock</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('orange'))}><Wallet className='h-4 w-4' /></div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-orange-600'>{statsLoading ? <Skeleton className='h-7 w-20' /> : fmt(stats?.capitalInStock)}</div>
            <p className='text-xs text-muted-foreground'>Tied up in unsold units</p>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('emerald')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Realized Profit</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('emerald'))}><TrendingUp className='h-4 w-4' /></div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-emerald-600'>{statsLoading ? <Skeleton className='h-7 w-20' /> : fmt(stats?.soldProfit)}</div>
            <p className='text-xs text-muted-foreground'>On units sold in period</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className='text-base'>Sold in period</CardTitle></CardHeader>
        <CardContent>
          {!phoneProductIds ? (
            <p className='py-8 text-center text-sm text-muted-foreground'>No phone models tracked yet.</p>
          ) : isLoading ? (
            <div className='space-y-2'>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className='h-12 w-full' />)}</div>
          ) : rows.length === 0 ? (
            <p className='py-8 text-center text-sm text-muted-foreground'>No new phones sold in this period.</p>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Sold On</TableHead>
                    <TableHead>Sale Invoice #</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Purchase #</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Sale Price</TableHead>
                    <TableHead>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((unit) => {
                    const profit = (unit.salePrice ?? 0) - (unit.purchasePrice ?? 0)
                    return (
                      <TableRow key={unit.id}>
                        <TableCell>
                          <div className='font-medium whitespace-nowrap'>{unit.productName || '—'}</div>
                          <div className='text-xs text-muted-foreground font-mono'>
                            {unit.imei2 ? `${unit.imei} · ${unit.imei2}` : unit.imei}
                          </div>
                        </TableCell>
                        <TableCell className='whitespace-nowrap'>{unit.customerName || 'Walk-in'}</TableCell>
                        <TableCell className='whitespace-nowrap'>{unit.saleDate ? formatBusinessDate(unit.saleDate) : '—'}</TableCell>
                        <TableCell className='whitespace-nowrap font-mono text-xs'>{invoiceNumberOf(unit.invoiceId)}</TableCell>
                        <TableCell className='whitespace-nowrap capitalize'>{paymentMethodOf(unit.invoiceId)}</TableCell>
                        <TableCell className='whitespace-nowrap font-mono text-xs'>{invoiceNumberOf(unit.purchaseId)}</TableCell>
                        <TableCell className='whitespace-nowrap'>{fmt(unit.purchasePrice)}</TableCell>
                        <TableCell className='whitespace-nowrap font-medium'>{fmt(unit.salePrice)}</TableCell>
                        <TableCell className={cn('whitespace-nowrap font-medium', profit >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                          {fmt(profit)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export const MobilePhoneReport = forwardRef<{ exportToExcel: () => void }, MobilePhoneReportProps>(
  ({ startDate, endDate }, ref) => {
    const [activeSubTab, setActiveSubTab] = useState<'used' | 'new'>('used')

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        toast.info(`Switch to the ${activeSubTab === 'used' ? 'Used' : 'New'} Phones tab's own detail table to export — combined export isn't available yet.`)
        // Keep XLSX imported for parity with other reports' export button wiring even
        // though this report doesn't build its own workbook yet.
        void XLSX
      },
    }))

    return (
      <div className='space-y-4'>
        <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as 'used' | 'new')}>
          <TabsList>
            <TabsTrigger value='used'>Used Phones</TabsTrigger>
            <TabsTrigger value='new'>New Phones</TabsTrigger>
          </TabsList>
          <TabsContent value='used' className='mt-4'>
            <UsedPhonesTab startDate={startDate} endDate={endDate} />
          </TabsContent>
          <TabsContent value='new' className='mt-4'>
            <NewPhonesTab startDate={startDate} endDate={endDate} />
          </TabsContent>
        </Tabs>
      </div>
    )
  },
)

MobilePhoneReport.displayName = 'MobilePhoneReport'
