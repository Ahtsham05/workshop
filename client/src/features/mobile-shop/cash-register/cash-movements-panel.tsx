import { AlertTriangle, Loader2, PencilLine } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import {
  formatBusinessDate,
  formatBusinessDateTime,
  toBusinessCalendarDate,
} from '@/lib/business-timezone'
import { formatMoney, formatSignedMoney } from '@/lib/pkr-denominations'
import { cn } from '@/lib/utils'
import type { CashMovementEntry, CashMovementsResponse } from '@/stores/cashRegister.api'

type Props = {
  data?: CashMovementsResponse
  isLoading?: boolean
  emptyLabel: string
}

const signedTone = (value: number) =>
  value === 0 ? 'text-muted-foreground' : value > 0 ? 'text-emerald-600' : 'text-red-600'

/** Typed in on one day but dated another — easy to miss when reconciling a day's count. */
const isDatedOtherDay = (entry: CashMovementEntry) =>
  toBusinessCalendarDate(new Date(entry.date)) !== toBusinessCalendarDate(new Date(entry.createdAt))

/**
 * Every cash line that moved "Expected" between two counts, grouped by module and listed in
 * the order it was recorded — a count that doesn't match can only be explained from here.
 */
export function CashMovementsPanel({ data, isLoading, emptyLabel }: Props) {
  const { t } = useLanguage()

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-8 text-sm text-muted-foreground'>
        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
        {t('Loading...')}
      </div>
    )
  }
  if (!data) return null

  const unexplained = data.unexplainedChange ?? 0

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-3'>
        <div className='rounded-lg border bg-muted/30 p-3'>
          <p className='text-xs text-muted-foreground'>{t('Cash in')}</p>
          <p className='text-lg font-semibold tabular-nums text-emerald-600'>+{formatMoney(data.income)}</p>
        </div>
        <div className='rounded-lg border bg-muted/30 p-3'>
          <p className='text-xs text-muted-foreground'>{t('Cash out')}</p>
          <p className='text-lg font-semibold tabular-nums text-red-600'>-{formatMoney(data.expense)}</p>
        </div>
        <div className='rounded-lg border bg-muted/30 p-3'>
          <p className='text-xs text-muted-foreground'>
            {t('Net change')} · {data.entryCount} {t('entries')}
          </p>
          <p className={cn('text-lg font-semibold tabular-nums', signedTone(data.net))}>
            {formatSignedMoney(data.net)}
          </p>
        </div>
      </div>

      {unexplained !== 0 ? (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>{t('Older entries were changed in this period')}</AlertTitle>
          <AlertDescription>
            {t('Expected cash moved')} {formatSignedMoney(unexplained)}{' '}
            {t('beyond the entries listed below — an entry recorded before this period was edited or deleted during it.')}
          </AlertDescription>
        </Alert>
      ) : null}

      {data.entryCount === 0 && data.editedEntries.length === 0 ? (
        <p className='py-4 text-center text-sm text-muted-foreground'>{emptyLabel}</p>
      ) : null}

      {data.byModule.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Module')}</TableHead>
              <TableHead className='text-right'>{t('Entries')}</TableHead>
              <TableHead className='text-right'>{t('Cash in')}</TableHead>
              <TableHead className='text-right'>{t('Cash out')}</TableHead>
              <TableHead className='text-right'>{t('Net')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.byModule.map((row) => (
              <TableRow key={row.module}>
                <TableCell className='font-medium'>{t(row.module)}</TableCell>
                <TableCell className='text-right tabular-nums'>{row.count}</TableCell>
                <TableCell className='text-right tabular-nums text-emerald-600'>
                  {row.income ? formatMoney(row.income) : '-'}
                </TableCell>
                <TableCell className='text-right tabular-nums text-red-600'>
                  {row.expense ? formatMoney(row.expense) : '-'}
                </TableCell>
                <TableCell className={cn('text-right font-medium tabular-nums', signedTone(row.net))}>
                  {formatSignedMoney(row.net)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {data.entries.length > 0 ? (
        <div className='space-y-2'>
          <p className='text-sm font-medium'>
            {t('Entries in the order they were recorded')}
            {data.truncated ? ` · ${t('showing the latest')} ${data.entries.length} / ${data.entryCount}` : ''}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Recorded at')}</TableHead>
                <TableHead>{t('Module')}</TableHead>
                <TableHead>{t('Description')}</TableHead>
                <TableHead className='text-right'>{t('Cash in')}</TableHead>
                <TableHead className='text-right'>{t('Cash out')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className='whitespace-nowrap'>
                    {formatBusinessDateTime(entry.createdAt)}
                    {isDatedOtherDay(entry) ? (
                      <Badge variant='outline' className='ml-2 border-amber-300 text-amber-700'>
                        {t('Dated')} {formatBusinessDate(entry.date)}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>{t(entry.module)}</TableCell>
                  <TableCell className='max-w-[280px] truncate' title={entry.description}>
                    {entry.description || '-'}
                  </TableCell>
                  <TableCell className='text-right tabular-nums text-emerald-600'>
                    {entry.type === 'income' ? formatMoney(entry.amount) : '-'}
                  </TableCell>
                  <TableCell className='text-right tabular-nums text-red-600'>
                    {entry.type === 'expense' ? formatMoney(entry.amount) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {data.editedEntries.length > 0 ? (
        <div className='space-y-2'>
          <p className='flex items-center gap-2 text-sm font-medium'>
            <PencilLine className='h-4 w-4 text-amber-600' />
            {t('Older entries edited in this period')}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Edited at')}</TableHead>
                <TableHead>{t('Entry date')}</TableHead>
                <TableHead>{t('Module')}</TableHead>
                <TableHead>{t('Description')}</TableHead>
                <TableHead className='text-right'>{t('Amount now')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.editedEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className='whitespace-nowrap'>{formatBusinessDateTime(entry.updatedAt)}</TableCell>
                  <TableCell className='whitespace-nowrap'>{formatBusinessDateTime(entry.date)}</TableCell>
                  <TableCell className='whitespace-nowrap'>{t(entry.module)}</TableCell>
                  <TableCell className='max-w-[280px] truncate' title={entry.description}>
                    {entry.description || '-'}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      entry.type === 'income' ? 'text-emerald-600' : 'text-red-600',
                    )}
                  >
                    {formatSignedMoney(entry.type === 'income' ? entry.amount : -entry.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}
