import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useSearch } from '@tanstack/react-router'
import {
  ClipboardEdit,
  Plus,
  Undo2,
  AlertTriangle,
  ShieldAlert,
  TrendingDown,
  ListChecks,
} from 'lucide-react'

import {
  useGetAdjustmentsQuery,
  useGetAdjustmentStatsQuery,
  useReverseAdjustmentMutation,
  type AdjustmentDirection,
  type AdjustmentStatus,
  type AdjustmentType,
  type StockAdjustment,
} from '@/stores/stockAdjustment.api'
import { useLanguage } from '@/context/language-context'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { StatCard } from '@/features/dashboard/components/stat-card'

import { AdjustmentTypeBadge } from './components/adjustment-type-badge'
import { CreateAdjustmentDialog, type AdjustmentPrefill } from './components/create-adjustment-dialog'
import { ADJUSTMENT_TYPE_ORDER, ADJUSTMENT_TYPE_META } from './lib/adjustment-types'

const LIMIT = 15

function userName(ref: StockAdjustment['createdBy']): string {
  if (!ref) return '—'
  return typeof ref === 'string' ? ref : ref.name || '—'
}

export default function StockAdjustments() {
  const { t } = useLanguage()
  const search = useSearch({ strict: false }) as { productId?: string; productName?: string }

  const [typeFilter, setTypeFilter] = useState<AdjustmentType | 'all'>('all')
  const [directionFilter, setDirectionFilter] = useState<AdjustmentDirection | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<AdjustmentStatus | 'all'>('all')
  const [searchText, setSearchText] = useState('')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [prefill, setPrefill] = useState<AdjustmentPrefill | null>(null)
  const [reversing, setReversing] = useState<StockAdjustment | null>(null)

  useEffect(() => {
    if (search?.productId) {
      setPrefill({ productId: search.productId, productName: search.productName })
      setDialogOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.productId])

  const { data: stats } = useGetAdjustmentStatsQuery()
  const { data, isFetching } = useGetAdjustmentsQuery({
    page,
    limit: LIMIT,
    ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
    ...(directionFilter !== 'all' ? { direction: directionFilter } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(searchText.trim() ? { search: searchText.trim() } : {}),
  })

  const [reverseAdjustment, { isLoading: reversingBusy }] = useReverseAdjustmentMutation()

  const adjustments = data?.results || []

  const openCreateDialog = () => {
    setPrefill(null)
    setDialogOpen(true)
  }

  const confirmReverse = async () => {
    if (!reversing) return
    try {
      await reverseAdjustment(reversing.id).unwrap()
      toast.success(t('Adjustment reversed — stock restored'))
      setReversing(null)
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || t('Failed to reverse adjustment'))
    }
  }

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <ClipboardEdit className='h-6 w-6 text-primary' />
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>{t('Stock Adjustments')}</h1>
            <p className='text-sm text-muted-foreground'>
              {t('Record damage, theft, expiry write-offs, and manual stock corrections')}
            </p>
          </div>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className='mr-2 h-4 w-4' />
          {t('New Adjustment')}
        </Button>
      </div>

      <div className='grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
        <StatCard
          title={t('Damage')}
          value={stats?.byType.damage.value ?? 0}
          valuePrefix='Rs '
          icon={<AlertTriangle />}
          tone='rose'
          description={t('{{count}} report(s)').replace('{{count}}', String(stats?.byType.damage.count ?? 0))}
        />
        <StatCard
          title={t('Theft / Stolen')}
          value={stats?.byType.theft.value ?? 0}
          valuePrefix='Rs '
          icon={<ShieldAlert />}
          tone='orange'
          description={t('{{count}} report(s)').replace('{{count}}', String(stats?.byType.theft.count ?? 0))}
        />
        <StatCard
          title={t('Expired / Lost')}
          value={(stats?.byType.expired.value ?? 0) + (stats?.byType.lost.value ?? 0)}
          valuePrefix='Rs '
          icon={<TrendingDown />}
          tone='amber'
          description={t('{{count}} report(s)').replace(
            '{{count}}',
            String((stats?.byType.expired.count ?? 0) + (stats?.byType.lost.count ?? 0))
          )}
        />
        <StatCard
          title={t('Total Shrinkage Value')}
          value={stats?.totalLossValue ?? 0}
          valuePrefix='Rs '
          icon={<TrendingDown />}
          tone='indigo'
          description={t('Damage + theft + expired + lost')}
        />
        <StatCard
          title={t('Total Adjustments')}
          value={stats?.totalAdjustments ?? 0}
          icon={<ListChecks />}
          tone='slate'
          description={t('All reason types')}
        />
      </div>

      <Card>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3 space-y-0'>
          <div>
            <CardTitle className='text-base'>{t('Adjustment History')}</CardTitle>
            <CardDescription>{t('Every stock change and who recorded it')}</CardDescription>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Input
              placeholder={t('Search product...')}
              className='h-9 w-40'
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value)
                setPage(1)
              }}
            />
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as typeof typeFilter); setPage(1) }}>
              <SelectTrigger className='h-9 w-40'>
                <SelectValue placeholder={t('Type')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All types')}</SelectItem>
                {ADJUSTMENT_TYPE_ORDER.map((v) => (
                  <SelectItem key={v} value={v}>
                    {t(ADJUSTMENT_TYPE_META[v].label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={directionFilter} onValueChange={(v) => { setDirectionFilter(v as typeof directionFilter); setPage(1) }}>
              <SelectTrigger className='h-9 w-32'>
                <SelectValue placeholder={t('Direction')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All')}</SelectItem>
                <SelectItem value='increase'>{t('Increase')}</SelectItem>
                <SelectItem value='decrease'>{t('Decrease')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1) }}>
              <SelectTrigger className='h-9 w-32'>
                <SelectValue placeholder={t('Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All')}</SelectItem>
                <SelectItem value='completed'>{t('Completed')}</SelectItem>
                <SelectItem value='reversed'>{t('Reversed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isFetching ? (
            <div className='space-y-2'>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className='h-12 w-full' />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Product')}</TableHead>
                  <TableHead>{t('Type')}</TableHead>
                  <TableHead className='text-right'>{t('Qty')}</TableHead>
                  <TableHead className='text-right'>{t('Stock')}</TableHead>
                  <TableHead className='text-right'>{t('Value')}</TableHead>
                  <TableHead>{t('By')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((adj) => (
                  <TableRow key={adj.id}>
                    <TableCell className='text-sm text-muted-foreground whitespace-nowrap'>
                      {new Date(adj.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className='font-medium max-w-[200px] truncate' title={adj.productName}>
                      {adj.productName}
                      {adj.reason && (
                        <p className='text-xs font-normal text-muted-foreground truncate' title={adj.reason}>
                          {adj.reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <AdjustmentTypeBadge type={adj.type} />
                    </TableCell>
                    <TableCell className={`text-right font-medium ${adj.direction === 'increase' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {adj.direction === 'increase' ? '+' : '−'}
                      {adj.quantity}
                    </TableCell>
                    <TableCell className='text-right text-sm text-muted-foreground whitespace-nowrap'>
                      {adj.previousQuantity} → {adj.newQuantity}
                    </TableCell>
                    <TableCell className='text-right text-sm whitespace-nowrap'>
                      {adj.totalValue ? `Rs ${adj.totalValue.toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>{userName(adj.createdBy)}</TableCell>
                    <TableCell>
                      {adj.status === 'reversed' ? (
                        <Badge variant='outline' className='bg-slate-50 text-slate-500 border-slate-200'>
                          {t('Reversed')}
                        </Badge>
                      ) : (
                        <Badge variant='outline' className='bg-emerald-50 text-emerald-700 border-emerald-200'>
                          {t('Completed')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-right'>
                      {adj.status === 'completed' && !adj.reversalOf && (
                        <Button size='sm' variant='ghost' onClick={() => setReversing(adj)} disabled={reversingBusy}>
                          <Undo2 className='mr-1 h-3.5 w-3.5' />
                          {t('Reverse')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {adjustments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className='text-center text-muted-foreground'>
                      {t('No stock adjustments found')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          <SimplePagination
            currentPage={page}
            totalPages={data?.totalPages || 1}
            totalResults={data?.totalResults}
            limit={LIMIT}
            onPageChange={setPage}
            className='mt-3'
          />
        </CardContent>
      </Card>

      <CreateAdjustmentDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setPrefill(null)
        }}
        prefill={prefill}
      />

      <AlertDialog open={!!reversing} onOpenChange={(o) => !o && setReversing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Reverse this adjustment?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This creates an opposite entry that restores stock for')} <strong>{reversing?.productName}</strong>{' '}
              {t('to its state before this adjustment. The original entry is kept for the audit trail.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReverse} disabled={reversingBusy}>
              {reversingBusy ? t('Reversing...') : t('Reverse')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
