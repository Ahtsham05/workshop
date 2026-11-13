import { Banknote, Building2, CreditCard, Landmark, ScrollText, type LucideIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  PAYMENT_MODE_LABELS,
  PAYMENT_REFERENCE_FIELD,
  defaultPayFromAccount,
  type PaymentMode,
} from '@/lib/payment-modes'

export interface PaymentCardWallet {
  type: string
  isActive?: boolean
  accountType?: string
  paymentMode?: 'card' | 'ach' | 'check'
  isDefault?: boolean
  balance?: number
}

export interface PaymentMethodSelection {
  paymentMethod: 'cash' | 'wallet'
  walletType?: string
}

interface PaymentMethodCardsProps {
  wallets: PaymentCardWallet[]
  paymentMethod?: string
  walletType?: string
  reference?: string
  onSelect: (selection: PaymentMethodSelection) => void
  onReferenceChange: (reference: string) => void
  /** Smaller cards (catalog-shown invoice layout / narrow panels). */
  compact?: boolean
  label?: string
  className?: string
}

const MODE_ICONS: Record<PaymentMode, LucideIcon> = {
  cash: Banknote,
  card: CreditCard,
  ach: Landmark,
  check: ScrollText,
  bank: Building2,
}

const MODE_ACTIVE: Record<PaymentMode, string> = {
  cash: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
  card: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300',
  ach: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300',
  check: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
  bank: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200',
}

const MODE_ORDER: Array<'card' | 'ach' | 'check'> = ['card', 'ach', 'check']

interface CardOption {
  key: string
  mode: PaymentMode
  label: string
  /** Receiving account name, shown under the label when it differs from it. */
  account?: string
  selection: PaymentMethodSelection
}

/**
 * Payment method as cards (Cash · Credit Card · ACH · Check), mirroring the Invoice Type cards.
 * Each non-cash card is the account flagged with that `paymentMode` (seeded by the server for
 * wholesale / distributor businesses); any other bank account shows as an extra card by its
 * own name. A reference field (Check # / ACH ref / card last-4) appears for non-cash tenders.
 */
export function PaymentMethodCards({
  wallets,
  paymentMethod,
  walletType,
  reference,
  onSelect,
  onReferenceChange,
  compact = false,
  label = 'Payment Method',
  className,
}: PaymentMethodCardsProps) {
  const active = wallets.filter((w) => w.isActive !== false && w.accountType !== 'cash')

  const options: CardOption[] = [
    { key: 'cash', mode: 'cash', label: PAYMENT_MODE_LABELS.cash, selection: { paymentMethod: 'cash' } },
  ]
  MODE_ORDER.forEach((mode) => {
    const wallet = active.find((w) => w.paymentMode === mode)
    if (!wallet) return
    options.push({
      key: mode,
      mode,
      label: PAYMENT_MODE_LABELS[mode],
      account: wallet.type !== PAYMENT_MODE_LABELS[mode] ? wallet.type : undefined,
      selection: { paymentMethod: 'wallet', walletType: wallet.type },
    })
  })
  active
    .filter((w) => !w.paymentMode)
    .forEach((w) => {
      options.push({
        key: `bank:${w.type}`,
        mode: 'bank',
        label: w.type,
        selection: { paymentMethod: 'wallet', walletType: w.type },
      })
    })

  const selected =
    paymentMethod === 'wallet' && walletType
      ? options.find((o) => o.selection.paymentMethod === 'wallet' && o.selection.walletType === walletType)
      : options[0]
  const selectedMode: PaymentMode | null = selected?.mode ?? (paymentMethod === 'wallet' ? 'bank' : 'cash')
  const referenceField = selectedMode && selectedMode !== 'cash' ? PAYMENT_REFERENCE_FIELD[selectedMode] : undefined

  return (
    <div className={cn('space-y-2', className)}>
      <Label className='block'>{label}</Label>
      <div role='radiogroup' aria-label={label} className={cn('grid grid-cols-4', compact ? 'gap-1' : 'gap-1.5')}>
        {options.map((option) => {
          const Icon = MODE_ICONS[option.mode]
          const isActive = selected?.key === option.key
          return (
            <button
              key={option.key}
              type='button'
              role='radio'
              aria-checked={isActive}
              title={option.account ? `${option.label} → ${option.account}` : option.label}
              onClick={() => onSelect(option.selection)}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center rounded-lg border font-medium transition-colors',
                // Sized for the narrow right-hand Payment column: no breakpoint growth, since
                // `sm:` follows the page width, not this column's.
                compact ? 'gap-0.5 px-0.5 py-1.5 text-[10px]' : 'gap-1 px-0.5 py-2 text-[11px]',
                isActive
                  ? MODE_ACTIVE[option.mode]
                  : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              <span className='line-clamp-2 w-full text-center leading-tight [word-break:normal]'>{option.label}</span>
            </button>
          )
        })}
      </div>
      {selected?.account && (
        <p className='text-[11px] text-muted-foreground'>
          Received into <span className='font-medium text-foreground'>{selected.account}</span>
        </p>
      )}
      {referenceField && (
        <div>
          <Label htmlFor='paymentReference' className='mb-1 block text-xs text-muted-foreground'>
            {referenceField.label} <span className='font-normal'>(optional)</span>
          </Label>
          <Input
            id='paymentReference'
            value={reference || ''}
            maxLength={60}
            showVoiceInput={false}
            placeholder={referenceField.placeholder}
            onChange={(e) => onReferenceChange(e.target.value)}
            className='h-9'
          />
        </div>
      )}
    </div>
  )
}

/* ── Paying a supplier ─────────────────────────────────────────────────────── */

export interface SupplierPaymentSelection {
  paymentMethod: 'cash' | 'wallet'
  walletType?: string
  paymentMode: PaymentMode
}

interface SupplierPaymentCardsProps {
  wallets: PaymentCardWallet[]
  paymentMethod?: string
  walletType?: string
  paymentMode?: string
  reference?: string
  onChange: (selection: SupplierPaymentSelection) => void
  onReferenceChange: (reference: string) => void
  /** Amount being paid now — the bank account is only used when it can cover it. */
  amount?: number
  label?: string
  className?: string
}

const SUPPLIER_MODES: Array<'cash' | 'card' | 'ach' | 'check'> = ['cash', 'card', 'ach', 'check']

/**
 * How a supplier was paid (Cash · Credit Card · ACH · Check) + its check # / reference. The card
 * sets `paymentMode`; the account the money leaves is picked automatically (no "Paid from" box)
 * by defaultPayFromAccount — the bank account when it can cover the payment, else the tender's
 * own account.
 */
export function SupplierPaymentCards({
  wallets,
  paymentMethod,
  walletType,
  paymentMode,
  reference,
  onChange,
  onReferenceChange,
  amount = 0,
  label = 'Payment Method',
  className,
}: SupplierPaymentCardsProps) {
  const accounts = wallets.filter((w) => w.isActive !== false && w.accountType !== 'cash')
  const paidFromCash = paymentMethod !== 'wallet' || !walletType
  const current: PaymentMode = paidFromCash
    ? 'cash'
    : paymentMode && paymentMode in PAYMENT_MODE_LABELS && paymentMode !== 'cash'
      ? (paymentMode as PaymentMode)
      : accounts.find((w) => w.type === walletType)?.paymentMode || 'bank'
  const referenceField = current !== 'cash' ? PAYMENT_REFERENCE_FIELD[current] : undefined
  const pickMode = (mode: 'cash' | 'card' | 'ach' | 'check') => {
    if (mode === 'cash') {
      onChange({ paymentMethod: 'cash', walletType: undefined, paymentMode: 'cash' })
      return
    }
    const account = defaultPayFromAccount(wallets, mode, amount)
    if (!account) {
      onChange({ paymentMethod: 'cash', walletType: undefined, paymentMode: 'cash' })
      return
    }
    onChange({ paymentMethod: 'wallet', walletType: account, paymentMode: mode })
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label className='block'>{label}</Label>
      <div role='radiogroup' aria-label={label} className='grid grid-cols-4 gap-1.5'>
        {SUPPLIER_MODES.map((mode) => {
          const Icon = MODE_ICONS[mode]
          const isActive = current === mode
          const disabled = mode !== 'cash' && accounts.length === 0
          return (
            <button
              key={mode}
              type='button'
              role='radio'
              aria-checked={isActive}
              disabled={disabled}
              title={disabled ? 'Add a bank account first' : PAYMENT_MODE_LABELS[mode]}
              onClick={() => pickMode(mode)}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-0.5 py-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                isActive
                  ? MODE_ACTIVE[mode]
                  : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className='h-4 w-4' />
              <span className='line-clamp-2 w-full text-center leading-tight [word-break:normal]'>{PAYMENT_MODE_LABELS[mode]}</span>
            </button>
          )
        })}
      </div>

      {referenceField && (
        <div>
          <Label htmlFor='supplierPaymentReference' className='mb-1 block text-xs text-muted-foreground'>
            {referenceField.label} <span className='font-normal'>(optional)</span>
          </Label>
          <Input
            id='supplierPaymentReference'
            value={reference || ''}
            maxLength={60}
            showVoiceInput={false}
            placeholder={referenceField.placeholder}
            onChange={(e) => onReferenceChange(e.target.value)}
            className='h-9'
          />
        </div>
      )}
    </div>
  )
}
