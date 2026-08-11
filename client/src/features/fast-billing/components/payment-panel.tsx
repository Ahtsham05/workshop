import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import { Banknote, Check, ChevronsUpDown, Receipt, User, Wallet, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import { selectOnFocus } from '../utils/select-on-focus'
import type { PaymentMethod, SaleType } from '../types'
import type { FastBillCustomer } from '../utils/build-invoice-payload'
import type { DiscountType } from '@/lib/discount'
import {
  buildMergedPaymentOptions,
  getWalletTypeFromOptionValue,
  isWalletOptionValue,
  toWalletOptionValue,
  type WalletLike,
} from '@/lib/wallet-payment-options'
import { SplitPaymentFields, type SplitPaymentValue } from '@/components/split-payment-fields'

type CustomerRow = {
  _id?: string
  id?: string
  name: string
  phone?: string
  picture?: { url?: string | null; publicId?: string | null } | null
}

function unwrapCustomers(data: unknown): CustomerRow[] {
  if (Array.isArray(data)) return data as CustomerRow[]
  if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: CustomerRow[] }).results
  }
  return []
}

const CASH_QUICK_AMOUNTS = [50, 100, 500, 1000]

const SALE_TYPE_STYLES: Record<SaleType, { active: string; badge: string }> = {
  cash: {
    active: 'border-emerald-600 bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-500',
    badge: 'bg-emerald-500',
  },
  credit: {
    active: 'border-violet-600 bg-violet-600 text-white shadow-violet-600/30 hover:bg-violet-500',
    badge: 'bg-violet-500',
  },
}

type Props = {
  subtotal: number
  itemDiscountTotal: number
  discountType: DiscountType
  discountValue: number
  onDiscountChange: (patch: { type?: DiscountType; value?: number }) => void
  discount: number
  total: number
  saleType: SaleType
  onSaleTypeChange: (t: SaleType) => void
  paymentMethod: PaymentMethod
  walletType: string
  onPaymentMethodChange: (method: PaymentMethod, walletType?: string) => void
  wallets: WalletLike[]
  splitPaymentMethod?: 'cash' | 'wallet'
  splitWalletType?: string
  splitPaidAmount?: number
  onSplitPaymentChange: (patch: SplitPaymentValue) => void
  customer: FastBillCustomer
  onCustomerChange: (c: FastBillCustomer) => void
  walkInCustomerName: string
  onWalkInCustomerNameChange: (v: string) => void
  paidAmount: number
  onPaidAmountChange: (v: number) => void
  itemCount: number
  onCharge: () => void
  charging: boolean
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className='text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/80'>{children}</p>
  )
}

export function PaymentPanel({
  subtotal,
  itemDiscountTotal,
  discountType,
  discountValue,
  onDiscountChange,
  discount,
  total,
  saleType,
  onSaleTypeChange,
  paymentMethod,
  walletType,
  onPaymentMethodChange,
  wallets,
  splitPaymentMethod,
  splitWalletType,
  splitPaidAmount,
  onSplitPaymentChange,
  customer,
  onCustomerChange,
  walkInCustomerName,
  onWalkInCustomerNameChange,
  paidAmount,
  onPaidAmountChange,
  itemCount,
  onCharge,
  charging,
}: Props) {
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const { data: customersRaw } = useGetAllCustomersQuery(undefined)

  const customers = useMemo(() => unwrapCustomers(customersRaw), [customersRaw])
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers.slice(0, 30)
    return customers
      .filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q))
      .slice(0, 30)
  }, [customers, customerSearch])

  // Sale receives money — never show account balances in this dropdown (money-in form),
  // same rationale as invoice-panel.tsx. No generic 'Card'/'Bank Transfer' placeholder —
  // every real Bank Account / mobile wallet is selectable by its own name.
  const paymentMethodOptions = useMemo(
    () => buildMergedPaymentOptions([{ value: 'cash', label: 'Cash' }], wallets, false),
    [wallets],
  )

  const changeDue = saleType === 'cash' && !splitPaymentMethod ? Math.max(0, paidAmount - total) : 0
  const canCharge = itemCount > 0 && !charging && (saleType !== 'credit' || !!customer)

  return (
    <div className='flex flex-col gap-3.5'>
      <div className='space-y-1.5'>
        <SectionLabel>Customer</SectionLabel>
        <div className='flex items-center gap-2'>
          <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                role='combobox'
                className='h-10 flex-1 justify-between border-border/80 bg-background font-normal shadow-sm'
              >
                <span className='flex min-w-0 items-center gap-2'>
                  {customer ? (
                    <ContactPhotoCell picture={undefined} name={customer.name} className='h-6 w-6 shrink-0' />
                  ) : (
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted'>
                      <User className='h-3.5 w-3.5 text-muted-foreground' />
                    </span>
                  )}
                  <span className='truncate text-sm font-medium'>
                    {customer ? customer.name : walkInCustomerName || 'Walk-in Customer'}
                  </span>
                </span>
                <ChevronsUpDown className='h-3.5 w-3.5 shrink-0 opacity-50' />
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-[--radix-popover-trigger-width] p-0' align='start'>
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder='Search customer by name or phone…'
                  value={customerSearch}
                  onValueChange={setCustomerSearch}
                />
                <CommandList className='max-h-64'>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        onCustomerChange(null)
                        setCustomerPickerOpen(false)
                        setCustomerSearch('')
                      }}
                      className='cursor-pointer gap-2 py-2'
                    >
                      <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted'>
                        <User className='h-3.5 w-3.5 text-muted-foreground' />
                      </span>
                      <span className='flex-1 font-medium'>Walk-in Customer</span>
                      {!customer && <Check className='h-4 w-4 shrink-0 text-primary' />}
                    </CommandItem>
                  </CommandGroup>
                  {filteredCustomers.length === 0 ? (
                    <CommandEmpty>No customers found</CommandEmpty>
                  ) : (
                    <CommandGroup heading='Customers'>
                      {filteredCustomers.map((c) => {
                        const id = c._id || c.id || ''
                        const isSelected = customer?.id === id
                        return (
                          <CommandItem
                            key={id}
                            value={`${c.name} ${c.phone ?? ''} ${id}`}
                            onSelect={() => {
                              onCustomerChange({ id, name: c.name })
                              setCustomerPickerOpen(false)
                              setCustomerSearch('')
                            }}
                            className='cursor-pointer gap-2.5 py-2'
                          >
                            <ContactPhotoCell picture={c.picture} name={c.name || ''} className='h-7 w-7 shrink-0' />
                            <span className='flex min-w-0 flex-1 flex-col gap-0'>
                              <span className='truncate text-sm font-medium leading-tight'>{c.name}</span>
                              {c.phone && (
                                <span className='truncate text-xs text-muted-foreground leading-tight'>{c.phone}</span>
                              )}
                            </span>
                            {isSelected && <Check className='h-4 w-4 shrink-0 text-primary' />}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {!customer && (
            <Input
              placeholder='Walk-in name (optional)'
              value={walkInCustomerName}
              onChange={(e) => onWalkInCustomerNameChange(e.target.value)}
              onFocus={selectOnFocus}
              className='h-10 w-36 text-xs shadow-sm'
            />
          )}
        </div>
      </div>

      <div className='space-y-1.5 border-t border-border/60 pt-3'>
        <SectionLabel>Sale Type</SectionLabel>
        <div className='grid grid-cols-2 gap-1.5'>
          {(
            [
              { key: 'cash' as const, label: 'Cash Sale', icon: Banknote },
              { key: 'credit' as const, label: 'Credit', icon: Receipt },
            ]
          ).map(({ key, label, icon: Icon }) => {
            const active = saleType === key
            const disabled = key === 'credit' && !customer
            const style = SALE_TYPE_STYLES[key]
            return (
              <Button
                key={key}
                type='button'
                variant='outline'
                disabled={disabled}
                title={disabled ? 'Select a registered customer for credit' : undefined}
                className={cn(
                  'relative h-9 gap-1.5 border-border/80 text-xs font-medium shadow-sm',
                  active && cn(style.active, 'shadow-md'),
                )}
                onClick={() => onSaleTypeChange(key)}
              >
                {active && (
                  <span
                    className={cn(
                      'absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-white shadow-sm',
                      style.badge,
                    )}
                  >
                    <Check className='h-2 w-2' strokeWidth={3} />
                  </span>
                )}
                <Icon className='h-3.5 w-3.5' />
                {label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className='space-y-1.5 border-t border-border/60 pt-3'>
        <SectionLabel>Pay Via</SectionLabel>
        <Select
          value={paymentMethod === 'wallet' && walletType ? toWalletOptionValue(walletType) : 'cash'}
          onValueChange={(val) => {
            if (isWalletOptionValue(val)) {
              onPaymentMethodChange('wallet', getWalletTypeFromOptionValue(val))
            } else {
              onPaymentMethodChange('cash', undefined)
            }
          }}
        >
          <SelectTrigger className='h-9 text-xs'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {paymentMethodOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {wallets.length === 0 && (
          <p className='text-xs text-muted-foreground'>No bank accounts configured — add one from the Bank Accounts page.</p>
        )}

        <p className='mt-2 text-xs text-muted-foreground'>
          {saleType === 'credit' ? 'Paid Now (optional)' : 'Paid Amount'}
        </p>
        {saleType === 'credit' && (
          <p className='text-[11px] text-muted-foreground'>
            Optional down payment collected now — the rest stays on the customer&apos;s account.
          </p>
        )}
        <div className='flex flex-wrap items-center gap-1.5'>
          <Input
            type='number'
            value={paidAmount}
            onChange={(e) => onPaidAmountChange(Math.max(0, Number(e.target.value) || 0))}
            onFocus={selectOnFocus}
            className='h-8 w-24 text-xs font-medium shadow-sm'
          />
          <Button
            type='button'
            size='sm'
            className='h-8 bg-teal-600 px-2 text-xs text-white hover:bg-teal-500'
            onClick={() => onPaidAmountChange(total)}
          >
            Exact
          </Button>
          {CASH_QUICK_AMOUNTS.map((amt) => (
            <Button
              key={amt}
              type='button'
              size='sm'
              variant='outline'
              className='h-8 border-amber-200 px-2 text-xs text-amber-700 shadow-sm hover:bg-amber-50 hover:text-amber-800 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950'
              onClick={() => onPaidAmountChange(paidAmount + amt)}
            >
              +{amt}
            </Button>
          ))}
          {changeDue > 0 && (
            <span className='ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400'>
              <Wallet className='h-3 w-3' />
              Change Rs{changeDue.toFixed(0)}
            </span>
          )}
        </div>
      </div>

      <div className='space-y-1.5 border-t border-border/60 pt-3'>
        <div className='flex items-center justify-between'>
          <SectionLabel>Discount</SectionLabel>
          <span className='text-xs text-muted-foreground'>
            Subtotal <span className='font-medium text-foreground'>Rs{subtotal.toFixed(0)}</span>
          </span>
        </div>
        {itemDiscountTotal > 0 && (
          <div className='flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400'>
            <span>Item Discounts</span>
            <span className='font-medium'>-Rs{itemDiscountTotal.toFixed(0)}</span>
          </div>
        )}
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-1.5 text-xs'>
            <span className='text-muted-foreground'>Discount</span>
            <div className='flex items-center overflow-hidden rounded-lg border bg-background shadow-sm'>
              <Input
                type='number'
                value={discountValue || ''}
                placeholder='0'
                onChange={(e) => onDiscountChange({ value: Math.max(0, Number(e.target.value) || 0) })}
                onFocus={selectOnFocus}
                className='h-7 w-16 rounded-none border-0 px-1 text-right text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0'
              />
              <button
                type='button'
                onClick={() => onDiscountChange({ type: discountType === 'percentage' ? 'fixed' : 'percentage' })}
                title='Click to switch between Rs and % discount'
                className='flex h-7 select-none items-center border-l bg-muted px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground'
              >
                {discountType === 'percentage' ? '%' : 'Rs'}
              </button>
            </div>
          </div>
          {discount > 0 && (
            <span className='text-xs font-medium text-emerald-600 dark:text-emerald-400'>-Rs{discount.toFixed(0)}</span>
          )}
        </div>
      </div>

      <SplitPaymentFields
        primaryMethod={paymentMethod}
        wallets={wallets}
        paidAmount={paidAmount}
        showBalance={false}
        value={{ splitPaymentMethod, splitWalletType, splitPaidAmount }}
        onChange={onSplitPaymentChange}
      />

      <div className='flex items-center gap-2 border-t border-border/60 pt-3'>
        <div className='flex flex-1 flex-col justify-center rounded-lg border border-primary/15 bg-primary/10 px-3 py-2'>
          <span className='text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>Total</span>
          <span className='text-lg font-bold leading-tight tabular-nums text-primary'>Rs{total.toFixed(2)}</span>
        </div>
        <Button
          type='button'
          size='lg'
          className='h-[3.25rem] flex-[2] gap-2 text-base font-bold shadow-lg'
          disabled={!canCharge}
          onClick={onCharge}
        >
          <Zap className='h-4.5 w-4.5' />
          {charging ? 'Charging…' : 'Charge'}
        </Button>
      </div>
    </div>
  )
}
