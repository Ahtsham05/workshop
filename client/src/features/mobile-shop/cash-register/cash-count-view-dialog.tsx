import type { ReactNode } from 'react'
import { Banknote, Coins } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { useLanguage } from '@/context/language-context'
import {
  formatMoney,
  getDenominationLabel,
  normalizeCounts,
  type DenominationCount,
} from '@/lib/pkr-denominations'
import { formatBusinessDateTime } from '@/lib/business-timezone'
import { cn } from '@/lib/utils'
import type { CashRegisterSnapshot } from '@/stores/cashRegister.api'

type Props = {
  snapshot: CashRegisterSnapshot | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function renderDenominationSection(
  title: string,
  badgeVariant: 'secondary' | 'outline',
  icon: ReactNode,
  rows: DenominationCount[],
  emptyLabel: string,
) {
  const withQty = rows.filter((row) => row.quantity > 0)
  if (withQty.length === 0) {
    return (
      <div className='space-y-2'>
        <div className='flex items-center gap-2'>
          <Badge variant={badgeVariant}>{title}</Badge>
        </div>
        <p className='text-sm text-muted-foreground'>{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-2'>
        <Badge variant={badgeVariant}>{title}</Badge>
      </div>
      <div className='space-y-2'>
        {withQty.map((row) => (
          <div
            key={`${row.kind}-${row.value}`}
            className='flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2'
          >
            <div className='flex items-center gap-2 min-w-0'>
              {icon}
              <span className='text-sm font-medium truncate'>
                {getDenominationLabel(row.value, row.kind)}
              </span>
            </div>
            <div className='text-right shrink-0'>
              <p className='text-sm font-semibold tabular-nums'>× {row.quantity}</p>
              <p className='text-xs text-muted-foreground tabular-nums'>
                {formatMoney(row.value * row.quantity)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CashCountViewDialog({ snapshot, open, onOpenChange }: Props) {
  const { t } = useLanguage()

  if (!snapshot) return null

  const counts = normalizeCounts(snapshot.counts || [])
  const noteRows = counts.filter((row) => row.kind === 'note')
  const coinRows = counts.filter((row) => row.kind === 'coin')
  const countedAt = snapshot.createdAt || (snapshot as { updatedAt?: string }).updatedAt

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t('Count Details')}</DialogTitle>
          <DialogDescription>
            {countedAt ? formatBusinessDateTime(countedAt) : t('Saved count breakdown')}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {renderDenominationSection(
            t('Notes'),
            'secondary',
            <Banknote className='h-4 w-4 shrink-0 text-emerald-600' />,
            noteRows,
            t('No notes were counted'),
          )}

          <Separator />

          {renderDenominationSection(
            t('Coins'),
            'outline',
            <Coins className='h-4 w-4 shrink-0 text-amber-600' />,
            coinRows,
            t('No coins were counted'),
          )}

          <Separator />

          <div className='rounded-lg border bg-muted/40 p-4 space-y-2'>
            <div className='flex items-center justify-between gap-2 text-sm'>
              <span className='text-muted-foreground'>{t('Counted total')}</span>
              <span className='font-semibold tabular-nums'>{formatMoney(snapshot.totalAmount)}</span>
            </div>
            <div className='flex items-center justify-between gap-2 text-sm'>
              <span className='text-muted-foreground'>{t('Expected from cash book')}</span>
              <span className='font-medium tabular-nums'>{formatMoney(snapshot.expectedCashAmount)}</span>
            </div>
            <Separator />
            <div className='flex items-center justify-between gap-2'>
              <span className='font-semibold'>{t('Variance')}</span>
              <span
                className={cn(
                  'font-bold tabular-nums',
                  snapshot.variance === 0 && 'text-emerald-600',
                  snapshot.variance > 0 && 'text-amber-600',
                  snapshot.variance < 0 && 'text-red-600',
                )}
              >
                {snapshot.variance >= 0 ? '+' : '-'}
                {formatMoney(Math.abs(snapshot.variance))}
              </span>
            </div>
          </div>

          {snapshot.notes?.trim() ? (
            <div className='space-y-1'>
              <p className='text-sm font-medium'>{t('Notes')}</p>
              <p className='text-sm text-muted-foreground whitespace-pre-wrap'>{snapshot.notes}</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
