import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, ShieldAlert, TrendingUp } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/context/language-context'
import { formatAppDate } from '@/lib/date-format'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import {
  useLazyGetCustomerCreditStatusQuery,
  type ChangeLimitAction,
  type CreditRuleReason,
  type CreditStatus,
} from '@/stores/creditControl.api'
import { CreditLimitDialog } from './credit-limit-dialog'
import { CreditMeter } from './credit-meter'
import { brokenCreditRules, CREDIT_REASON_LABELS, getCreditLimitError } from './credit-utils'

/**
 * The credit check a sale runs just before saving (and again if the server refuses it).
 *
 * `check()` asks the server for the customer's credit with this sale's unpaid amount. Fits →
 * resolves straight away. Breaks a rule → shows what, by how much, and what can be done:
 *   - Raise limit (manageCreditLimits) — permanent or temporary, then the sale goes ahead
 *   - Approve this sale (overrideCreditLimit) — with a reason, logged on the invoice
 *   - Save anyway (warn mode only, not for a hold)
 *   - Go back — take more payment, change the sale
 * The resolution's `extra` is merged into the save payload. A failed/slow check never blocks
 * the save — the server enforces the same rule and `handleError` reopens this dialog.
 */

export type CreditExtra = { creditOverride?: { reason: string }; creditAcknowledgeWarning?: boolean }
export type CreditResolution = { proceed: true; extra: CreditExtra } | { proceed: false }

export type CreditCheckParams = {
  customerId?: string | null
  /** What this sale leaves owing (invoiceUnpaidAmount). */
  unpaid: number
  /** Invoice type — a pending invoice only counts when settings say pending counts. */
  type?: string
  /** When editing: the invoice being changed, so its old amount isn't counted twice. */
  excludeInvoiceId?: string
}

type Pending = {
  params: CreditCheckParams
  status: CreditStatus
  reasons: CreditRuleReason[]
  canOverride: boolean
  canManage: boolean
}

const CHECK_TIMEOUT_MS = 6000
const PROCEED: CreditResolution = { proceed: true, extra: {} }

const isRegistered = (customerId?: string | null): customerId is string =>
  Boolean(customerId) && customerId !== 'walk-in'

export function useCreditLimitGuard() {
  const [fetchStatus] = useLazyGetCustomerCreditStatusQuery()
  const [pending, setPending] = useState<Pending | null>(null)
  const resolveRef = useRef<((resolution: CreditResolution) => void) | null>(null)

  const settle = useCallback((resolution: CreditResolution) => {
    resolveRef.current?.(resolution)
    resolveRef.current = null
    setPending(null)
  }, [])

  const load = useCallback(
    async (params: CreditCheckParams): Promise<CreditStatus | null> => {
      if (!isRegistered(params.customerId)) return null
      try {
        const request = fetchStatus(
          { customerId: params.customerId, amount: params.unpaid, excludeInvoiceId: params.excludeInvoiceId },
          false,
        )
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS))
        return await Promise.race([request.unwrap(), timeout])
      } catch {
        return null
      }
    },
    [fetchStatus],
  )

  const ask = useCallback((next: Pending) => {
    return new Promise<CreditResolution>((resolve) => {
      resolveRef.current = resolve
      setPending(next)
    })
  }, [])

  /** Before saving. Resolves PROCEED when the sale fits (or the check couldn't run). */
  const check = useCallback(
    async (params: CreditCheckParams): Promise<CreditResolution> => {
      if (!isRegistered(params.customerId) || params.unpaid <= 0.005) return PROCEED
      const status = await load(params)
      if (!status) return PROCEED
      if (params.type === 'pending' && !status.includePendingInvoices) return PROCEED
      const reasons = brokenCreditRules(status)
      if (reasons.length === 0) return PROCEED
      return ask({ params, status, reasons, canOverride: Boolean(status.canOverride), canManage: Boolean(status.canManage) })
    },
    [ask, load],
  )

  /** After the server refused the save. null = not a credit refusal (handle it as before). */
  const handleError = useCallback(
    async (error: unknown, params: CreditCheckParams): Promise<CreditResolution | null> => {
      const payload = getCreditLimitError(error)
      if (!payload) return null
      const fresh = await load(params)
      return ask({
        params,
        status: { ...payload.credit, mode: payload.mode },
        reasons: payload.reasons,
        canOverride: payload.canOverride,
        canManage: Boolean(fresh?.canManage),
      })
    },
    [ask, load],
  )

  /** After a limit change inside the dialog: go ahead if the sale fits now. */
  const recheck = useCallback(async () => {
    if (!pending) return
    const status = await load(pending.params)
    if (!status) return
    const reasons = brokenCreditRules(status)
    if (reasons.length === 0) {
      settle(PROCEED)
      return
    }
    setPending({ ...pending, status, reasons })
  }, [load, pending, settle])

  const element = (
    <CreditLimitDialogView
      pending={pending}
      onCancel={() => settle({ proceed: false })}
      onProceed={(extra) => settle({ proceed: true, extra })}
      onLimitChanged={recheck}
    />
  )

  return { check, handleError, element }
}

function CreditLimitDialogView({
  pending,
  onCancel,
  onProceed,
  onLimitChanged,
}: {
  pending: Pending | null
  onCancel: () => void
  onProceed: (extra: CreditExtra) => void
  onLimitChanged: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [reason, setReason] = useState('')
  const [approving, setApproving] = useState(false)
  const [limitAction, setLimitAction] = useState<ChangeLimitAction | null>(null)

  const open = Boolean(pending)
  const status = pending?.status
  const reasons = pending?.reasons || []
  const onHold = reasons.includes('on_hold')
  const overLimit = reasons.includes('over_limit')
  const overdue = reasons.includes('overdue')
  const warnOnly = status?.mode === 'warn' && !onHold
  const canRaise = Boolean(pending?.canManage) && overLimit && !onHold && !overdue

  const close = () => {
    setReason('')
    setApproving(false)
    onCancel()
  }
  const proceed = (extra: CreditExtra) => {
    setReason('')
    setApproving(false)
    onProceed(extra)
  }

  const title = onHold
    ? t('{{name}} is on credit hold', { name: status?.customerName || '' })
    : overLimit
      ? t('Credit limit exceeded')
      : t('Overdue invoices on this account')

  return (
    <>
      <AlertDialog open={open && !limitAction} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent className='max-h-[92vh] overflow-y-auto sm:max-w-xl'>
          {status && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className='flex items-center gap-2'>
                  {onHold ? <ShieldAlert className='h-5 w-5 text-red-600' /> : <AlertTriangle className='h-5 w-5 text-amber-600' />}
                  {title}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className='space-y-1'>
                    <div>
                      {warnOnly
                        ? t('This sale breaks the credit rules for {{name}}. You can still save it — it will be logged.', { name: status.customerName })
                        : t('This sale can’t be saved on credit for {{name}} as it is.', { name: status.customerName })}
                    </div>
                    <div className='flex flex-wrap gap-1.5 pt-1'>
                      {reasons.map((r) => (
                        <Badge key={r} variant='outline' className='border-red-200 bg-red-50 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'>
                          {t(CREDIT_REASON_LABELS[r])}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>

              {onHold && status.holdReason && (
                <p className='rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200'>
                  {t('Reason')}: {status.holdReason}
                </p>
              )}

              <div className='rounded-lg border'>
                <Row label={t('Credit limit')}>
                  {status.hasLimit ? formatMoney(status.limit) : t('No limit')}
                  {status.temporary && (
                    <span className='ml-1 inline-flex items-center gap-0.5 text-xs font-normal text-violet-700 dark:text-violet-300'>
                      <CalendarClock className='h-3 w-3' />
                      {t('until {{date}}', { date: formatAppDate(status.temporary.expiresAt) })}
                    </span>
                  )}
                </Row>
                <Row label={t('Owes now')} hint={status.pendingAmount > 0 ? t('incl. {{amount}} pending', { amount: formatMoney(status.pendingAmount) }) : undefined}>
                  {formatMoney(status.exposure)}
                </Row>
                <Row label={t('This sale on credit')}>+ {formatMoney(status.saleAmount)}</Row>
                <Row label={t('Would owe')} strong>
                  {formatMoney(status.projectedExposure)}
                </Row>
                {status.hasLimit && status.excess > 0 && (
                  <Row label={t('Over the limit by')} tone='danger' strong>
                    {formatMoney(status.excess)}
                  </Row>
                )}
                {status.hasLimit && (
                  <div className='px-3 pb-3 pt-1'>
                    <CreditMeter limit={status.limit} exposure={status.exposure} projected={status.projectedExposure} status={status.status} />
                  </div>
                )}
              </div>

              {overdue && status.overdue.invoices.length > 0 && (
                <div className='rounded-lg border'>
                  <div className='border-b px-3 py-1.5 text-xs font-medium text-muted-foreground'>
                    {t('Overdue by more than {{days}} days', { days: status.overdueBlockDays })}
                  </div>
                  <ul className='divide-y text-sm'>
                    {status.overdue.invoices.map((inv) => (
                      <li key={inv.invoiceId} className='flex flex-wrap items-center justify-between gap-2 px-3 py-1.5'>
                        <span className='font-medium'>{inv.invoiceNumber}</span>
                        <span className='text-xs text-muted-foreground'>{t('due {{date}}', { date: formatAppDate(inv.dueDate) })}</span>
                        <span className='text-red-600'>{t('{{n}} days', { n: inv.daysOverdue })}</span>
                        <span className='tabular-nums'>{formatMoney(inv.remainingAmount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {overLimit && !onHold && status.excess > 0 && (
                <p className='text-sm text-muted-foreground'>
                  {t('Collect at least {{amount}} more now and the sale fits the limit.', { amount: formatMoney(status.excess) })}
                </p>
              )}

              {!pending?.canOverride && !pending?.canManage && !warnOnly && (
                <p className='rounded-md bg-muted/50 px-3 py-2 text-sm'>
                  {t('Ask a manager to approve this sale or raise the limit.')}
                </p>
              )}

              {approving && (
                <div className='space-y-2 rounded-lg border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-900 dark:bg-orange-950/20'>
                  <Label htmlFor='credit-override-reason'>{t('Why approve this sale over credit?')}</Label>
                  <Textarea
                    id='credit-override-reason'
                    rows={2}
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('e.g. Pays every Friday, approved by owner')}
                  />
                  <p className='text-xs text-muted-foreground'>{t('Saved on the invoice and in the customer’s credit history.')}</p>
                </div>
              )}

              <div className='flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end'>
                <Button type='button' variant={approving ? 'outline' : 'default'} autoFocus={!approving} onClick={close}>
                  {t('Go back')}
                </Button>
                {warnOnly && (
                  <Button type='button' variant='outline' onClick={() => proceed({ creditAcknowledgeWarning: true })}>
                    {t('Save anyway')}
                  </Button>
                )}
                {canRaise && (
                  <>
                    <Button type='button' variant='outline' className='gap-1.5' onClick={() => setLimitAction('temporary')}>
                      <CalendarClock className='h-4 w-4' />
                      {t('Temporary limit')}
                    </Button>
                    <Button type='button' variant='outline' className='gap-1.5' onClick={() => setLimitAction('increase')}>
                      <TrendingUp className='h-4 w-4' />
                      {t('Raise limit')}
                    </Button>
                  </>
                )}
                {pending?.canOverride &&
                  (approving ? (
                    <Button
                      type='button'
                      className='gap-1.5 bg-orange-600 text-white hover:bg-orange-700'
                      disabled={!reason.trim()}
                      onClick={() => proceed({ creditOverride: { reason: reason.trim() } })}
                    >
                      <CheckCircle2 className='h-4 w-4' />
                      {t('Approve & save')}
                    </Button>
                  ) : (
                    <Button type='button' variant='outline' className='gap-1.5' onClick={() => setApproving(true)}>
                      <CheckCircle2 className='h-4 w-4' />
                      {t('Approve this sale')}
                    </Button>
                  ))}
              </div>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {status && limitAction && (
        <CreditLimitDialog
          open
          onOpenChange={(next) => !next && setLimitAction(null)}
          status={status}
          initialAction={limitAction}
          neededLimit={status.projectedExposure}
          onSaved={() => {
            setLimitAction(null)
            onLimitChanged()
          }}
        />
      )}
    </>
  )
}

function Row({
  label,
  hint,
  children,
  strong,
  tone,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  strong?: boolean
  tone?: 'danger'
}) {
  return (
    <div className='flex items-baseline justify-between gap-3 border-b px-3 py-1.5 text-sm last:border-b-0'>
      <span className='text-muted-foreground'>
        {label}
        {hint && <span className='ml-1 text-xs'>({hint})</span>}
      </span>
      <span className={cn('tabular-nums', strong && 'font-semibold', tone === 'danger' && 'text-red-600')}>{children}</span>
    </div>
  )
}
