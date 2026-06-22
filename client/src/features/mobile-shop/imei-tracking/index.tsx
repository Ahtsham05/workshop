import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  ShieldCheck, Search, X, ChevronRight, ShieldAlert, ShieldX, PackageCheck,
  Smartphone, Clock, History as HistoryIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { MobilePageShell } from '@/features/mobile-shop/components/mobile-page-shell'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import {
  useGetImeisQuery,
  useGetImeiByIdQuery,
  useGetImeiStatsQuery,
  useMarkImeiLostOrStolenMutation,
  type ImeiRecord,
  type ImeiStatus,
} from '@/stores/imei.api'

const statusConfig: Record<ImeiStatus, { label: string; color: string }> = {
  in_stock: { label: 'In Stock', color: 'bg-blue-100 text-blue-700' },
  sold: { label: 'Sold', color: 'bg-green-100 text-green-700' },
  returned: { label: 'Returned', color: 'bg-amber-100 text-amber-700' },
  scrapped: { label: 'Scrapped', color: 'bg-gray-100 text-gray-600' },
  lost: { label: 'Lost', color: 'bg-orange-100 text-orange-700' },
  stolen: { label: 'Stolen', color: 'bg-red-100 text-red-700' },
}

function warrantyBadge(record: ImeiRecord) {
  if (!record.warrantyEndDate) return <span className='text-xs text-muted-foreground'>—</span>
  const end = new Date(record.warrantyEndDate)
  const now = new Date()
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return <Badge className='text-xs bg-gray-100 text-gray-600'>Expired</Badge>
  if (daysLeft <= 30) return <Badge className='text-xs bg-orange-100 text-orange-700'>Expiring in {daysLeft}d</Badge>
  return <Badge className='text-xs bg-green-100 text-green-700'>Active till {format(end, 'dd MMM yyyy')}</Badge>
}

type QuickFilter = 'lost_stolen' | 'warranty_expiring' | null

export default function ImeiTrackingPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 400)
  const [activeTab, setActiveTab] = useState<'all' | ImeiStatus>('all')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null)
  const [page, setPage] = useState(1)
  const [limit] = useState(15)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [lostStolenTarget, setLostStolenTarget] = useState<{ id: string; status: 'lost' | 'stolen' } | null>(null)
  const [lostStolenReason, setLostStolenReason] = useState('')

  const goToTab = (tab: 'all' | ImeiStatus) => {
    setQuickFilter(null)
    setActiveTab(tab)
    setPage(1)
  }
  const goToQuickFilter = (filter: QuickFilter) => {
    setActiveTab('all')
    setQuickFilter(filter)
    setPage(1)
  }

  const { data: stats, isLoading: isStatsLoading } = useGetImeiStatsQuery()
  const { data: listData, isLoading: isListLoading } = useGetImeisQuery({
    search: debouncedSearch || undefined,
    status: quickFilter === 'lost_stolen' ? 'lost,stolen' : activeTab !== 'all' ? activeTab : undefined,
    warrantyStatus: quickFilter === 'warranty_expiring' ? 'expiring_soon' : undefined,
    page,
    limit,
  })
  const { data: detailRecord } = useGetImeiByIdQuery(detailId!, { skip: !detailId })
  const [markLostOrStolen, { isLoading: isMarking }] = useMarkImeiLostOrStolenMutation()

  const records = listData?.results ?? []

  const history = useMemo(
    () => [...(detailRecord?.history ?? [])].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [detailRecord],
  )

  const handleConfirmLostStolen = async () => {
    if (!lostStolenTarget) return
    try {
      await markLostOrStolen({
        id: lostStolenTarget.id,
        status: lostStolenTarget.status,
        reason: lostStolenReason.trim() || undefined,
      }).unwrap()
      toast.success(`Device marked as ${lostStolenTarget.status}`)
      setLostStolenTarget(null)
      setLostStolenReason('')
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Failed to update status')
    }
  }

  return (
    <MobilePageShell title='IMEI Tracking' description='Search any IMEI, track its full history, warranty status, and report lost/stolen devices'>

      {/* ── Stats ── */}
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6'>
        <div className={cn('rounded-xl', !quickFilter && activeTab === 'in_stock' && 'ring-2 ring-sky-500 ring-offset-2')}>
          <StatCard
            title='In Stock'
            value={stats?.in_stock ?? 0}
            description='Ready to sell'
            icon={<PackageCheck />}
            tone='sky'
            isLoading={isStatsLoading}
            onClick={() => goToTab('in_stock')}
          />
        </div>
        <div className={cn('rounded-xl', !quickFilter && activeTab === 'sold' && 'ring-2 ring-emerald-500 ring-offset-2')}>
          <StatCard
            title='Sold'
            value={stats?.sold ?? 0}
            description='With a customer'
            icon={<Smartphone />}
            tone='emerald'
            isLoading={isStatsLoading}
            onClick={() => goToTab('sold')}
          />
        </div>
        <div className={cn('rounded-xl', quickFilter === 'warranty_expiring' && 'ring-2 ring-amber-500 ring-offset-2')}>
          <StatCard
            title='Warranty Expiring Soon'
            value={stats?.warrantyExpiringSoon ?? 0}
            description='Within next 30 days'
            icon={<Clock />}
            tone='amber'
            isLoading={isStatsLoading}
            onClick={() => goToQuickFilter('warranty_expiring')}
          />
        </div>
        <div className={cn('rounded-xl', quickFilter === 'lost_stolen' && 'ring-2 ring-rose-500 ring-offset-2')}>
          <StatCard
            title='Lost / Stolen'
            value={(stats?.lost ?? 0) + (stats?.stolen ?? 0)}
            description='Needs follow-up'
            icon={<ShieldAlert />}
            tone='rose'
            isLoading={isStatsLoading}
            onClick={() => goToQuickFilter('lost_stolen')}
          />
        </div>
      </div>

      {(quickFilter || activeTab !== 'all') && (
        <div className='mb-4 flex items-center gap-2'>
          <span className='text-xs text-muted-foreground'>Showing:</span>
          <Badge variant='secondary' className='gap-1.5 pr-1'>
            {quickFilter === 'lost_stolen' ? 'Lost / Stolen devices' : quickFilter === 'warranty_expiring' ? 'Warranty expiring within 30 days' : statusConfig[activeTab as ImeiStatus]?.label}
            <button onClick={() => goToTab('all')} className='ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5'>
              <X className='h-3 w-3' />
            </button>
          </Badge>
        </div>
      )}

      {/* ── List ── */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='flex items-center gap-2'>
            <ShieldCheck className='h-5 w-5 text-primary' /> IMEI Records
          </CardTitle>
          <div className='relative mt-3'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search by IMEI, brand, model, customer name/phone/CNIC...'
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className='pl-9'
            />
            {search && (
              <button onClick={() => setSearch('')} className='absolute right-3 top-1/2 -translate-y-1/2'>
                <X className='h-4 w-4 text-muted-foreground hover:text-foreground' />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={quickFilter ? '' : activeTab} onValueChange={(v) => goToTab(v as 'all' | ImeiStatus)} className='mb-4'>
            <TabsList className='flex-wrap h-auto gap-1'>
              <TabsTrigger value='all'>All</TabsTrigger>
              <TabsTrigger value='in_stock'>In Stock</TabsTrigger>
              <TabsTrigger value='sold'>Sold</TabsTrigger>
              <TabsTrigger value='returned'>Returned</TabsTrigger>
              <TabsTrigger value='lost'>Lost</TabsTrigger>
              <TabsTrigger value='stolen'>Stolen</TabsTrigger>
              <TabsTrigger value='scrapped'>Scrapped</TabsTrigger>
            </TabsList>
          </Tabs>

          {isListLoading ? (
            <div className='space-y-3'>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className='h-14 rounded-lg' />)}
            </div>
          ) : records.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
              <ShieldCheck className='h-12 w-12 mb-3 opacity-30' />
              <p className='text-base font-medium'>No IMEI records found</p>
              <p className='text-sm'>Try a different search or filter</p>
            </div>
          ) : (
            <>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IMEI</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Warranty</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id} className='cursor-pointer hover:bg-muted/30' onClick={() => setDetailId(record.id)}>
                        <TableCell className='font-mono text-xs'>{record.imei}</TableCell>
                        <TableCell className='text-sm'>
                          <div className='font-medium'>{record.productName || '—'}</div>
                          <div className='text-xs text-muted-foreground'>{[record.brand, record.model, record.color].filter(Boolean).join(' · ')}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${statusConfig[record.status].color}`}>{statusConfig[record.status].label}</Badge>
                        </TableCell>
                        <TableCell className='text-sm'>
                          {record.customerName ? (
                            <div>
                              <div>{record.customerName}</div>
                              <div className='text-xs text-muted-foreground'>{record.customerPhone}</div>
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{warrantyBadge(record)}</TableCell>
                        <TableCell>
                          <Button size='icon' variant='ghost' className='h-8 w-8'>
                            <ChevronRight className='h-4 w-4' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <SimplePagination
                currentPage={page}
                totalPages={listData?.totalPages ?? 1}
                totalResults={listData?.totalResults}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={() => {}}
                className='mt-4'
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Detail Dialog ── */}
      <Dialog open={!!detailId} onOpenChange={(open) => { if (!open) setDetailId(null) }}>
        <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
          {detailRecord ? (
            <>
              <DialogHeader>
                <DialogTitle className='flex items-center gap-2 font-mono'>
                  <Smartphone className='h-5 w-5 text-primary' /> {detailRecord.imei}
                  <Badge className={`text-xs font-sans ${statusConfig[detailRecord.status].color}`}>{statusConfig[detailRecord.status].label}</Badge>
                </DialogTitle>
              </DialogHeader>

              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-3'>
                  <DetailRow label='Product' value={detailRecord.productName || '—'} />
                  <DetailRow label='Brand / Model' value={[detailRecord.brand, detailRecord.model].filter(Boolean).join(' · ') || '—'} />
                  <DetailRow label='Color / Storage' value={[detailRecord.color, detailRecord.storage].filter(Boolean).join(' · ') || '—'} />
                  <DetailRow label='Supplier' value={detailRecord.supplierName || '—'} />
                  <DetailRow label='Purchase Date' value={detailRecord.purchaseDate ? format(new Date(detailRecord.purchaseDate), 'dd MMM yyyy') : '—'} />
                </div>
                <div className='space-y-3'>
                  <DetailRow label='Customer' value={detailRecord.customerName || '—'} />
                  <DetailRow label='Customer Phone' value={detailRecord.customerPhone || '—'} />
                  <DetailRow label='Sale Date' value={detailRecord.saleDate ? format(new Date(detailRecord.saleDate), 'dd MMM yyyy') : '—'} />
                  <DetailRow label='Warranty' value={detailRecord.warrantyEndDate ? `${detailRecord.warrantyMonths} months · until ${format(new Date(detailRecord.warrantyEndDate), 'dd MMM yyyy')}` : 'No warranty'} />
                  {(detailRecord.status === 'lost' || detailRecord.status === 'stolen') && (
                    <DetailRow label='Reported' value={detailRecord.lostStolenReason || '(no reason given)'} danger />
                  )}
                </div>
              </div>

              {/* Lost/Stolen actions — only while device is sold to a customer */}
              {detailRecord.status === 'sold' && (
                <div className='flex gap-2 flex-wrap'>
                  <Button
                    size='sm' variant='outline' className='text-orange-600 border-orange-200 hover:bg-orange-50'
                    onClick={() => setLostStolenTarget({ id: detailRecord.id, status: 'lost' })}
                  >
                    <ShieldAlert className='h-4 w-4 mr-1' /> Mark as Lost
                  </Button>
                  <Button
                    size='sm' variant='outline' className='text-red-600 border-red-200 hover:bg-red-50'
                    onClick={() => setLostStolenTarget({ id: detailRecord.id, status: 'stolen' })}
                  >
                    <ShieldX className='h-4 w-4 mr-1' /> Mark as Stolen
                  </Button>
                </div>
              )}

              {/* History timeline */}
              <div>
                <h4 className='flex items-center gap-2 text-sm font-semibold mb-2'>
                  <HistoryIcon className='h-4 w-4' /> History
                </h4>
                {history.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>No history recorded.</p>
                ) : (
                  <div className='space-y-2 max-h-64 overflow-y-auto'>
                    {history.map((entry, idx) => (
                      <div key={idx} className='flex items-start gap-3 text-sm rounded-lg bg-muted/40 px-3 py-2'>
                        <Badge className={`text-xs mt-0.5 ${statusConfig[entry.status as ImeiStatus]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                          {statusConfig[entry.status as ImeiStatus]?.label ?? entry.status}
                        </Badge>
                        <div className='flex-1 min-w-0'>
                          {entry.note && <p className='text-foreground'>{entry.note}</p>}
                          <p className='text-xs text-muted-foreground'>{format(new Date(entry.at), 'dd MMM yyyy, hh:mm a')}{entry.byUserName ? ` · ${entry.byUserName}` : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detailRecord.notes && (
                <div className='text-sm text-muted-foreground bg-muted/50 rounded p-3'>
                  <strong>Notes:</strong> {detailRecord.notes}
                </div>
              )}

              <DialogFooter>
                <Button variant='outline' onClick={() => setDetailId(null)}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <div className='py-8 flex justify-center'><Skeleton className='h-48 w-full' /></div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Lost/Stolen Confirm ── */}
      <AlertDialog open={!!lostStolenTarget} onOpenChange={(open) => { if (!open) { setLostStolenTarget(null); setLostStolenReason('') } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark device as {lostStolenTarget?.status}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will record the device as {lostStolenTarget?.status} and add it to the {lostStolenTarget?.status} history. This action is logged and cannot be silently undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-1'>
            <Label>Reason / notes (optional)</Label>
            <Textarea
              value={lostStolenReason}
              onChange={(e) => setLostStolenReason(e.target.value)}
              placeholder='e.g. Customer reported theft on 12 June, FIR filed at...'
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLostStolen} disabled={isMarking} className='bg-red-600 hover:bg-red-700'>
              {isMarking ? 'Saving...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </MobilePageShell>
  )
}

function DetailRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className='flex flex-col'>
      <span className='text-xs text-muted-foreground'>{label}</span>
      <span className={`text-sm font-medium ${danger ? 'text-red-600' : ''}`}>{value}</span>
    </div>
  )
}

