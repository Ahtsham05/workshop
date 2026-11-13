import { useState, type ReactNode } from 'react'
import { ChevronRight, History, Minus, Package, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NumericInput } from '@/components/ui/numeric-input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { getTextClasses } from '@/utils/urdu-text-utils'
import type { DiscountType } from '@/lib/discount'
import { MobileScreen } from './mobile-screen'

export interface MobileLineItem {
  id: string
  productId?: string
  variantId?: string
  name: string
  nameUrdu?: string
  image?: { url?: string } | null
  quantity: number
  unit?: string
  conversionFactor?: number
  unitPrice: number
  discountType?: DiscountType
  discountValue?: number
  discountAmount?: number
  subtotal: number
}

/** Per-line pieces the invoice panel already builds for its desktop rows (stock badge,
 *  branch/warehouse stock, batch picker, serial picker, unit select) — reused as-is so
 *  every product rule keeps working on the phone. */
export interface MobileLineExtras {
  stockBadge?: ReactNode
  branchTrigger?: ReactNode
  batchTags?: ReactNode
  serialTrigger?: ReactNode
  insufficientStockWarning?: ReactNode
  unitSelect?: ReactNode
}

interface MobileLineEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: MobileLineItem | null
  isNew: boolean
  extras: MobileLineExtras | null
  currencySymbol: string
  showUrdu: boolean
  /** This customer's previous prices for the line — the same box as on the laptop, laid
   *  inline. Omitted for walk-in sales. `onClose` collapses it. */
  renderRateHistory?: (onClose: () => void) => ReactNode
  onChangeProduct: () => void
  onQuantity: (qty: number) => void
  onUnitPrice: (price: number) => void
  onDiscount: (patch: { type?: DiscountType; value?: number }) => void
  onSaveClose: () => void
  onSaveNew: () => void
  /** New line: drop it. Existing line: undo this visit's changes. */
  onDiscard: () => void
  onRemove: () => void
}

/**
 * "Create / Edit Invoice line" — Odoo's full-screen line form: Product, Description,
 * Quantity, Unit Price, Disc.% and Amount, with Save & Close / Save & New / Discard at
 * the bottom. Tapping Unit Price shows what this customer paid before (one-tap Use).
 * Every change goes straight through the invoice's own handlers, so stock, batches,
 * unit conversion and totals behave exactly as on the desktop screen.
 */
export function MobileLineEditor({
  open,
  onOpenChange,
  item,
  isNew,
  extras,
  currencySymbol,
  showUrdu,
  renderRateHistory,
  onChangeProduct,
  onQuantity,
  onUnitPrice,
  onDiscount,
  onSaveClose,
  onSaveNew,
  onDiscard,
  onRemove,
}: MobileLineEditorProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [historyOpen, setHistoryOpen] = useState(true)

  const hasProduct = Boolean(item?.productId && item?.name)
  const gross = item ? item.quantity * item.unitPrice : 0
  const isPercent = item?.discountType === 'percentage'
  const canShowHistory = Boolean(hasProduct && renderRateHistory)

  return (
    <MobileScreen
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? t('Create Invoice line') || 'Create Invoice line' : t('Edit Invoice line') || 'Edit Invoice line'}
      footer={
        <div className='space-y-2'>
          <div className='grid grid-cols-2 gap-2'>
            <Button type='button' className='h-11 text-[15px]' disabled={!hasProduct} onClick={onSaveClose}>
              {t('Save & Close') || 'Save & Close'}
            </Button>
            <Button type='button' className='h-11 text-[15px]' variant='outline' disabled={!hasProduct} onClick={onSaveNew}>
              {t('Save & New') || 'Save & New'}
            </Button>
          </div>
          {isNew ? (
            <Button type='button' variant='ghost' className='h-10 w-full text-muted-foreground' onClick={onDiscard}>
              {t('Discard')}
            </Button>
          ) : (
            <div className='grid grid-cols-2 gap-2'>
              <Button type='button' variant='ghost' className='h-10 text-muted-foreground' onClick={onDiscard}>
                {t('Discard changes') || 'Discard changes'}
              </Button>
              <Button type='button' variant='ghost' className='h-10 gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30' onClick={onRemove}>
                <Trash2 className='h-4 w-4' />
                {t('Remove line') || 'Remove line'}
              </Button>
            </div>
          )}
        </div>
      }
      bodyClassName='px-4 pb-6'
    >
      {!item ? null : (
        <div className='divide-y'>
          {/* Product */}
          <div className='py-3'>
            <p className='mb-1 text-[13px] font-medium text-muted-foreground'>
              {t('product') || 'Product'}
              <span className='ml-0.5 text-red-500'>*</span>
            </p>
            <button
              type='button'
              onClick={onChangeProduct}
              className='flex w-full items-center gap-3 rounded-lg border-b-2 border-primary/30 py-1.5 text-left active:bg-muted'
            >
              {item.image?.url ? (
                <img src={item.image.url} alt='' className='h-12 w-12 shrink-0 rounded-lg border object-cover' />
              ) : (
                <span className='flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted'>
                  <Package className='h-5 w-5 text-muted-foreground/60' />
                </span>
              )}
              <span className='min-w-0 flex-1'>
                {hasProduct ? (
                  <>
                    <span className={getTextClasses(item.name, 'block text-[15px] leading-snug font-semibold break-words')}>{item.name}</span>
                    {showUrdu && item.nameUrdu?.trim() ? (
                      <span dir='auto' className='block truncate text-sm text-muted-foreground'>
                        {item.nameUrdu.trim()}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className='text-[15px] text-muted-foreground'>{t('select_product')}</span>
                )}
              </span>
              <ChevronRight className='h-5 w-5 shrink-0 text-muted-foreground' />
            </button>
            {hasProduct && (extras?.stockBadge || extras?.branchTrigger) ? (
              <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                {extras?.stockBadge}
                {extras?.branchTrigger}
              </div>
            ) : null}
            {hasProduct && (extras?.batchTags || extras?.serialTrigger) ? (
              <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                {extras?.batchTags}
                {extras?.serialTrigger}
              </div>
            ) : null}
            {extras?.insufficientStockWarning}
          </div>

          {hasProduct && (
            <>
              {/* Quantity */}
              <div className='py-3'>
                <p className='mb-1.5 text-[13px] font-medium text-muted-foreground'>{t('quantity') || 'Quantity'}</p>
                <div className='flex items-center gap-3'>
                  <div className='flex h-12 items-center overflow-hidden rounded-xl border bg-background'>
                    <button
                      type='button'
                      aria-label={t('Decrease') || 'Decrease'}
                      disabled={item.quantity <= 1}
                      onClick={() => onQuantity(Math.max(1, item.quantity - 1))}
                      className='flex h-full w-12 items-center justify-center border-r text-foreground/80 active:bg-muted disabled:opacity-30'
                    >
                      <Minus className='h-4 w-4' />
                    </button>
                    <NumericInput
                      inputMode='decimal'
                      decimals={false}
                      min={1}
                      emptyValue={null}
                      value={item.quantity}
                      onValueChange={(qty) => qty > 0 && onQuantity(qty)}
                      showVoiceInput={false}
                      aria-label={t('quantity') || 'Quantity'}
                      className='h-full w-20 rounded-none border-0 text-center text-lg font-semibold tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0'
                    />
                    <button
                      type='button'
                      aria-label={t('Increase') || 'Increase'}
                      onClick={() => onQuantity(item.quantity + 1)}
                      className='flex h-full w-12 items-center justify-center border-l text-foreground/80 active:bg-muted'
                    >
                      <Plus className='h-4 w-4' />
                    </button>
                  </div>
                  {extras?.unitSelect ?? <span className='text-sm text-muted-foreground'>{item.unit || 'pcs'}</span>}
                </div>
              </div>

              {/* Unit price + this customer's previous prices */}
              <div className='py-3'>
                <div className='mb-1.5 flex items-center justify-between gap-2'>
                  <p className='text-[13px] font-medium text-muted-foreground'>{t('unit_price') || 'Unit Price'}</p>
                  {canShowHistory && !historyOpen ? (
                    <button
                      type='button'
                      onClick={() => setHistoryOpen(true)}
                      className='inline-flex items-center gap-1 text-[13px] font-medium text-sky-700 dark:text-sky-300'
                    >
                      <History className='h-3.5 w-3.5' />
                      {t('Previous prices') || 'Previous prices'}
                    </button>
                  ) : null}
                </div>
                <div className='flex h-12 items-center overflow-hidden rounded-xl border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'>
                  <span className='flex h-full items-center border-r bg-muted px-3 text-sm font-medium text-muted-foreground'>
                    {currencySymbol}
                  </span>
                  <NumericInput
                    inputMode='decimal'
                    min={0}
                    blankWhenZero
                    value={item.unitPrice}
                    onValueChange={onUnitPrice}
                    onFocus={() => canShowHistory && setHistoryOpen(true)}
                    showVoiceInput={false}
                    placeholder='0.00'
                    aria-label={t('unit_price') || 'Unit Price'}
                    className='h-full min-w-0 flex-1 rounded-none border-0 text-lg font-semibold tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0'
                  />
                </div>
                {canShowHistory && historyOpen ? renderRateHistory?.(() => setHistoryOpen(false)) : null}
              </div>

              {/* Discount */}
              <div className='py-3'>
                <p className='mb-1.5 text-[13px] font-medium text-muted-foreground'>{t('discount') || 'Discount'}</p>
                <div className='flex items-center gap-2'>
                  <div className='flex h-12 min-w-0 flex-1 items-center overflow-hidden rounded-xl border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20'>
                    <NumericInput
                      inputMode='decimal'
                      min={0}
                      max={isPercent ? 100 : undefined}
                      blankWhenZero
                      value={item.discountValue || 0}
                      onValueChange={(value) => onDiscount({ value })}
                      showVoiceInput={false}
                      placeholder='0'
                      aria-label={t('discount') || 'Discount'}
                      className='h-full min-w-0 flex-1 rounded-none border-0 text-lg font-semibold tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0'
                    />
                  </div>
                  <div className='flex h-12 shrink-0 rounded-xl border bg-muted p-1' role='radiogroup' aria-label={t('Discount type') || 'Discount type'}>
                    {(['percentage', 'fixed'] as const).map((type) => {
                      const active = (item.discountType || 'fixed') === type
                      return (
                        <button
                          key={type}
                          type='button'
                          role='radio'
                          aria-checked={active}
                          onClick={() => !active && onDiscount({ type })}
                          className={cn(
                            'min-w-12 rounded-lg px-3 text-sm font-semibold transition-colors',
                            active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                          )}
                        >
                          {type === 'percentage' ? '%' : currencySymbol}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Amount */}
              <div className='flex items-end justify-between gap-3 py-4'>
                <p className='text-[13px] font-medium text-muted-foreground'>{t('Amount') || 'Amount'}</p>
                <div className='text-right'>
                  {(item.discountAmount || 0) > 0 ? (
                    <p className='text-sm text-muted-foreground tabular-nums line-through'>{formatMoney(gross)}</p>
                  ) : null}
                  <p className='text-2xl font-bold tabular-nums'>{formatMoney(item.subtotal)}</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </MobileScreen>
  )
}
