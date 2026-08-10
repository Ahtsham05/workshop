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
  /** Total being paid right now — the split amount can never exceed this. */
  paidAmount: number
  value: SplitPaymentValue
  onChange: (patch: SplitPaymentValue) => void
}

/**
 * Optional "paid partly via a second account" affordance for Invoice/Purchase forms — e.g. a
 * customer pays Rs 2,000 cash + Rs 3,000 via JazzCash in one sale. The split leg is always the
 * opposite bucket (cash vs wallet) from the primary Payment Method, so each leg lands in a
 * different ledger (Cash Book vs Wallet Entry) and the two can never collide.
 */
export function SplitPaymentFields({ primaryMethod, wallets, paidAmount, value, onChange }: SplitPaymentFieldsProps) {
  const splitBucket: 'cash' | 'wallet' = primaryMethod === 'wallet' ? 'cash' : 'wallet'
  const isSplitting = Boolean(value.splitPaymentMethod)
  const splitAmount = Math.min(Number(value.splitPaidAmount || 0), paidAmount)
  const primaryAmount = Math.max(0, paidAmount - (isSplitting ? splitAmount : 0))

  const realWallets = wallets.filter((w) => w.isActive !== false && w.accountType !== 'cash')

  if (paidAmount <= 0) return null

  return (
    <div className='space-y-3 rounded-lg border p-3'>
      <div className='flex items-center justify-between'>
        <Label htmlFor='split-payment-toggle' className='text-sm font-medium'>
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
        <div className='space-y-3'>
          <div className='grid grid-cols-2 gap-3'>
            {splitBucket === 'wallet' && (
              <div className='space-y-1.5'>
                <Label className='text-xs text-muted-foreground'>Split Account</Label>
                <Select
                  value={value.splitWalletType || ''}
                  onValueChange={(v) => onChange({ ...value, splitWalletType: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select account' />
                  </SelectTrigger>
                  <SelectContent>
                    {realWallets.map((w) => (
                      <SelectItem key={w.type} value={w.type}>
                        {w.type}{w.balance != null ? ` (${fmt(w.balance)})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className={`space-y-1.5 ${splitBucket === 'cash' ? 'col-span-2' : ''}`}>
              <Label className='text-xs text-muted-foreground'>
                {splitBucket === 'cash' ? 'Cash Amount' : 'Amount via this Account'}
              </Label>
              <Input
                type='text'
                inputMode='decimal'
                value={value.splitPaidAmount || ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.]/g, '')
                  const num = Math.min(Number(raw) || 0, paidAmount)
                  onChange({ ...value, splitPaidAmount: num })
                }}
                placeholder='0.00'
              />
            </div>
          </div>
          <p className='text-xs text-muted-foreground'>
            {fmt(primaryAmount)} via {primaryMethod === 'cash' ? 'Cash' : 'the selected account'}, {fmt(splitAmount)} via {splitBucket === 'cash' ? 'Cash' : (value.splitWalletType || 'the selected account')}.
          </p>
        </div>
      )}
    </div>
  )
}
