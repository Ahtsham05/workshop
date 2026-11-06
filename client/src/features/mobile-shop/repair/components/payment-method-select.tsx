import { useMemo } from 'react'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { useCurrencyMeta } from '@/lib/format-money'
import {
  buildMergedPaymentOptions,
  getWalletTypeFromOptionValue,
  isWalletOptionValue,
  toWalletOptionValue,
} from '@/lib/wallet-payment-options'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface PaymentChoice {
  paymentMethod: string
  walletType: string
}

/**
 * Cash in Hand + every named bank account / mobile wallet. `moneyOut` shows balances
 * (paying for a part, giving a refund); money coming in hides them.
 */
export function PaymentMethodSelect({
  value,
  onChange,
  moneyOut = false,
  id,
  className,
}: {
  value: PaymentChoice
  onChange: (next: PaymentChoice) => void
  moneyOut?: boolean
  id?: string
  className?: string
}) {
  const currencyMeta = useCurrencyMeta()
  const { data: walletsData } = useGetWalletsQuery()
  const options = useMemo(() => {
    const wallets = walletsData?.results?.filter((w) => w.isActive) ?? []
    return buildMergedPaymentOptions(
      [{ value: 'cash', label: 'Cash' }],
      wallets,
      moneyOut,
      currencyMeta
    )
  }, [walletsData, moneyOut, currencyMeta])

  const selected =
    value.paymentMethod === 'wallet' && value.walletType
      ? toWalletOptionValue(value.walletType)
      : value.paymentMethod

  return (
    <Select
      value={selected}
      onValueChange={(v) =>
        isWalletOptionValue(v)
          ? onChange({
              paymentMethod: 'wallet',
              walletType: getWalletTypeFromOptionValue(v),
            })
          : onChange({ paymentMethod: v, walletType: '' })
      }
    >
      <SelectTrigger id={id} className={className ?? 'w-full'}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
