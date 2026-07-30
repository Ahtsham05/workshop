import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Minus, Plus, ShoppingCart, Trash2, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { selectOnFocus } from '../utils/select-on-focus'
import { stockBadgeClasses, stockDotClasses, stockLabel } from '../utils/stock-badge'
import type { CartLine } from '../types'
import { computeDiscountAmount, type DiscountType } from '@/lib/discount'

type Props = {
  cart: CartLine[]
  onQuantityChange: (key: string, quantity: number) => void
  onPriceChange: (key: string, unitPrice: number) => void
  onItemDiscountChange: (key: string, patch: { type?: DiscountType; value?: number }) => void
  onRemove: (key: string) => void
  highlightKey?: string | null
}

const noSpinner =
  '[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'

export function CartPanel({ cart, onQuantityChange, onPriceChange, onItemDiscountChange, onRemove, highlightKey }: Props) {
  if (cart.length === 0) {
    return (
      <div className='flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center text-muted-foreground'>
        <ShoppingCart className='mb-2 h-10 w-10 opacity-35' />
        <p className='text-sm'>Cart is empty — scan a barcode to start</p>
      </div>
    )
  }

  return (
    <ScrollArea type='always' className='flex-1 min-h-0 pr-2'>
      <ul className='space-y-2'>
        {cart.map((line) => {
          const gross = Math.round(line.unitPrice * line.quantity * 100) / 100
          const lineDiscount = computeDiscountAmount(gross, line.discountType, line.discountValue)
          const lineTotal = Math.round((gross - lineDiscount) * 100) / 100
          const remaining = line.stockQuantity - line.quantity
          const justAdded = highlightKey === line.key
          return (
            <li
              key={line.key}
              className={cn(
                'flex flex-wrap items-center gap-2 overflow-hidden rounded-xl border bg-card p-2 shadow-sm transition-colors duration-500',
                justAdded ? 'border-primary/50 bg-primary/5' : 'border-border',
              )}
            >
              {line.image?.url ? (
                <img src={line.image.url} alt='' className='h-10 w-10 shrink-0 rounded-lg object-cover' />
              ) : (
                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted'>
                  <Package className='h-5 w-5 text-muted-foreground/50' />
                </div>
              )}

              <div className='min-w-[110px] flex-1'>
                <p className='truncate text-sm font-semibold leading-tight'>{line.name}</p>
                <div className='mt-1 flex flex-wrap items-center gap-1.5'>
                  <span className='text-xs text-muted-foreground'>
                    Rs{line.unitPrice} · {line.unit || 'pcs'}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                      stockBadgeClasses(remaining),
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', stockDotClasses(remaining))} />
                    {stockLabel(remaining)}
                  </span>
                </div>
              </div>

              <div className='flex shrink-0 items-center gap-1.5'>
                <div className='flex items-center overflow-hidden rounded-lg border bg-background'>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    className='h-7 w-7 rounded-none border-r p-0 text-muted-foreground hover:bg-muted hover:text-foreground'
                    onClick={() => onQuantityChange(line.key, Math.max(1, line.quantity - 1))}
                  >
                    <Minus className='h-3.5 w-3.5' />
                  </Button>
                  <Input
                    type='number'
                    value={line.quantity}
                    onChange={(e) => onQuantityChange(line.key, Math.max(1, Number(e.target.value) || 1))}
                    onFocus={selectOnFocus}
                    className={cn(
                      'h-7 w-12 rounded-none border-0 text-center text-xs font-semibold focus-visible:ring-0 focus-visible:ring-offset-0',
                      noSpinner,
                    )}
                  />
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    className='h-7 w-7 rounded-none border-l p-0 text-muted-foreground hover:bg-muted hover:text-foreground'
                    onClick={() => onQuantityChange(line.key, line.quantity + 1)}
                  >
                    <Plus className='h-3.5 w-3.5' />
                  </Button>
                </div>

                <span className='select-none text-sm text-muted-foreground/60'>×</span>

                <div className='flex items-center overflow-hidden rounded-lg border bg-background'>
                  <span className='flex h-7 select-none items-center border-r bg-muted px-2 text-xs font-medium text-muted-foreground'>
                    Rs
                  </span>
                  <Input
                    type='number'
                    value={line.unitPrice}
                    onChange={(e) => onPriceChange(line.key, Math.max(0, Number(e.target.value) || 0))}
                    onFocus={selectOnFocus}
                    className={cn(
                      'h-7 w-16 rounded-none border-0 text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0',
                      noSpinner,
                    )}
                  />
                </div>

                <span className='select-none text-sm text-muted-foreground/60'>−</span>

                <div className='flex items-center overflow-hidden rounded-lg border bg-background'>
                  <Input
                    type='number'
                    value={line.discountValue || ''}
                    placeholder='0'
                    onChange={(e) => onItemDiscountChange(line.key, { value: Math.max(0, Number(e.target.value) || 0) })}
                    onFocus={selectOnFocus}
                    className={cn(
                      'h-7 w-12 rounded-none border-0 text-center text-xs font-semibold focus-visible:ring-0 focus-visible:ring-offset-0',
                      noSpinner,
                    )}
                  />
                  <button
                    type='button'
                    onClick={() =>
                      onItemDiscountChange(line.key, { type: line.discountType === 'percentage' ? 'fixed' : 'percentage' })
                    }
                    title='Click to switch between Rs and % discount'
                    className='flex h-7 select-none items-center border-l bg-muted px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground'
                  >
                    {line.discountType === 'percentage' ? '%' : 'Rs'}
                  </button>
                </div>

                <span className='select-none text-sm text-muted-foreground/60'>=</span>
                <div className='w-16 shrink-0 text-right'>
                  {lineDiscount > 0 && (
                    <p className='text-[10px] leading-none text-muted-foreground line-through'>Rs{gross.toFixed(0)}</p>
                  )}
                  <span className='text-sm font-bold tabular-nums'>Rs{lineTotal.toFixed(0)}</span>
                </div>

                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  className='h-7 w-7 shrink-0 p-0 hover:bg-red-50 dark:hover:bg-red-950/30'
                  onClick={() => onRemove(line.key)}
                >
                  <Trash2 className='h-3.5 w-3.5 text-red-400 hover:text-red-600' />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}
