import { useMemo, useState } from 'react'
import {
  Smartphone, Search, ShieldCheck, ShieldAlert, PackageCheck, Wallet as WalletIcon,
  TrendingUp, Trash2, ChevronRight, ScanLine, ListFilter, ShoppingBag, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { MobilePageShell } from '@/features/mobile-shop/components/mobile-page-shell'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import { formatBusinessDate } from '@/lib/business-timezone'
import {
  useDeleteBuybackMutation,
  useGetBuybacksQuery,
  useGetUsedPhoneStatsQuery,
  useUpdateBuybackMutation,
  type PhoneBuybackRecord,
} from '@/stores/usedPhoneBuyback.api'
import { BuyUsedPhoneDialog } from './components/buy-used-phone-dialog'
import {
  GRADE_OPTIONS, gradeBadgeClasses, ACCESSORY_OPTIONS, ptaBadgeConfig, statusBadgeConfig,
  CHECKLIST_FIELDS, fmtAmt, getImeiSummary, daysSince,
} from './constants'

export default function OldPhonesPage() {
  const [buyDialogOpen, setBuyDialogOpen] = useState(false)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 400)
  const [statusTab, setStatusTab] = useState<'all' | 'in_stock' | 'sold'>('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  // Date range narrows the "Sold" / "Realized Profit" stat cards (and the list below) to
  // a period — "in stock" / "capital in stock" stay a live snapshot regardless, since
  // what's on the shelf right now has no date range of its own.
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const hasDateRange = Boolean(dateFrom || dateTo)

  const [detailBuyback, setDetailBuyback] = useState<PhoneBuybackRecord | null>(null)
  const [askingPriceDraft, setAskingPriceDraft] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<PhoneBuybackRecord | null>(null)

  const { data: stats, isLoading: isStatsLoading } = useGetUsedPhoneStatsQuery({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })
  const { data, isLoading: isListLoading } = useGetBuybacksQuery({
    search: debouncedSearch || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit,
  })

  const [updateBuyback, { isLoading: isUpdating }] = useUpdateBuybackMutation()
  const [deleteBuyback, { isLoading: isDeleting }] = useDeleteBuybackMutation()

  const openDetail = (buyback: PhoneBuybackRecord) => {
    setDetailBuyback(buyback)
    setAskingPriceDraft(String(getImeiSummary(buyback)?.askingPrice ?? buyback.askingPrice ?? ''))
  }

  const handleSaveAskingPrice = async () => {
    if (!detailBuyback) return
    try {
      await updateBuyback({ id: detailBuyback.id, askingPrice: Number(askingPriceDraft) || 0 }).unwrap()
      toast.success('Asking price updated')
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Failed to update asking price')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await deleteBuyback(deleteConfirm.id).unwrap()
      toast.success('Buyback deleted')
      setDeleteConfirm(null)
      setDetailBuyback(null)
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Failed to delete — a sold unit cannot be removed')
    }
  }

  const filteredByTab = useMemo(() => {
    if (statusTab === 'all') return data?.results ?? []
    return (data?.results ?? []).filter((b) => (getImeiSummary(b)?.status ?? 'in_stock') === statusTab)
  }, [data?.results, statusTab])

  const detailImei = detailBuyback ? getImeiSummary(detailBuyback) : null
  const detailIsSold = detailImei ? detailImei.status !== 'in_stock' : false

  return (
    <MobilePageShell
      title='Old Phones'
      description='Buy old/used mobile phones from customers and walk-in sellers, grade their condition, and track them through to resale.'
      backTo={{ to: '/mobile-shop/used-phones', label: 'Mobile Phones' }}
    >
      {/* ── Date range + Buy Phone ── */}
      <div className='flex flex-wrap items-center justify-between gap-3 mb-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <Label className='text-sm text-muted-foreground shrink-0'>Profit period:</Label>
          <Input type='date' value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className='w-[150px] h-9' />
          <span className='text-sm text-muted-foreground'>to</span>
          <Input type='date' value={dateTo} onChange={(e) => setDateTo(e.target.value)} className='w-[150px] h-9' />
          {hasDateRange && (
            <Button variant='ghost' size='sm' onClick={() => { setDateFrom(''); setDateTo('') }}>
              <X className='h-3.5 w-3.5 mr-1' /> Clear
            </Button>
          )}
        </div>
        <Button onClick={() => setBuyDialogOpen(true)}>
          <ShoppingBag className='h-4 w-4 mr-1.5' /> Buy Phone
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-6'>
        <StatCard title='In Stock' value={stats?.in_stock ?? 0} description='Bought, not yet sold' icon={<PackageCheck />} tone='sky' isLoading={isStatsLoading} />
        <StatCard title='Sold' value={stats?.sold ?? 0} description={hasDateRange ? 'Resold in period' : 'Resold to customers'} icon={<Smartphone />} tone='emerald' isLoading={isStatsLoading} />
        <StatCard title='Capital in Stock' value={fmtAmt(stats?.capitalInStock)} description='Tied up in unsold units' icon={<WalletIcon />} tone='amber' isLoading={isStatsLoading} />
        <StatCard title='Realized Profit' value={fmtAmt(stats?.soldProfit)} description={hasDateRange ? 'On units sold in period' : 'On units sold so far'} icon={<TrendingUp />} tone='emerald' isLoading={isStatsLoading} />
      </div>

      {/* ── Inventory (full width) ── */}
      <Card className='flex flex-col'>
        <CardHeader className='flex flex-row items-center justify-between gap-4 flex-wrap'>
          <CardTitle className='flex items-center gap-2'>
            <ListFilter className='h-5 w-5 text-primary' /> Used Phone Inventory
          </CardTitle>
          <div className='relative w-full sm:w-64'>
            <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none' />
            <Input
              placeholder='Search seller, IMEI, brand, model...'
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className='pl-8 h-9'
            />
          </div>
        </CardHeader>
        <CardContent className='flex-1 overflow-auto'>
          <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as typeof statusTab)} className='mb-4'>
            <TabsList>
              <TabsTrigger value='all'>All</TabsTrigger>
              <TabsTrigger value='in_stock'>In Stock</TabsTrigger>
              <TabsTrigger value='sold'>Sold</TabsTrigger>
            </TabsList>
          </Tabs>

          {isListLoading ? (
            <div className='space-y-3'>
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className='h-14 rounded-lg bg-muted animate-pulse' />)}
            </div>
          ) : filteredByTab.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
              <Smartphone className='h-12 w-12 mb-3 opacity-30' />
              <p className='text-base font-medium'>No used phones found</p>
              <p className='text-sm'>Buy your first phone using the "Buy Phone" button above</p>
            </div>
          ) : (
            <>
              {/* Card list — phones/small tablets, avoids horizontal table scrolling */}
              <div className='md:hidden space-y-2'>
                {filteredByTab.map((b) => {
                  const summary = getImeiSummary(b)
                  const status = summary?.status ?? 'in_stock'
                  const grade = summary?.condition?.grade
                  const pta = summary?.condition?.ptaStatus ?? 'unknown'
                  return (
                    <button
                      key={b.id}
                      type='button'
                      onClick={() => openDetail(b)}
                      className='w-full rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/30 active:bg-muted/50'
                    >
                      <div className='flex items-start justify-between gap-2'>
                        <div className='min-w-0'>
                          <div className='font-medium truncate'>{[b.brand, b.model].filter(Boolean).join(' ') || '—'}</div>
                          <div className='text-xs text-muted-foreground font-mono flex items-center gap-1'>
                            <ScanLine className='h-3 w-3 shrink-0' />{b.imei}
                          </div>
                        </div>
                        <Badge className={cn('text-xs shrink-0', statusBadgeConfig[status]?.color)}>{statusBadgeConfig[status]?.label ?? status}</Badge>
                      </div>
                      <div className='mt-1.5 text-sm text-muted-foreground truncate'>
                        {b.sellerName}{b.sellerPhone ? ` · ${b.sellerPhone}` : ''}
                      </div>
                      <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                        {grade && <Badge className={cn('text-xs font-bold', gradeBadgeClasses[grade])}>{grade}</Badge>}
                        <Badge className={cn('text-xs', ptaBadgeConfig[pta].color)}>{ptaBadgeConfig[pta].label}</Badge>
                        {status === 'in_stock' && <span className='text-xs text-muted-foreground'>{daysSince(b.buybackDate)}d in stock</span>}
                      </div>
                      <div className='mt-2 flex items-center justify-between'>
                        <div className='font-semibold'>{fmtAmt(b.agreedPrice)}</div>
                        {(summary?.askingPrice ?? b.askingPrice) ? (
                          <div className='text-xs text-muted-foreground'>Ask {fmtAmt(summary?.askingPrice ?? b.askingPrice)}</div>
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Table — tablets and up */}
              <div className='hidden md:block overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>PTA</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredByTab.map((b) => {
                    const summary = getImeiSummary(b)
                    const status = summary?.status ?? 'in_stock'
                    const grade = summary?.condition?.grade
                    const pta = summary?.condition?.ptaStatus ?? 'unknown'
                    return (
                      <TableRow key={b.id} className='cursor-pointer hover:bg-muted/30' onClick={() => openDetail(b)}>
                        <TableCell>
                          <div className='font-medium whitespace-nowrap'>{[b.brand, b.model].filter(Boolean).join(' ') || '—'}</div>
                          <div className='text-xs text-muted-foreground font-mono flex items-center gap-1'><ScanLine className='h-3 w-3' />{b.imei}</div>
                        </TableCell>
                        <TableCell>
                          <div className='whitespace-nowrap'>{b.sellerName}</div>
                          <div className='text-xs text-muted-foreground'>{b.sellerPhone || '—'}</div>
                        </TableCell>
                        <TableCell>
                          {grade ? <Badge className={cn('text-xs font-bold', gradeBadgeClasses[grade])}>{grade}</Badge> : <span className='text-muted-foreground'>—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${ptaBadgeConfig[pta].color}`}>{ptaBadgeConfig[pta].label}</Badge>
                        </TableCell>
                        <TableCell className='whitespace-nowrap'>
                          <div className='font-medium'>{fmtAmt(b.agreedPrice)}</div>
                          {(summary?.askingPrice ?? b.askingPrice) ? (
                            <div className='text-xs text-muted-foreground'>Ask {fmtAmt(summary?.askingPrice ?? b.askingPrice)}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${statusBadgeConfig[status]?.color}`}>{statusBadgeConfig[status]?.label ?? status}</Badge>
                          {status === 'in_stock' && (
                            <div className='text-xs text-muted-foreground mt-0.5'>{daysSince(b.buybackDate)}d in stock</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button size='icon' variant='ghost' className='h-8 w-8'>
                            <ChevronRight className='h-4 w-4' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
            </>
          )}
          <SimplePagination
            currentPage={page}
            totalPages={data?.totalPages ?? 1}
            totalResults={data?.totalResults}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(l) => { setLimit(l); setPage(1) }}
            className='mt-3'
          />
        </CardContent>
      </Card>

      {/* ── Buy Phone Dialog ── */}
      <BuyUsedPhoneDialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen} />

      {/* ── Detail Dialog ── */}
      <Dialog open={!!detailBuyback} onOpenChange={(open) => !open && setDetailBuyback(null)}>
        <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
          {detailBuyback && (
            <>
              <DialogHeader>
                <DialogTitle className='flex items-center gap-2 flex-wrap'>
                  <Smartphone className='h-5 w-5 text-primary' />
                  {[detailBuyback.brand, detailBuyback.model].filter(Boolean).join(' ') || 'Used Phone'}
                  <span className='font-mono text-sm text-muted-foreground'>{detailBuyback.imei}</span>
                  {detailImei && (
                    <Badge className={`text-xs font-sans ${statusBadgeConfig[detailImei.status]?.color}`}>
                      {statusBadgeConfig[detailImei.status]?.label}
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>

              {detailImei?.condition?.ptaStatus === 'blocked' && (
                <div className='flex items-center gap-2 rounded-md bg-red-50 border border-red-200 p-2.5 text-sm text-red-700'>
                  <ShieldAlert className='h-4 w-4 flex-shrink-0' /> This IMEI is PTA-blocked.
                </div>
              )}

              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-3'>
                  <DetailRow label='Seller' value={detailBuyback.sellerName} />
                  <DetailRow label='Seller Phone' value={detailBuyback.sellerPhone || '—'} />
                  <DetailRow label='Seller CNIC' value={detailBuyback.sellerCNIC || '—'} />
                  <DetailRow label='Color / Storage' value={[detailBuyback.color, detailBuyback.storage].filter(Boolean).join(' · ') || '—'} />
                  <DetailRow label='Bought On' value={formatBusinessDate(detailBuyback.buybackDate)} />
                  <DetailRow label='Payment' value={`${detailBuyback.paymentMethod}${detailBuyback.walletType ? ` (${detailBuyback.walletType})` : ''}`} />
                </div>
                <div className='space-y-3'>
                  <DetailRow label='Grade' value={detailImei?.condition?.grade ? GRADE_OPTIONS.find((g) => g.value === detailImei.condition?.grade)?.hint ?? detailImei.condition.grade : '—'} />
                  <DetailRow label='Screen / Body' value={[detailImei?.condition?.screenCondition, detailImei?.condition?.bodyCondition].filter(Boolean).join(' · ') || '—'} />
                  <DetailRow label='Battery Health' value={detailImei?.condition?.batteryHealthPct != null ? `${detailImei.condition.batteryHealthPct}%` : '—'} />
                  <DetailRow label='PTA Status' value={ptaBadgeConfig[detailImei?.condition?.ptaStatus ?? 'unknown'].label} />
                  <DetailRow label='Agreed Price' value={fmtAmt(detailBuyback.agreedPrice)} />
                  {detailImei?.status === 'sold' && (
                    <DetailRow label='Sold Price' value={fmtAmt(detailImei.salePrice)} />
                  )}
                </div>
              </div>

              {detailImei?.condition?.accessoriesIncluded && detailImei.condition.accessoriesIncluded.length > 0 && (
                <div>
                  <Label className='text-xs text-muted-foreground'>Accessories Included</Label>
                  <div className='flex flex-wrap gap-1.5 mt-1'>
                    {detailImei.condition.accessoriesIncluded.map((a) => (
                      <Badge key={a} variant='secondary' className='text-xs'>{ACCESSORY_OPTIONS.find((o) => o.value === a)?.label ?? a}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {detailImei?.condition?.checklist && (
                <div>
                  <Label className='text-xs text-muted-foreground'>Functional Checklist</Label>
                  <div className='flex flex-wrap gap-1.5 mt-1'>
                    {CHECKLIST_FIELDS.map(({ key, label }) => {
                      const ok = detailImei.condition?.checklist?.[key] ?? true
                      return (
                        <Badge key={key} className={`text-xs ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {ok ? <ShieldCheck className='h-3 w-3 mr-1' /> : <ShieldAlert className='h-3 w-3 mr-1' />}{label}
                        </Badge>
                      )
                    })}
                    {detailImei.condition?.checklist?.waterDamage && (
                      <Badge className='text-xs bg-red-100 text-red-700'><ShieldAlert className='h-3 w-3 mr-1' />Water damage</Badge>
                    )}
                  </div>
                </div>
              )}

              {detailImei?.condition?.photos && detailImei.condition.photos.length > 0 && (
                <div>
                  <Label className='text-xs text-muted-foreground'>Device Photos</Label>
                  <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1'>
                    {detailImei.condition.photos.map((p, i) => (
                      <img key={i} src={p.url} alt={`Device photo ${i + 1}`} className='rounded-md border aspect-square object-cover' />
                    ))}
                  </div>
                </div>
              )}

              {(detailBuyback.sellerIdCardFront?.url || detailBuyback.sellerIdCardBack?.url) && (
                <div>
                  <Label className='text-xs text-muted-foreground'>Seller ID Card</Label>
                  <div className='grid grid-cols-2 gap-2 mt-1'>
                    {detailBuyback.sellerIdCardFront?.url && <img src={detailBuyback.sellerIdCardFront.url} alt='ID front' className='rounded-md border object-cover' />}
                    {detailBuyback.sellerIdCardBack?.url && <img src={detailBuyback.sellerIdCardBack.url} alt='ID back' className='rounded-md border object-cover' />}
                  </div>
                </div>
              )}

              {detailBuyback.notes && (
                <div className='text-sm text-muted-foreground bg-muted/50 rounded p-3'>
                  <strong>Notes:</strong> {detailBuyback.notes}
                </div>
              )}

              {!detailIsSold && (
                <div className='flex items-end gap-2 rounded-md border p-3'>
                  <div className='flex-1 space-y-1'>
                    <Label>Asking / Resale Price (Rs)</Label>
                    <Input type='number' min='0' step='1' value={askingPriceDraft} onChange={(e) => setAskingPriceDraft(e.target.value)} />
                  </div>
                  <Button disabled={isUpdating} onClick={handleSaveAskingPrice}>
                    {isUpdating ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              )}

              <DialogFooter className='sm:justify-between'>
                {!detailIsSold ? (
                  <Button variant='outline' className='text-destructive border-destructive/30 hover:bg-destructive/10' onClick={() => setDeleteConfirm(detailBuyback)}>
                    <Trash2 className='h-4 w-4 mr-1.5' /> Delete
                  </Button>
                ) : <span />}
                <Button variant='outline' onClick={() => setDetailBuyback(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this buyback?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the unit from inventory, reverse the {fmtAmt(deleteConfirm?.agreedPrice)} payment from Cash Book/Wallet,
              and delete its IMEI record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className='bg-destructive hover:bg-destructive/90'>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobilePageShell>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex flex-col'>
      <span className='text-xs text-muted-foreground'>{label}</span>
      <span className='text-sm font-medium'>{value}</span>
    </div>
  )
}
