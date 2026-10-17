import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Eye } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RecordNavigator, type RecordNavigatorMode } from '@/components/record-navigator'
import { useLanguage } from '@/context/language-context'
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import { useFormatMoney } from '@/lib/format-money'
import { useLazyGetPossibleDuplicatePurchasesQuery } from '@/stores/purchase.api'
import { useLazyGetPossibleDuplicateInvoicesQuery } from '@/stores/invoice.api'
import type { PossibleDuplicate } from '@/stores/transactionHistory.types'

/**
 * The check New Purchase / New Invoice run just before saving: has this bill already been
 * entered? (Same supplier bill number, or the same party + amount on about the same day —
 * see server entryGuard.service.js.) Found something → the person sees those records and
 * chooses; nothing found, or the check itself failed/timed out → saving just carries on.
 *
 * `confirm()` resolves true to save, false to go back to the form.
 */

const CHECK_TIMEOUT_MS = 6000

export type DuplicateCheckParams =
  | { mode: 'purchase'; supplier: string; vendorBillNumber?: string; totalAmount: number; purchaseDate?: string; excludeId?: string }
  | { mode: 'sale'; customerId?: string; total: number; invoiceDate?: string; excludeId?: string }

export function useDuplicateEntryGuard(mode: RecordNavigatorMode) {
  const [checkPurchases] = useLazyGetPossibleDuplicatePurchasesQuery()
  const [checkInvoices] = useLazyGetPossibleDuplicateInvoicesQuery()
  const [matches, setMatches] = useState<PossibleDuplicate[] | null>(null)
  const resolveRef = useRef<((save: boolean) => void) | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)

  const settle = useCallback((save: boolean) => {
    resolveRef.current?.(save)
    resolveRef.current = null
    setMatches(null)
    setViewId(null)
  }, [])

  const confirm = useCallback(
    async (params: DuplicateCheckParams): Promise<boolean> => {
      let found: PossibleDuplicate[] = []
      try {
        const { mode: _mode, ...query } = params
        const request = params.mode === 'purchase' ? checkPurchases(query as never) : checkInvoices(query as never)
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS))
        found = (await Promise.race([request.unwrap(), timeout])).matches || []
      } catch {
        // Offline, slow or failed: the check is a convenience, never a reason not to save.
        return true
      }
      if (!found.length) return true
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve
        setMatches(found)
      })
    },
    [checkPurchases, checkInvoices],
  )

  const element = (
    <>
      <DuplicateEntryDialog
        mode={mode}
        matches={matches}
        onView={setViewId}
        onSaveAnyway={() => settle(true)}
        onGoBack={() => settle(false)}
      />
      {viewId && (
        <RecordNavigator
          mode={mode}
          open
          onOpenChange={(open) => !open && setViewId(null)}
          target={{ aroundId: viewId }}
        />
      )}
    </>
  )

  return { confirm, element }
}

function DuplicateEntryDialog({
  mode,
  matches,
  onView,
  onSaveAnyway,
  onGoBack,
}: {
  mode: RecordNavigatorMode
  matches: PossibleDuplicate[] | null
  onView: (id: string) => void
  onSaveAnyway: () => void
  onGoBack: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const sameBill = useMemo(() => (matches || []).some((m) => m.reason === 'same_bill_number'), [matches])
  // Plain words — t() capitalises known keys ("Purchase") mid-sentence.
  const noun = mode === 'purchase' ? 'purchase' : 'sale'

  return (
    <AlertDialog open={!!matches} onOpenChange={(open) => !open && onGoBack()}>
      <AlertDialogContent className='sm:max-w-2xl'>
        <AlertDialogHeader>
          <AlertDialogTitle className='flex items-center gap-2'>
            <AlertTriangle className='h-5 w-5 text-amber-600' />
            {t('This {{noun}} may already be entered', { noun })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {sameBill
              ? t('A purchase from this supplier already has the same bill number.')
              : mode === 'purchase'
                ? t('A purchase from this supplier for the same amount was saved within a few days of this date.')
                : t('A sale to this customer for the same amount was saved on the same day.')}{' '}
            {t('Check it before saving — entering the same bill twice doubles stock and balances.')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className='max-h-72 divide-y overflow-y-auto rounded-lg border'>
          {(matches || []).map((m) => (
            <li key={m.id} className='flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm'>
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='font-medium'>{m.number}</span>
                  {m.partyBillNumber && <span className='text-xs text-muted-foreground'>{t('Bill no.')} {m.partyBillNumber}</span>}
                  <Badge
                    variant='outline'
                    className={
                      m.reason === 'same_bill_number'
                        ? 'border-red-200 bg-red-50 text-[10px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                        : 'border-amber-200 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                    }
                  >
                    {m.reason === 'same_bill_number' ? t('Same bill number') : t('Same amount')}
                  </Badge>
                </div>
                <div className='mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground'>
                  <span>{formatAppDate(m.date)}</span>
                  <span className='font-medium text-foreground'>{formatMoney(m.amount)}</span>
                  <span>
                    {m.itemCount} {m.itemCount === 1 ? t('item') : t('items')}
                  </span>
                  <span>
                    {t('Entered')} {formatAppDateTime(m.enteredAt)}
                    {m.enteredBy ? ` · ${m.enteredBy}` : ''}
                  </span>
                </div>
              </div>
              <Button type='button' variant='outline' size='sm' className='h-7 gap-1 px-2 text-xs' onClick={() => onView(m.id)}>
                <Eye className='h-3.5 w-3.5' />
                {t('View')}
              </Button>
            </li>
          ))}
        </ul>

        <AlertDialogFooter>
          {/* Going back is the safe default — Enter lands here. */}
          <Button type='button' autoFocus onClick={onGoBack}>
            {t('Go back, don’t save')}
          </Button>
          <Button type='button' variant='outline' onClick={onSaveAnyway}>
            {t('Save anyway')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
