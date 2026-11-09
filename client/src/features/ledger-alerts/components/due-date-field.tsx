import { useEffect, useRef } from 'react'
import { CalendarClock, Minus, Plus, X } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useLedgerAlertSettings } from '../hooks/use-ledger-alerts'
import { PAYMENT_TERM_DAYS, classifyDue, daysBetween, defaultDueDateFor, toneForState, hexToRgba, isDueDateInvoiceType } from '../lib/ledger-colors'

const QUICK_DAYS = [7, 15, 30, 60]

/**
 * Due date on the invoice screen (credit + pending invoices).
 *
 * New invoice: pre-filled from Settings → Due Dates & Ledger Colours (customer terms, else
 * the default days) and re-computed when the invoice date / customer / type changes — until
 * the cashier picks a date themselves, after which it is left alone.
 * Editing: keeps the saved date; fills the default only when the invoice is switched to
 * credit/pending without one.
 *
 * value: 'YYYY-MM-DD' = due date, null = "no due date" on purpose, undefined = not decided
 * (the server then applies the default itself).
 */
export function InvoiceDueDateField({
  type,
  invoiceDate,
  customerId,
  paymentTerms,
  value,
  onChange,
  isEditing,
  className,
}: {
  type: string
  invoiceDate?: string
  customerId?: string
  paymentTerms?: string | null
  value: string | null | undefined
  onChange: (value: string | null | undefined) => void
  isEditing: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const { settings, loaded } = useLedgerAlertSettings()
  const touchedRef = useRef(false)
  const initialTypeRef = useRef(type)
  const valueRef = useRef(value)
  valueRef.current = value

  // A different invoice opened (or a fresh form) — forget the manual-pick flag.
  useEffect(() => {
    touchedRef.current = false
    initialTypeRef.current = type
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  // The form was reset for the next sale (a manual pick is a date or null, never undefined).
  useEffect(() => {
    if (value === undefined) touchedRef.current = false
  }, [value])

  useEffect(() => {
    if (!loaded || !isDueDateInvoiceType(type) || touchedRef.current) return
    const fallback = defaultDueDateFor(settings, invoiceDate, type, paymentTerms)
    if (isEditing) {
      // Only an invoice switched INTO credit/pending without a date gets the default.
      if (!valueRef.current && !isDueDateInvoiceType(initialTypeRef.current) && fallback) onChange(fallback)
      return
    }
    if (fallback !== (valueRef.current ?? null)) onChange(fallback ?? undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, type, invoiceDate, customerId, paymentTerms, settings.dueDatesEnabled, settings.defaultDueDays, settings.useCustomerTerms, settings.applyToPending, isEditing])

  if (!isDueDateInvoiceType(type)) return null

  const base = (invoiceDate && invoiceDate.slice(0, 10)) || getBusinessToday()
  const setManual = (next: string | null) => {
    touchedRef.current = true
    onChange(next)
  }

  // Due dates off and none set → just an "Add due date" link, nothing in the way.
  if (!settings.dueDatesEnabled && !value) {
    return (
      <div className={className}>
        <button
          type='button'
          onClick={() => setManual(shiftBusinessCalendarDate(base, settings.defaultDueDays || 15))}
          className='inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline'
        >
          <CalendarClock className='h-3.5 w-3.5' />
          {t('Add due date')}
        </button>
      </div>
    )
  }

  const creditDays = value ? daysBetween(base, value) : null
  const status = value ? classifyDue(value, 1, settings) : null
  const tone = status ? toneForState(status.state as never, status.bandIndex, settings) : null
  const termsDays = settings.useCustomerTerms && paymentTerms ? PAYMENT_TERM_DAYS[paymentTerms] : undefined

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className='flex items-center justify-between gap-2'>
        <Label htmlFor='invoiceDueDate' className='flex items-center gap-1.5'>
          <CalendarClock className='h-3.5 w-3.5 text-muted-foreground' />
          {t('Due date')}
        </Label>
        {creditDays !== null ? (
          <span className='text-[11px] text-muted-foreground'>
            {creditDays === 0 ? t('Same day') : `${creditDays} ${t('days credit')}`}
            {termsDays !== undefined && creditDays === termsDays ? ` · ${t('customer terms')}` : ''}
          </span>
        ) : null}
      </div>
      <div className='flex items-center gap-1'>
        <Button
          type='button'
          variant='outline'
          size='icon'
          className='h-9 w-9 shrink-0'
          onClick={() => setManual(shiftBusinessCalendarDate(value || base, -1))}
          disabled={!value || value <= base}
          aria-label={t('One day earlier')}
        >
          <Minus className='h-3.5 w-3.5' />
        </Button>
        <DatePicker
          id='invoiceDueDate'
          value={value || ''}
          min={base}
          onChange={(day) => setManual(day || null)}
          placeholder={t('No due date')}
          className='min-w-0 flex-1'
          style={tone ? { boxShadow: `inset 3px 0 0 0 ${tone.color}` } : undefined}
        />
        <Button
          type='button'
          variant='outline'
          size='icon'
          className='h-9 w-9 shrink-0'
          onClick={() => setManual(shiftBusinessCalendarDate(value || base, 1))}
          aria-label={t('One day later')}
        >
          <Plus className='h-3.5 w-3.5' />
        </Button>
      </div>
      <div className='flex flex-wrap items-center gap-1'>
        {QUICK_DAYS.map((days) => {
          const target = shiftBusinessCalendarDate(base, days)
          const active = value === target
          return (
            <button
              key={days}
              type='button'
              onClick={() => setManual(target)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {days}d
            </button>
          )
        })}
        {value ? (
          <button
            type='button'
            onClick={() => setManual(null)}
            className='ml-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground'
            title={t('Save without a due date')}
          >
            <X className='h-3 w-3' />
            {t('None')}
          </button>
        ) : null}
      </div>
      {value && status && status.state !== 'not_due' ? (
        <p
          className='rounded px-1.5 py-0.5 text-[11px] font-medium'
          style={tone ? { backgroundColor: hexToRgba(tone.color, 0.14) } : undefined}
        >
          {status.state === 'overdue'
            ? `${t('Already overdue')} (${status.daysOverdue}d) — ${formatAppDate(value)}`
            : status.state === 'due_today'
              ? t('Due today')
              : `${t('Due in')} ${status.daysUntilDue} ${t('days')} — ${formatAppDate(value)}`}
        </p>
      ) : null}
    </div>
  )
}
