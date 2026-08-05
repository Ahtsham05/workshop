import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Minus, Package, Plus, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { selectOnFocus } from '../utils/select-on-focus'
import { stockBadgeClasses, stockDotClasses, stockLabel } from '../utils/stock-badge'
import { getDefaultBatch } from '../types'

type Props = {
  item: PurchaseCatalogItem | null
  onClose: () => void
  onConfirm: (item: PurchaseCatalogItem, quantity: number, unitPrice: number) => void
  /** Called once the dialog has actually finished closing — the right moment to refocus
   * something outside it (e.g. the scan input), since Radix's own close-focus restoration
   * fires later and would otherwise steal focus back to whatever opened the dialog. */
  onAfterClose?: () => void
}

const noSpinner =
  '[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'

export function AddToCartDialog({ item, onClose, onConfirm, onAfterClose }: Props) {
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const qtyRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!item) return
    setQuantity(1)
    // Default to the auto-picked batch's own selling price when the product is
    // batch-tracked — a batch can carry its own intended retail price recorded at
    // purchase time, same default invoice-panel.tsx uses.
    const batch = getDefaultBatch(item)
    setUnitPrice(batch?.sellingPrice ?? item.price)
    requestAnimationFrame(() => {
      qtyRef.current?.focus()
      qtyRef.current?.select()
    })
  }, [item])

  if (!item) return null

  const subtotal = Math.round(quantity * unitPrice * 100) / 100
  const overStock = quantity > item.stockQuantity

  const confirm = () => {
    if (quantity <= 0) return
    onConfirm(item, quantity, unitPrice)
  }

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className='overflow-hidden p-0 sm:max-w-sm'
        onCloseAutoFocus={(e) => {
          // Suppress Radix's default of returning focus to whatever triggered the dialog
          // (e.g. a product card's "+" button), and take over ourselves — this fires once
          // the dialog has actually unmounted, so it's the only reliable time to refocus.
          e.preventDefault()
          onAfterClose?.()
        }}
      >
        <DialogHeader className='space-y-0 bg-muted/40 px-5 pb-4 pt-5'>
          <DialogTitle className='flex items-center gap-3 text-left'>
            <div className='flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background shadow-sm'>
              {item.image?.url ? (
                <img src={item.image.url} alt='' className='h-full w-full object-cover' />
              ) : (
                <Package className='h-6 w-6 text-muted-foreground/50' />
              )}
            </div>
            <div className='min-w-0'>
              <p className='truncate text-base font-semibold leading-tight'>{item.name}</p>
              <div className='mt-1 flex flex-wrap items-center gap-1.5'>
                <span className='text-xs text-muted-foreground'>
                  Rs{item.price} · {item.unit || 'pcs'}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                    stockBadgeClasses(item.stockQuantity),
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', stockDotClasses(item.stockQuantity))} />
                  {stockLabel(item.stockQuantity)}
                </span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className='space-y-4 px-5 pb-5 pt-1'>
          <div className='space-y-1.5'>
            <Label className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>Quantity</Label>
            <div className='flex items-center overflow-hidden rounded-lg border bg-background'>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                className='h-11 w-11 shrink-0 rounded-none border-r text-muted-foreground hover:bg-muted hover:text-foreground'
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus className='h-4 w-4' />
              </Button>
              <Input
                ref={qtyRef}
                type='number'
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                onFocus={selectOnFocus}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    priceRef.current?.focus()
                    priceRef.current?.select()
                  }
                }}
                className={cn(
                  'h-11 rounded-none border-0 text-center text-lg font-semibold focus-visible:ring-0 focus-visible:ring-offset-0',
                  noSpinner,
                )}
              />
              <Button
                type='button'
                size='icon'
                variant='ghost'
                className='h-11 w-11 shrink-0 rounded-none border-l text-muted-foreground hover:bg-muted hover:text-foreground'
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus className='h-4 w-4' />
              </Button>
            </div>
            {overStock && <p className='text-xs font-medium text-destructive'>Only {item.stockQuantity} in stock</p>}
          </div>

          <div className='space-y-1.5'>
            <Label className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
              Unit price (Rs)
            </Label>
            <div className='flex items-center overflow-hidden rounded-lg border bg-background'>
              <span className='flex h-11 select-none items-center border-r bg-muted px-3 text-sm font-medium text-muted-foreground'>
                Rs
              </span>
              <Input
                ref={priceRef}
                type='number'
                value={unitPrice}
                onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value) || 0))}
                onFocus={selectOnFocus}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    confirm()
                  }
                }}
                className={cn(
                  'h-11 rounded-none border-0 text-lg font-semibold focus-visible:ring-0 focus-visible:ring-offset-0',
                  noSpinner,
                )}
              />
            </div>
          </div>

          <div className='flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5'>
            <span className='text-sm font-medium text-muted-foreground'>Subtotal</span>
            <span className='text-xl font-bold tabular-nums'>Rs{subtotal.toFixed(2)}</span>
          </div>

          <Button type='button' size='lg' className='h-12 w-full gap-2 text-base font-semibold' onClick={confirm}>
            <Zap className='h-4 w-4' />
            Add to Cart
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
