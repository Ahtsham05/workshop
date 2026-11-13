import { useEffect, useRef, useState } from 'react'
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Minus, Package, Plus, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { CustomerRateHistoryPanel } from '@/features/invoice/components/customer-rate-history-panel'
import {
  RATE_HISTORY_ANCHOR_ATTR,
  RATE_HISTORY_AUTO_OPEN_MIN_WIDTH,
  readRateHistoryAutoOpen,
  writeRateHistoryAutoOpen,
} from '@/features/invoice/components/customer-rate-history-prefs'
import type { FastBillCustomer } from '../utils/build-invoice-payload'
import { useRateBoxCustomer } from '../utils/use-rate-box-customer'
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
  /** Selected customer — the price field then shows what they paid for this product before. */
  customer?: FastBillCustomer
}

const noSpinner =
  '[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'

export function AddToCartDialog({ item, onClose, onConfirm, onAfterClose, customer }: Props) {
  const formatMoney = useFormatMoney()
  const currencySymbol = useCurrencyMeta().symbol
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const qtyRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)
  // Rate-history box beside the price field (same box as New Invoice / the cart rows).
  const [rateBoxOpen, setRateBoxOpen] = useState(false)
  const [rateAutoOpen, setRateAutoOpen] = useState(readRateHistoryAutoOpen)
  const openRateBox = (auto: boolean) => {
    if (!customer?.id) return
    if (auto && (!rateAutoOpen || window.innerWidth < RATE_HISTORY_AUTO_OPEN_MIN_WIDTH)) return
    setRateBoxOpen(true)
  }
  const { boxCustomer, customerBalance, loadingBalance } = useRateBoxCustomer(customer, Boolean(item && rateBoxOpen))

  useEffect(() => {
    setRateBoxOpen(false)
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
        {/* pr-12 keeps the name clear of the dialog's ✕ button. */}
        <DialogHeader className='space-y-0 border-b bg-muted/40 py-4 pl-5 pr-12'>
          <DialogTitle className='flex items-center gap-3 text-left'>
            <div className='flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background shadow-sm'>
              {item.image?.url ? (
                <img src={item.image.url} alt='' className='h-full w-full object-cover' />
              ) : (
                <Package className='h-6 w-6 text-muted-foreground/50' />
              )}
            </div>
            <div className='min-w-0 flex-1'>
              {/* Two lines, then ellipsis — the full name on hover — so long names stay readable. */}
              <p className='line-clamp-2 break-words text-base font-semibold leading-snug' title={item.name}>
                {item.name}
              </p>
              <div className='mt-1 flex flex-wrap items-center gap-1.5'>
                <span className='text-xs text-muted-foreground'>
                  {formatMoney(item.price)} · {item.unit || 'pcs'}
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
              <NumericInput
                ref={qtyRef}
                min={1}
                emptyValue={null}
                value={quantity}
                onValueChange={setQuantity}
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
            {overStock && (
              <p className='text-xs font-medium text-destructive'>
                {item.stockQuantity > 0 ? `Only ${item.stockQuantity} in stock` : 'Out of stock'} — this sale goes over stock
              </p>
            )}
          </div>

          <div className='space-y-1.5'>
            <Label className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
              Unit price ({currencySymbol})
            </Label>
            <div className='flex items-center overflow-hidden rounded-lg border bg-background'>
              <span className='flex h-11 select-none items-center border-r bg-muted px-3 text-sm font-medium text-muted-foreground'>
                {currencySymbol}
              </span>
              <NumericInput
                ref={priceRef}
                {...{ [RATE_HISTORY_ANCHOR_ATTR]: '' }}
                onFocus={() => openRateBox(true)}
                onClick={() => openRateBox(true)}
                min={0}
                value={unitPrice}
                onValueChange={setUnitPrice}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setRateBoxOpen(false)
                    confirm()
                  }
                }}
                className={cn(
                  'h-11 rounded-none border-0 text-lg font-semibold focus-visible:ring-0 focus-visible:ring-offset-0',
                  noSpinner,
                )}
              />
            </div>
            {unitPrice <= 0 && (
              <p className='text-xs font-medium text-amber-600 dark:text-amber-500'>
                No sale price set — enter the price to charge
              </p>
            )}
          </div>

          <div className='flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5'>
            <span className='shrink-0 text-sm font-medium text-muted-foreground'>Subtotal</span>
            <span className='min-w-0 truncate text-xl font-bold tabular-nums'>{formatMoney(subtotal)}</span>
          </div>

          <Button type='button' size='lg' className='h-12 w-full gap-2 text-base font-semibold' onClick={confirm}>
            <Zap className='h-4 w-4' />
            Add to Cart
          </Button>
        </div>

        {/* Rendered inside the dialog so Radix treats it as a child layer: Esc closes the box
            first, and clicks in it don't close the dialog. */}
        {boxCustomer && rateBoxOpen ? (
          <CustomerRateHistoryPanel
            open
            onOpenChange={(next) => !next && setRateBoxOpen(false)}
            anchor={priceRef.current}
            side='right'
            // px-5 (20px) dialog padding + 12px gap → the box sits clear of the dialog.
            sideOffset={32}
            customer={boxCustomer}
            customerBalance={customerBalance}
            loadingBalance={loadingBalance}
            line={{
              productId: item.productId,
              variantId: item.variantId,
              name: item.name,
              nameUrdu: item.nameUrdu,
              quantity,
              unit: item.unit,
              unitPrice,
              cost: item.cost ?? 0,
            }}
            listPrice={item.price}
            showCost={false}
            onApplyRate={setUnitPrice}
            autoOpen={rateAutoOpen}
            onAutoOpenChange={(value) => {
              setRateAutoOpen(value)
              writeRateHistoryAutoOpen(value)
            }}
            onReturnFocus={() =>
              requestAnimationFrame(() => {
                priceRef.current?.focus()
                priceRef.current?.select()
              })
            }
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
