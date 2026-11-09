import { useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  CreditCard,
  History,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/context/language-context'
import { formatAppDate } from '@/lib/date-format'
import { getErrorMessage } from '@/lib/get-error-message'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import {
  useClearTemporaryCreditLimitMutation,
  useGetCustomerCreditStatusQuery,
  type ChangeLimitAction,
} from '@/stores/creditControl.api'
import { CreditHistoryDialog } from './credit-history-dialog'
import { CreditHoldDialog } from './credit-hold-dialog'
import { CreditLimitDialog } from './credit-limit-dialog'
import { CreditMeter } from './credit-meter'
import { CREDIT_STATUS_META } from './credit-utils'

/**
 * The customer's credit position — limit, used, available, pending, overdue — with the quick
 * actions (raise / set / temporary limit, hold, history) for whoever may manage credit.
 */
export function CustomerCreditCard({ customerId, className }: { customerId: string; className?: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data: status, isLoading, isError } = useGetCustomerCreditStatusQuery({ customerId }, { skip: !customerId })
  const [clearTemporary, { isLoading: clearing }] = useClearTemporaryCreditLimitMutation()
  const [limitAction, setLimitAction] = useState<ChangeLimitAction | null>(null)
  const [holdOpen, setHoldOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-muted-foreground', className)}>
        <Loader2 className='h-4 w-4 animate-spin' /> {t('Loading credit…')}
      </div>
    )
  }
  if (isError || !status) return null

  const meta = CREDIT_STATUS_META[status.status]
  const canManage = Boolean(status.canManage)
  const removeTemporary = async () => {
    try {
      await clearTemporary({ customerId }).unwrap()
      toast.success(t('Temporary limit removed'))
    } catch (error) {
      toast.error(getErrorMessage(error, t('Could not remove the temporary limit')))
    }
  }

  return (
    <div className={cn('rounded-lg border', status.onHold && 'border-red-300 dark:border-red-900', className)}>
      <div className='flex flex-wrap items-center gap-2 border-b px-4 py-2.5'>
        <CreditCard className='h-4 w-4 text-muted-foreground' />
        <span className='text-sm font-semibold'>{t('Credit control')}</span>
        <Badge variant='outline' className={cn('text-[11px]', meta.badge)}>
          {t(meta.label)}
        </Badge>
        {!status.enabled && (
          <Badge variant='outline' className='text-[11px]'>
            {t('Checks turned off')}
          </Badge>
        )}
        <div className='ml-auto flex items-center gap-1'>
          <Button type='button' variant='ghost' size='sm' className='h-8 gap-1.5' onClick={() => setHistoryOpen(true)}>
            <History className='h-4 w-4' />
            <span className='hidden sm:inline'>{t('History')}</span>
          </Button>
          {canManage && (
            <>
              <Button type='button' size='sm' className='h-8 gap-1.5' onClick={() => setLimitAction('increase')}>
                <Plus className='h-4 w-4' />
                {status.hasLimit ? t('Increase limit') : t('Set limit')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type='button' variant='outline' size='sm' className='h-8 px-2' aria-label={t('More credit actions')}>
                    <ChevronDown className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem onClick={() => setLimitAction('set')}>{t('Set exact limit')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLimitAction('temporary')}>
                    <CalendarClock className='mr-2 h-4 w-4' />
                    {t('Temporary increase')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setHoldOpen(true)}
                    className={status.onHold ? '' : 'text-red-600 focus:text-red-600'}
                  >
                    {status.onHold ? <ShieldCheck className='mr-2 h-4 w-4' /> : <ShieldAlert className='mr-2 h-4 w-4' />}
                    {status.onHold ? t('Release from hold') : t('Put on credit hold')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <div className='space-y-3 px-4 py-3'>
        {status.onHold && (
          <div className='flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200'>
            <ShieldAlert className='mt-0.5 h-4 w-4 shrink-0' />
            <div>
              <span className='font-medium'>{t('On credit hold')}</span>
              {status.holdReason && <> — {status.holdReason}</>}
              {status.holdAt && <span className='opacity-75'> · {t('since {{date}}', { date: formatAppDate(status.holdAt) })}</span>}
            </div>
          </div>
        )}

        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <Stat label={t('Credit limit')}>
            {status.hasLimit ? formatMoney(status.limit) : <span className='text-muted-foreground'>{t('No limit')}</span>}
          </Stat>
          <Stat label={t('Used')}>{formatMoney(status.exposure)}</Stat>
          <Stat label={t('Available')}>
            {status.available === null ? (
              <span className='text-muted-foreground'>—</span>
            ) : (
              <span className={status.available < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}>
                {formatMoney(status.available)}
              </span>
            )}
          </Stat>
          <Stat label={t('Overdue')}>
            {status.overdue.count > 0 ? (
              <span className='text-red-600'>
                {formatMoney(status.overdue.amount)}
                <span className='ml-1 text-xs font-normal'>({t('{{n}} days', { n: status.overdue.oldestDays })})</span>
              </span>
            ) : (
              <span className='text-muted-foreground'>—</span>
            )}
          </Stat>
        </div>

        {status.hasLimit && (
          <div className='space-y-1'>
            <CreditMeter limit={status.limit} exposure={status.exposure} status={status.status} />
            <div className='flex flex-wrap justify-between gap-2 text-xs text-muted-foreground'>
              <span>{t('{{pct}}% used', { pct: Math.max(0, Math.round(status.utilization || 0)) })}</span>
              {status.pendingAmount > 0 && (
                <span>{t('incl. {{amount}} in pending bills', { amount: formatMoney(status.pendingAmount) })}</span>
              )}
            </div>
          </div>
        )}

        {status.temporary && (
          <div className='flex flex-wrap items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200'>
            <CalendarClock className='h-3.5 w-3.5' />
            <span>
              {t('Temporary limit {{amount}} until {{date}}', {
                amount: formatMoney(status.temporary.amount),
                date: formatAppDate(status.temporary.expiresAt),
              })}
              {' · '}
              {t('then back to {{amount}}', { amount: status.baseLimit > 0 ? formatMoney(status.baseLimit) : t('no limit') })}
            </span>
            {canManage && (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='ml-auto h-6 px-1.5 text-xs'
                disabled={clearing}
                onClick={removeTemporary}
              >
                <X className='mr-1 h-3 w-3' />
                {t('Remove')}
              </Button>
            )}
          </div>
        )}

        {status.overdueBlockDays > 0 && status.overdue.blockingCount > 0 && (
          <div className='flex items-start gap-2 text-xs text-red-700 dark:text-red-400'>
            <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
            {t('New credit is blocked: {{n}} invoice(s) overdue by more than {{days}} days.', {
              n: status.overdue.blockingCount,
              days: status.overdueBlockDays,
            })}
          </div>
        )}
      </div>

      {limitAction && (
        <CreditLimitDialog
          open={Boolean(limitAction)}
          onOpenChange={(open) => !open && setLimitAction(null)}
          status={status}
          initialAction={limitAction}
        />
      )}
      <CreditHoldDialog open={holdOpen} onOpenChange={setHoldOpen} status={status} />
      <CreditHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} customerId={customerId} customerName={status.customerName} />
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='mt-0.5 text-base font-semibold tabular-nums'>{children}</p>
    </div>
  )
}
