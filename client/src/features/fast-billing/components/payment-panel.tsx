import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Banknote, Check, ChevronsUpDown, CreditCard, Receipt, User, UserRound, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import type { PaymentMethod } from '../types'
import type { FastBillCustomer } from '../utils/build-invoice-payload'

type CustomerRow = { _id?: string; id?: string; name: string; phone?: string }

function unwrapCustomers(data: unknown): CustomerRow[] {
  if (Array.isArray(data)) return data as CustomerRow[]
  if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: CustomerRow[] }).results
  }
  return []
}

const CASH_QUICK_AMOUNTS = [50, 100, 500, 1000]

type Props = {
  subtotal: number
  discount: number
  onDiscountChange: (v: number) => void
  total: number
  paymentMethod: PaymentMethod
  onPaymentMethodChange: (m: PaymentMethod) => void
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

export function PaymentPanel({
  subtotal,
  discount,
  onDiscountChange,
  total,
  paymentMethod,
  onPaymentMethodChange,
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

  const changeDue = paymentMethod !== 'credit' ? Math.max(0, paidAmount - total) : 0
  const canCharge = itemCount > 0 && !charging && (paymentMethod !== 'credit' || !!customer)

  return (
    <div className='flex flex-col gap-2.5'>
      <div className='flex items-center gap-2'>
        <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant='outline' role='combobox' className='h-8 flex-1 justify-between font-normal'>
              <span className='flex items-center gap-2 truncate'>
                {customer ? <User className='h-3.5 w-3.5' /> : <UserRound className='h-3.5 w-3.5' />}
                <span className='truncate text-xs'>{customer ? customer.name : walkInCustomerName || 'Walk-in Customer'}</span>
              </span>
              <ChevronsUpDown className='h-3.5 w-3.5 shrink-0 opacity-50' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-[--radix-popover-trigger-width] p-2' align='start'>
            <Input
              placeholder='Search customer by name/phone…'
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className='mb-2 h-8'
              autoFocus
            />
            <ScrollArea className='h-56'>
              <button
                type='button'
                onClick={() => {
                  onCustomerChange(null)
                  setCustomerPickerOpen(false)
                }}
                className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted'
              >
                <Badge variant='secondary'>Walk-in Customer</Badge>
              </button>
              {filteredCustomers.map((c) => {
                const id = c._id || c.id || ''
                return (
                  <button
                    key={id}
                    type='button'
                    onClick={() => {
                      onCustomerChange({ id, name: c.name })
                      setCustomerPickerOpen(false)
                    }}
                    className='flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted'
                  >
                    <span className='truncate font-medium'>{c.name}</span>
                    {c.phone && <span className='text-xs text-muted-foreground'>{c.phone}</span>}
                  </button>
                )
              })}
            </ScrollArea>
          </PopoverContent>
        </Popover>
        {!customer && (
          <Input
            placeholder='Walk-in name (optional)'
            value={walkInCustomerName}
            onChange={(e) => onWalkInCustomerNameChange(e.target.value)}
            className='h-8 w-36 text-xs'
          />
        )}
      </div>

      <div className='grid grid-cols-3 gap-1.5'>
        {(
          [
            { key: 'cash' as const, label: 'Cash', icon: Banknote },
            { key: 'card' as const, label: 'Card', icon: CreditCard },
            { key: 'credit' as const, label: 'Credit', icon: Receipt },
          ]
        ).map(({ key, label, icon: Icon }) => {
          const active = paymentMethod === key
          const disabled = key === 'credit' && !customer
          return (
            <Button
              key={key}
              type='button'
              variant={active ? 'default' : 'outline'}
              disabled={disabled}
              title={disabled ? 'Select a registered customer for credit' : undefined}
              className={cn('relative h-9 gap-1.5 text-xs font-medium', active && 'shadow-md')}
              onClick={() => onPaymentMethodChange(key)}
            >
              {active && (
                <span className='absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm'>
                  <Check className='h-2 w-2' strokeWidth={3} />
                </span>
              )}
              <Icon className='h-3.5 w-3.5' />
              {label}
            </Button>
          )
        })}
      </div>

      <div className='flex items-center justify-between gap-2 text-xs'>
        <span className='text-muted-foreground'>Subtotal Rs{subtotal.toFixed(0)}</span>
        <div className='flex items-center gap-1.5'>
          <span className='text-muted-foreground'>Discount</span>
          <Input
            type='number'
            value={discount}
            onChange={(e) => onDiscountChange(Math.max(0, Number(e.target.value) || 0))}
            className='h-6 w-16 px-1 text-right text-xs'
          />
        </div>
      </div>

      {paymentMethod !== 'credit' && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <Input
            type='number'
            value={paidAmount}
            onChange={(e) => onPaidAmountChange(Math.max(0, Number(e.target.value) || 0))}
            className='h-7 w-24 text-xs font-medium'
          />
          <Button type='button' size='sm' variant='secondary' className='h-7 px-2 text-xs' onClick={() => onPaidAmountChange(total)}>
            Exact
          </Button>
          {CASH_QUICK_AMOUNTS.map((amt) => (
            <Button
              key={amt}
              type='button'
              size='sm'
              variant='outline'
              className='h-7 px-2 text-xs'
              onClick={() => onPaidAmountChange(paidAmount + amt)}
            >
              +{amt}
            </Button>
          ))}
          {changeDue > 0 && (
            <span className='ml-auto text-xs font-semibold text-emerald-600 dark:text-emerald-400'>
              Change Rs{changeDue.toFixed(0)}
            </span>
          )}
        </div>
      )}

      <div className='flex items-center gap-2'>
        <div className='flex flex-1 items-center justify-between rounded-lg bg-primary/10 px-3 py-2'>
          <span className='text-xs font-medium text-muted-foreground'>Total</span>
          <span className='text-lg font-bold tabular-nums text-primary'>Rs{total.toFixed(2)}</span>
        </div>
        <Button
          type='button'
          size='lg'
          className='h-12 flex-[2] gap-2 text-base font-bold shadow-lg'
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
