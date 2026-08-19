import { ArrowLeftRight } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WalletLike } from '@/lib/wallet-payment-options'

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(v)

export interface SplitPaymentValue {
  splitPaymentMethod?: 'cash' | 'wallet'
  splitWalletType?: string
  splitPaidAmount?: number
}

interface SplitPaymentFieldsProps {
  /** The main Payment Method currently selected — the split leg is always the opposite bucket. */
  primaryMethod: 'cash' | 'wallet'
  /** Real accounts (Bank Accounts / mobile wallets) the split-into-wallet leg can pick from. */
  wallets: WalletLike[]
  /**
   * Amount entered in the "Paid Amount" field elsewhere on the form — this is the primary
   * leg's own amount, not a combined total the split leg is carved out of. The two legs are
   * independent and add up to what's actually paid; see the note on `splitAmount` below.
   */
  paidAmount: number
  value: SplitPaymentValue
  onChange: (patch: SplitPaymentValue) => void
  /**
   * Show each account's current balance next to its name in the Split Account dropdown.
   * Pass `true` only on money-out forms (purchase, expense, supplier payment) where the
   * balance is relevant to avoid overdrawing; pass `false` on money-in forms (sale, customer
   * payment received) — mirrors `showBalance` on buildMergedPaymentOptions. Defaults to `true`
   * for backward compatibility with existing callers.
   */
  showBalance?: boolean
}

/**
 * Optional "paid partly via a second account" affordance for Invoice/Purchase forms — e.g. a
 * customer pays Rs 2,000 cash + Rs 3,000 via JazzCash in one sale. The split leg is always the
 * opposite bucket (cash vs wallet) from the primary Payment Method, so each leg lands in a
 * different ledger (Cash Book vs Wallet Entry) and the two can never collide.
 *
 * The primary "Paid Amount" field and this split amount are independent inputs that ADD UP to
 * the true total paid — typing 2000 in Paid Amount and 3000 here means Rs 5,000 was collected
 * total (2000 cash + 3000 wallet), not "Rs 2,000 total, of which 2,000 was wallet." The caller
 * is responsible for summing them into the amount actually sent to the API / shown as "total
 * paid" (see `paidAmount + splitPaidAmount` in invoice-panel.tsx / purchase-panel.tsx).
 */
export function SplitPaymentFields({ primaryMethod, wallets, paidAmount, value, onChange, showBalance = true }: SplitPaymentFieldsProps) {
  const splitBucket: 'cash' | 'wallet' = primaryMethod === 'wallet' ? 'cash' : 'wallet'
  const isSplitting = Boolean(value.splitPaymentMethod)
  const splitAmount = Math.max(0, Number(value.splitPaidAmount || 0))
  const primaryAmount = Math.max(0, paidAmount)
  const totalPaid = primaryAmount + (isSplitting ? splitAmount : 0)

  const realWallets = wallets.filter((w) => w.isActive !== false && w.accountType !== 'cash')

  if (paidAmount <= 0 && !isSplitting) return null

  return (
    <div className='space-y-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/15'>
      <div className='flex items-center justify-between gap-2'>
        <Label htmlFor='split-payment-toggle' className='flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200'>
          <ArrowLeftRight className='h-4 w-4' />
          Split this payment across two methods
        </Label>
        <Switch
          id='split-payment-toggle'
          checked={isSplitting}
          onCheckedChange={(checked) => {
            if (!checked) {
              onChange({ splitPaymentMethod: undefined, splitWalletType: undefined, splitPaidAmount: 0 })
              return
            }
            onChange({ splitPaymentMethod: splitBucket, splitWalletType: undefined, splitPaidAmount: 0 })
          }}
        />
      </div>

      {isSplitting && (
        <div className='space-y-3 border-t border-blue-200 pt-3 dark:border-blue-900'>
          <div className='grid grid-cols-2 gap-3'>
            {splitBucket === 'wallet' && (
              <div className='space-y-1.5'>
                <Label className='text-xs text-muted-foreground'>Split Account</Label>
                <Select
                  value={value.splitWalletType || ''}
                  onValueChange={(v) => onChange({ ...value, splitWalletType: v })}
                >
                  <SelectTrigger className='w-full bg-background'>
                    <SelectValue placeholder='Select account' />
                  </SelectTrigger>
                  <SelectContent>
                    {realWallets.map((w) => (
                      <SelectItem key={w.type} value={w.type}>
                        {w.type}{showBalance && w.balance != null ? ` (${fmt(w.balance)})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className={`space-y-1.5 ${splitBucket === 'cash' ? 'col-span-2' : ''}`}>
              <Label className='text-xs text-muted-foreground'>
                {splitBucket === 'cash' ? 'Cash Amount' : 'Amount Via'}
              </Label>
              <Input
                type='text'
                inputMode='decimal'
                showVoiceInput={false}
                value={value.splitPaidAmount || ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.]/g, '')
                  const num = Math.max(0, Number(raw) || 0)
                  onChange({ ...value, splitPaidAmount: num })
                }}
                onFocus={(e) => e.target.select()}
                placeholder='0.00'
                className='bg-background'
              />
            </div>
          </div>
          <p className='text-xs text-muted-foreground'>
            {fmt(primaryAmount)} via {primaryMethod === 'cash' ? 'Cash' : 'the selected account'} + {fmt(splitAmount)} via {splitBucket === 'cash' ? 'Cash' : (value.splitWalletType || 'the selected account')} = <span className='font-medium text-foreground'>{fmt(totalPaid)} total paid</span>.
          </p>
        </div>
      )}
    </div>
  )
}
