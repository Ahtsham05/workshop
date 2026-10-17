import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { AlarmClock, Inbox, PackageCheck, Plus, Search, ShieldCheck, Truck, Warehouse } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Can } from '@/context/permission-context'
import { useLanguage } from '@/context/language-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { usePersistedPageSize } from '@/hooks/use-persisted-page-size'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { useGetWarrantyClaimStatsQuery, useGetWarrantyClaimsQuery } from '@/stores/warrantyClaim.api'
import { ClaimDetailSheet } from './components/claim-detail-sheet'
import { NewClaimDialog } from './components/new-claim-dialog'
import { COVER_META, STATUS_META } from './lib/claim-meta'

type View = 'open' | 'received' | 'sent' | 'overdue' | 'returned' | 'closed' | 'all'
const VIEW_STATUS: Record<View, string | undefined> = {
  open: 'received,sent,returned',
  received: 'received',
  sent: 'sent',
  overdue: undefined,
  returned: 'returned',
  closed: 'closed,cancelled',
  all: undefined,
}
const DAY = 24 * 60 * 60 * 1000

/**
 * Warranty Claims — faulty units sent back to the supplier/brand, and brought back:
 * repaired or replaced units are revived into stock (or handed back to the customer).
 */
export default function WarrantyClaims() {
  const { t } = useLanguage()
  const navigate = useNavigate({ from: '/warranty-claims' })
  const { claim: claimParam } = useSearch({ from: '/_authenticated/warranty-claims/' })
  const [view, setView] = useState<View>('open')
  const [type, setType] = useState<'all' | 'customer' | 'stock'>('all')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput, 300)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = usePersistedPageSize('warranty-claims', 20)
  const [newOpen, setNewOpen] = useState(false)
  const openClaim = (id: string | null) => navigate({ search: (prev) => ({ ...prev, claim: id ?? undefined }) })

  const { data: stats } = useGetWarrantyClaimStatsQuery()
  const { data, isFetching, isLoading } = useGetWarrantyClaimsQuery({
    page,
    limit,
    ...(VIEW_STATUS[view] ? { status: VIEW_STATUS[view] } : {}),
    ...(view === 'overdue' ? { overdue: true } : {}),
    ...(type !== 'all' ? { type } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  })
  const rows = data?.results ?? []

  const cards: { view: View; label: string; value: number | undefined; icon: LucideIcon; tone: string }[] = [
    { view: 'received', label: 'Waiting to send', value: stats?.received, icon: Inbox, tone: 'text-sky-600 dark:text-sky-400' },
    { view: 'sent', label: 'At supplier', value: stats?.sent, icon: Truck, tone: 'text-amber-600 dark:text-amber-400' },
    { view: 'overdue', label: 'Overdue', value: stats?.overdue, icon: AlarmClock, tone: 'text-red-600 dark:text-red-400' },
    { view: 'returned', label: 'Back — to hand over', value: stats?.returned, icon: PackageCheck, tone: 'text-violet-600 dark:text-violet-400' },
  ]

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex items-start gap-2'>
          <ShieldCheck className='mt-1 h-6 w-6 text-primary' />
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>{t('Warranty Claims')}</h1>
            <p className='text-sm text-muted-foreground'>
              {t('Send faulty units back under warranty and bring them back — repaired or replaced units go back into stock or to the customer.')}
            </p>
          </div>
        </div>
        <Can anyPermissions={['manageWarrantyClaims', 'manageImeiTracking', 'editProducts']}>
          <Button onClick={() => setNewOpen(true)} className='gap-1.5 max-sm:w-full'>
            <Plus className='h-4 w-4' />
            {t('New claim')}
          </Button>
        </Can>
      </div>

      <div className='grid grid-cols-2 gap-3 lg:grid-cols-5'>
        {cards.map((c) => (
          <button
            key={c.view}
            type='button'
            onClick={() => {
              setView(c.view)
              setPage(1)
            }}
            aria-pressed={view === c.view}
            className={cn('rounded-xl border bg-card p-3 text-left hover:bg-accent/50', view === c.view && 'border-primary ring-1 ring-primary')}
          >
            <div className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
              <c.icon className={cn('h-4 w-4', c.tone)} />
              {t(c.label)}
            </div>
            <p className='mt-1 text-2xl font-semibold tabular-nums'>{c.value ?? '…'}</p>
          </button>
        ))}
        <div className='col-span-2 rounded-xl border bg-card p-3 lg:col-span-1'>
          <div className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
            <Warehouse className='h-4 w-4 text-slate-500' />
            {t('Our units away')}
          </div>
          <p className='mt-1 text-2xl font-semibold tabular-nums'>{stats?.shopUnitsAway ?? '…'}</p>
          <p className='text-[11px] text-muted-foreground'>{t('Out of stock until they come back')}</p>
        </div>
      </div>

      <Card>
        <CardContent className='space-y-3 pt-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='relative min-w-[200px] flex-1'>
              <Search className='absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value)
                  setPage(1)
                }}
                placeholder={t('Claim no., serial, product, customer, supplier…')}
                className='h-9 pl-8'
              />
            </div>
            <Select value={view} onValueChange={(v) => { setView(v as View); setPage(1) }}>
              <SelectTrigger className='h-9 w-[170px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='open'>{t('Open claims')}</SelectItem>
                <SelectItem value='received'>{t('Waiting to send')}</SelectItem>
                <SelectItem value='sent'>{t('At supplier')}</SelectItem>
                <SelectItem value='overdue'>{t('Overdue')}</SelectItem>
                <SelectItem value='returned'>{t('Back — to hand over')}</SelectItem>
                <SelectItem value='closed'>{t('Closed / cancelled')}</SelectItem>
                <SelectItem value='all'>{t('All claims')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={(v) => { setType(v as typeof type); setPage(1) }}>
              <SelectTrigger className='h-9 w-[150px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All types')}</SelectItem>
                <SelectItem value='customer'>{t('Customer claims')}</SelectItem>
                <SelectItem value='stock'>{t('Our stock')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='overflow-x-auto rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Claim')}</TableHead>
                  <TableHead>{t('Product')}</TableHead>
                  <TableHead>{t('Customer')}</TableHead>
                  <TableHead>{t('Supplier')}</TableHead>
                  <TableHead>{t('Warranty')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className='text-right'>{t('Days')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className='h-6 w-full' />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className='h-24 text-center text-muted-foreground'>
                      {t('No warranty claims here')}
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((c) => {
                  const overdue = c.status === 'sent' && c.expectedBackAt && new Date(c.expectedBackAt).getTime() < Date.now()
                  const days = Math.max(0, Math.floor(((c.closedAt ? new Date(c.closedAt).getTime() : Date.now()) - new Date(c.receivedAt).getTime()) / DAY))
                  return (
                    <TableRow key={c.id} className={cn('cursor-pointer', isFetching && 'opacity-70')} onClick={() => openClaim(c.id)}>
                      <TableCell className='whitespace-nowrap'>
                        <div className='font-medium'>{c.claimNumber}</div>
                        <div className='text-xs text-muted-foreground'>{formatAppDate(c.receivedAt)}</div>
                      </TableCell>
                      <TableCell>
                        <div className='max-w-[220px] truncate font-medium'>{c.productName}</div>
                        <div className='flex flex-wrap items-center gap-1 text-xs text-muted-foreground'>
                          {c.serial && <span className='font-mono'>{c.serial}</span>}
                          {c.quantity > 1 && <span>× {c.quantity}</span>}
                          <Badge variant='outline' className='text-[10px]'>{c.type === 'customer' ? t('Customer') : t('Our stock')}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className='text-sm'>
                        {c.type === 'customer' ? (
                          <>
                            <div className='max-w-[160px] truncate'>{c.customer?.name || '—'}</div>
                            <div className='text-xs text-muted-foreground'>{c.customer?.phone}</div>
                          </>
                        ) : (
                          <span className='text-muted-foreground'>—</span>
                        )}
                      </TableCell>
                      <TableCell className='max-w-[160px] truncate text-sm'>{c.supplier?.name || <span className='text-muted-foreground'>—</span>}</TableCell>
                      <TableCell>
                        <Badge variant='outline' className={cn('text-[10px]', COVER_META[c.warranty.status].className)}>{t(COVER_META[c.warranty.status].label)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-wrap items-center gap-1'>
                          <Badge variant='outline' className={STATUS_META[c.status].className}>{t(STATUS_META[c.status].label)}</Badge>
                          {overdue && <Badge variant='destructive' className='text-[10px]'>{t('Overdue')}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{days}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <SimplePagination
            currentPage={page}
            totalPages={data?.totalPages || 1}
            totalResults={data?.totalResults}
            limit={limit}
            onLimitChange={(n) => {
              setLimit(n)
              setPage(1)
            }}
            onPageChange={setPage}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </CardContent>
      </Card>

      <NewClaimDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(c) => openClaim(c.id)} onOpenExisting={(id) => { setNewOpen(false); openClaim(id) }} />
      <ClaimDetailSheet claimId={claimParam ?? null} onClose={() => openClaim(null)} />
    </div>
  )
}
