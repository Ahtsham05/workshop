import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Minus, Package, Plus, Zap } from 'lucide-react'
import type { PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'

type Props = {
  item: PurchaseCatalogItem | null
  onClose: () => void
  onConfirm: (item: PurchaseCatalogItem, quantity: number, unitPrice: number) => void
}

export function AddToCartDialog({ item, onClose, onConfirm }: Props) {
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const qtyRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!item) return
    setQuantity(1)
    setUnitPrice(item.price)
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
        className='sm:max-w-sm'
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            confirm()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className='flex items-center gap-3 text-left'>
            <div className='flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted'>
              {item.image?.url ? (
                <img src={item.image.url} alt='' className='h-full w-full object-cover' />
              ) : (
                <Package className='h-5 w-5 text-muted-foreground/50' />
              )}
            </div>
            <div className='min-w-0'>
              <p className='truncate text-base font-semibold leading-tight'>{item.name}</p>
              <p className='text-xs font-normal text-muted-foreground'>
                Stock {item.stockQuantity} {item.unit ? `· ${item.unit}` : ''}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className='space-y-4 pt-1'>
          <div className='space-y-1.5'>
            <Label className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>Quantity</Label>
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                size='icon'
                className='h-11 w-11 shrink-0'
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus className='h-4 w-4' />
              </Button>
              <Input
                ref={qtyRef}
                type='number'
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className='h-11 text-center text-lg font-semibold'
              />
              <Button
                type='button'
                variant='outline'
                size='icon'
                className='h-11 w-11 shrink-0'
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
            <Input
              type='number'
              value={unitPrice}
              onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value) || 0))}
              className='h-11 text-lg font-semibold'
            />
          </div>

          <div className='flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2.5'>
            <span className='text-sm font-medium text-muted-foreground'>Subtotal</span>
            <span className='text-xl font-bold tabular-nums text-primary'>Rs{subtotal.toFixed(2)}</span>
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
