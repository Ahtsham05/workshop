import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Banknote,
  Coins,
  Eye,
  History,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { MobilePageShell } from '../components/mobile-page-shell'
import { useLanguage } from '@/context/language-context'
import {
  computeTotalFromCounts,
  denominationKey,
  formatMoney,
  getDenominationLabel,
  normalizeCounts,
  PKR_DENOMINATIONS,
  type DenominationCount,
} from '@/lib/pkr-denominations'
import {
  MOBILE_FORM_KEYBOARD_HINT,
  onEnterAdvance,
  useCtrlEnterSubmit,
  useEnterFieldRefs,
} from '@/lib/mobile-form-keyboard'
import {
  useClearCashRegisterMutation,
  useGetCashRegisterHistoryQuery,
  useGetCashRegisterQuery,
  useSaveCashRegisterMutation,
  type CashRegisterSnapshot,
} from '@/stores/cashRegister.api'
import { formatBusinessDateTime } from '@/lib/business-timezone'
import { cn } from '@/lib/utils'
import { CashCountViewDialog } from './cash-count-view-dialog'

export default function CashRegisterPage() {
  const { t } = useLanguage()
  const { data, isLoading, refetch } = useGetCashRegisterQuery()
  const [saveRegister, { isLoading: saving }] = useSaveCashRegisterMutation()
  const [clearRegister, { isLoading: clearing }] = useClearCashRegisterMutation()
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLimit, setHistoryLimit] = useState(10)
  const [viewSnapshot, setViewSnapshot] = useState<CashRegisterSnapshot | null>(null)
  const { data: history } = useGetCashRegisterHistoryQuery({
    page: historyPage,
    limit: historyLimit,
  })

  const [counts, setCounts] = useState<DenominationCount[]>([])
  const [notes, setNotes] = useState('')
  const saveBtnRef = useRef<HTMLButtonElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  const updateQuantity = useCallback((index: number, quantity: number) => {
    setCounts((prev) =>
      prev.map((row, i) =>
        i === index
          ? { ...row, quantity: Math.max(0, Math.floor(Number(quantity) || 0)) }
          : row,
      ),
    )
  }, [])

  const handleSave = useCallback(async () => {
    try {
      await saveRegister({ counts: normalizeCounts(counts), notes: notes.trim() }).unwrap()
      toast.success(t('Cash count saved'))
    } catch (err: any) {
      toast.error(err?.data?.message || t('Failed to save cash count'))
    }
  }, [saveRegister, counts, notes, t])

  const fieldOrder = useMemo(
    () => PKR_DENOMINATIONS.map((d) => denominationKey(d.value, d.kind)),
    [],
  )

  const { register, onEnter, focusFirst } = useEnterFieldRefs(fieldOrder, {
    onLast: () => notesRef.current?.focus(),
    onSubmit: () => {
      if (!saving) void handleSave()
    },
    submitButtonRef: saveBtnRef,
  })

  useCtrlEnterSubmit(() => {
    if (!saving) void handleSave()
  }, saving)

  useEffect(() => {
    if (!data || isLoading) return
    queueMicrotask(() => focusFirst())
  }, [data, isLoading, focusFirst])

  useEffect(() => {
    if (!data) return
    setCounts(normalizeCounts(data.counts))
    setNotes(data.notes || '')
  }, [data])

  const physicalTotal = useMemo(() => computeTotalFromCounts(counts), [counts])
  const expectedCash = data?.expectedCashAmount ?? 0
  const variance = physicalTotal - expectedCash

  const handleClear = async () => {
    try {
      const result = await clearRegister().unwrap()
      setCounts(normalizeCounts(result.counts))
      setNotes('')
      toast.success(t('All counts cleared'))
    } catch (err: any) {
      toast.error(err?.data?.message || t('Failed to clear counts'))
    }
  }

  const noteRows = counts.filter((row) => row.kind === 'note')
  const coinRows = counts.filter((row) => row.kind === 'coin')

  const renderDenominationRow = (row: DenominationCount) => {
    const lineTotal = row.value * row.quantity
    const globalIndex = counts.findIndex(
      (item) => item.value === row.value && item.kind === row.kind,
    )
    const fieldKey = denominationKey(row.value, row.kind)

    return (
      <div
        key={`${row.kind}-${row.value}`}
        className='flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3'
      >
        <div className='flex min-w-[140px] flex-1 items-center gap-2'>
          {row.kind === 'note' ? (
            <Banknote className='h-4 w-4 text-emerald-600' />
          ) : (
            <Coins className='h-4 w-4 text-amber-600' />
          )}
          <div>
            <p className='text-sm font-semibold'>{getDenominationLabel(row.value, row.kind)}</p>
            <p className='text-xs text-muted-foreground'>
              {formatMoney(row.value)} each
            </p>
          </div>
        </div>

        <div className='flex items-center overflow-hidden rounded-md border bg-background'>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='h-8 w-8 rounded-none border-r p-0'
            onClick={() => updateQuantity(globalIndex, row.quantity - 1)}
          >
            <Minus className='h-3.5 w-3.5' />
          </Button>
          <Input
            ref={register(fieldKey)}
            type='number'
            min={0}
            step={1}
            value={row.quantity}
            onChange={(e) => updateQuantity(globalIndex, Number(e.target.value))}
            onKeyDown={onEnter(fieldKey)}
            onFocus={(e) => e.target.select()}
            className='h-8 w-16 border-0 text-center text-sm font-semibold focus-visible:ring-0'
          />
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='h-8 w-8 rounded-none border-l p-0'
            onClick={() => updateQuantity(globalIndex, row.quantity + 1)}
          >
            <Plus className='h-3.5 w-3.5' />
          </Button>
        </div>

        <p className='min-w-[100px] text-right text-sm font-bold tabular-nums'>
          {formatMoney(lineTotal)}
        </p>
      </div>
    )
  }

  return (
    <MobilePageShell
      title={t('Track Cash')}
      description={`${t('Count notes and coins in your cash drawer and compare with system cash balance.')} · ${MOBILE_FORM_KEYBOARD_HINT}`}
    >
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard
          title={t('Physical Cash')}
          value={physicalTotal}
          icon={<Wallet className='h-4 w-4' />}
          valuePrefix='Rs '
          description={t('Total from your count')}
          tone='cyan'
        />
        <StatCard
          title={t('Expected Cash')}
          value={expectedCash}
          icon={<Banknote className='h-4 w-4' />}
          valuePrefix='Rs '
          description={t('Same as Cash Book cash in hand')}
          tone='slate'
        />
        <StatCard
          title={t('Variance')}
          value={Math.abs(variance)}
          icon={<RefreshCw className='h-4 w-4' />}
          valuePrefix={variance >= 0 ? '+Rs ' : '-Rs '}
          description={
            variance === 0
              ? t('Matches system balance')
              : variance > 0
                ? t('You have more cash than system')
                : t('You have less cash than system')
          }
          tone={variance === 0 ? 'emerald' : variance > 0 ? 'amber' : 'rose'}
        />
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
              <History className='h-4 w-4' />
              {t('Last Count')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-lg font-semibold'>
              {data?.lastCountedAt ? formatBusinessDateTime(data.lastCountedAt) : t('Never')}
            </p>
            <p className='mt-1 text-xs text-muted-foreground'>{t('When counts were last saved')}</p>
          </CardContent>
        </Card>
      </div>

      <Card className='mt-6'>
        <CardHeader className='flex flex-row items-center justify-between gap-3'>
          <CardTitle>{t('Count Notes & Coins')}</CardTitle>
          <div className='flex flex-wrap gap-2'>
            <Button type='button' variant='outline' size='sm' onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
              {t('Refresh')}
            </Button>
            <Button type='button' variant='outline' size='sm' onClick={handleClear} disabled={clearing}>
              {clearing ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
              {t('Clear All')}
            </Button>
            <Button ref={saveBtnRef} type='button' size='sm' onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Save className='mr-2 h-4 w-4' />}
              {t('Save Count')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className='space-y-6'>
          {isLoading ? (
            <div className='flex items-center justify-center py-12 text-muted-foreground'>
              <Loader2 className='mr-2 h-5 w-5 animate-spin' />
              {t('Loading...')}
            </div>
          ) : (
            <>
              <div className='space-y-3'>
                <div className='flex items-center gap-2'>
                  <Badge variant='secondary'>{t('Notes')}</Badge>
                  <span className='text-xs text-muted-foreground'>
                    {t('Enter how many notes of each value you have')}
                  </span>
                </div>
                <div className='space-y-2'>
                  {noteRows.map((row) => renderDenominationRow(row))}
                </div>
              </div>

              <Separator />

              <div className='space-y-3'>
                <div className='flex items-center gap-2'>
                  <Badge variant='outline'>{t('Coins')}</Badge>
                  <span className='text-xs text-muted-foreground'>
                    {t('Enter coin quantities if you keep coins in the drawer')}
                  </span>
                </div>
                <div className='space-y-2'>
                  {coinRows.map((row) => renderDenominationRow(row))}
                </div>
              </div>

              <div className='rounded-lg border bg-muted/40 p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <span className='font-medium'>{t('Counted total')}</span>
                  <span className='text-xl font-bold tabular-nums'>{formatMoney(physicalTotal)}</span>
                </div>
                <div className='mt-2 flex flex-wrap items-center justify-between gap-2 text-sm'>
                  <span className='text-muted-foreground'>{t('Expected from cash book')}</span>
                  <span className='font-medium tabular-nums'>{formatMoney(expectedCash)}</span>
                </div>
                <Separator className='my-3' />
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <span className='font-semibold'>{t('Difference')}</span>
                  <span
                    className={cn(
                      'text-lg font-bold tabular-nums',
                      variance === 0 && 'text-emerald-600',
                      variance > 0 && 'text-amber-600',
                      variance < 0 && 'text-red-600',
                    )}
                  >
                    {variance >= 0 ? '+' : '-'}
                    {formatMoney(Math.abs(variance))}
                  </span>
                </div>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='cash-register-notes'>{t('Notes')}</Label>
                <Textarea
                  ref={notesRef}
                  id='cash-register-notes'
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={(e) =>
                    onEnterAdvance(e, () => {
                      if (!saving) void handleSave()
                    })
                  }
                  placeholder={t('Optional notes about this count (shift, drawer, etc.)')}
                  rows={2}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className='mt-6'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <History className='h-5 w-5' />
            {t('Count History')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Date')}</TableHead>
                <TableHead>{t('Counted')}</TableHead>
                <TableHead>{t('Expected')}</TableHead>
                <TableHead>{t('Variance')}</TableHead>
                <TableHead>{t('Notes')}</TableHead>
                <TableHead className='text-right'>{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history?.results ?? []).map((snap) => {
                const countedAt = snap.createdAt || (snap as { updatedAt?: string }).updatedAt
                return (
                <TableRow key={snap.id || snap._id}>
                  <TableCell>
                    {countedAt ? formatBusinessDateTime(countedAt) : '—'}
                  </TableCell>
                  <TableCell className='font-medium tabular-nums'>
                    {formatMoney(snap.totalAmount)}
                  </TableCell>
                  <TableCell className='tabular-nums'>{formatMoney(snap.expectedCashAmount)}</TableCell>
                  <TableCell
                    className={cn(
                      'font-medium tabular-nums',
                      snap.variance === 0 && 'text-emerald-600',
                      snap.variance > 0 && 'text-amber-600',
                      snap.variance < 0 && 'text-red-600',
                    )}
                  >
                    {snap.variance >= 0 ? '+' : '-'}
                    {formatMoney(Math.abs(snap.variance))}
                  </TableCell>
                  <TableCell className='max-w-[220px] truncate'>{snap.notes || '-'}</TableCell>
                  <TableCell className='text-right'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      className='gap-1.5'
                      onClick={() => setViewSnapshot(snap)}
                    >
                      <Eye className='h-4 w-4' />
                      {t('view')}
                    </Button>
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <SimplePagination
            currentPage={historyPage}
            totalPages={history?.totalPages ?? 1}
            totalResults={history?.totalResults}
            limit={historyLimit}
            onPageChange={setHistoryPage}
            onLimitChange={(l) => {
              setHistoryLimit(l)
              setHistoryPage(1)
            }}
            className='mt-3'
          />
        </CardContent>
      </Card>

      <CashCountViewDialog
        snapshot={viewSnapshot}
        open={viewSnapshot != null}
        onOpenChange={(open) => {
          if (!open) setViewSnapshot(null)
        }}
      />
    </MobilePageShell>
  )
}
