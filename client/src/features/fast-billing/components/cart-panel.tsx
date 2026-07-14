import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Minus, Plus, ShoppingCart, X, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CartLine } from '../types'

type Props = {
  cart: CartLine[]
  onQuantityChange: (key: string, quantity: number) => void
  onPriceChange: (key: string, unitPrice: number) => void
  onRemove: (key: string) => void
  highlightKey?: string | null
}

export function CartPanel({ cart, onQuantityChange, onPriceChange, onRemove, highlightKey }: Props) {
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
          const lineTotal = Math.round(line.unitPrice * line.quantity * 100) / 100
          const overStock = line.quantity > line.stockQuantity
          const justAdded = highlightKey === line.key
          return (
            <li
              key={line.key}
              className={cn(
                'rounded-lg border p-2.5 shadow-sm transition-colors duration-500',
                justAdded ? 'border-primary/50 bg-primary/5' : 'border-border/70 bg-card',
              )}
            >
              <div className='flex items-start gap-2.5'>
                <div className='flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted'>
                  {line.image?.url ? (
                    <img src={line.image.url} alt='' className='h-full w-full object-cover' />
                  ) : (
                    <Package className='h-4.5 w-4.5 text-muted-foreground/50' />
                  )}
                </div>

                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-semibold leading-tight'>{line.name}</p>
                  <div className='mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground'>
                    {line.unit && <span>{line.unit}</span>}
                    {overStock && <span className='font-medium text-destructive'>· only {line.stockQuantity} in stock</span>}
                  </div>
                </div>

                <span className='shrink-0 text-base font-bold tabular-nums'>Rs{lineTotal.toFixed(0)}</span>

                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='-mr-1 -mt-1 h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive'
                  onClick={() => onRemove(line.key)}
                >
                  <X className='h-3.5 w-3.5' />
                </Button>
              </div>

              <div className='mt-2 flex items-center justify-between gap-2 border-t border-border/50 pt-2 pl-[50px]'>
                <div className='flex items-center gap-1'>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    className='h-7 w-7'
                    onClick={() => onQuantityChange(line.key, Math.max(1, line.quantity - 1))}
                  >
                    <Minus className='h-3.5 w-3.5' />
                  </Button>
                  <Input
                    type='number'
                    value={line.quantity}
                    onChange={(e) => onQuantityChange(line.key, Math.max(1, Number(e.target.value) || 1))}
                    className='h-7 w-12 px-1 text-center text-xs font-medium'
                  />
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    className='h-7 w-7'
                    onClick={() => onQuantityChange(line.key, line.quantity + 1)}
                  >
                    <Plus className='h-3.5 w-3.5' />
                  </Button>
                </div>

                <div className='flex items-center gap-1.5'>
                  <span className='text-xs text-muted-foreground'>@ Rs</span>
                  <Input
                    type='number'
                    value={line.unitPrice}
                    onChange={(e) => onPriceChange(line.key, Math.max(0, Number(e.target.value) || 0))}
                    className='h-7 w-20 px-1.5 text-right text-xs font-medium'
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}
