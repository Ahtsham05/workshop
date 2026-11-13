import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Banknote,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Eye,
  FileCheck,
  Loader2,
  MoreVertical,
  Package,
  Pencil,
  Percent,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  ScanBarcode,
  Truck,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { DatePicker } from '@/components/ui/date-picker'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { MobileCameraScanner } from '@/components/mobile-camera-scanner'
import { PrintFormatButton } from '@/components/print-format-button'
import { cn } from '@/lib/utils'
import { getBusinessToday } from '@/lib/business-timezone'
import { useFormatMoney } from '@/lib/format-money'
import type { DiscountType } from '@/lib/discount'
import { useLanguage } from '@/context/language-context'
import { getTextClasses } from '@/utils/urdu-text-utils'
import type { PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import type { PaperSize } from '../../utils/paper-format'
import type { Invoice, InvoiceItem } from '../../index'
import { MobileField } from './mobile-screen'
import { MobileCustomerPicker } from './mobile-customer-picker'
import { formatCustomerAddress, initialTileColor, type ApiRecord } from './mobile-utils'
import { MobileProductPicker } from './mobile-product-picker'
import { MobileLineEditor, type MobileLineExtras } from './mobile-line-editor'

export interface MobilePageAction {
  key: string
  label: string
  icon: ReactNode
  onSelect: () => void
  badge?: number
}

type InvoiceType = 'cash' | 'credit' | 'pending' | 'quotation'

export interface MobileInvoiceFormProps {
  invoice: Invoice
  setInvoice: React.Dispatch<React.SetStateAction<Invoice>>
  isEditing: boolean
  editingInvoiceNumber?: string
  previewedInvoiceNumber?: string
  currencySymbol: string
  showUrdu: boolean

  // Customer
  selectedCustomer: ApiRecord | null
  walkInAllowed: boolean
  customerBalance: number
  loadingBalance: boolean
  customerPicker: {
    open: boolean
    setOpen: (open: boolean) => void
    query: string
    setQuery: (query: string) => void
    visible: ApiRecord[]
    total: number
    loading: boolean
    onSelect: (customer: ApiRecord | 'walk-in') => void
    onCreate?: () => void
  }
  creditStrip: ReactNode
  dueDateField: ReactNode
  updateInvoiceType: (type: InvoiceType) => void

  // Lines
  getLineExtras: (item: InvoiceItem) => MobileLineExtras
  productPicker: {
    query: string
    setQuery: (query: string) => void
    visible: PurchaseCatalogItem[]
    total: number
    catalog: PurchaseCatalogItem[]
    loading: boolean
    warehouseQtyOf?: (productId: string, variantId?: string) => number | null
    warehouseName?: string
    onCreate?: (itemId: string | null) => void
  }
  /** Puts the product on `targetItemId` (or a new line when null); returns the line id. */
  onPickProduct: (targetItemId: string | null, item: PurchaseCatalogItem) => string
  onQuantity: (itemId: string, qty: number) => void
  onUnitPrice: (itemId: string, price: number) => void
  onItemDiscount: (itemId: string, patch: { type?: DiscountType; value?: number }) => void
  onRemoveLine: (itemId: string) => void
  onRestoreLine: (snapshot: InvoiceItem) => void
  onBarcodeSearch?: (barcode: string) => void
  /** The laptop's previous-prices box for a line, rendered inline (null for walk-in). */
  renderRateHistory?: (item: InvoiceItem, onClose: () => void) => ReactNode

  // Totals
  taxRate: number
  hasTaxSystem: boolean
  taxBreakdown: ReactNode
  updateDiscount: (patch: { type?: DiscountType; value?: number }) => void
  setTaxRate: (rate: number) => void
  totalPaidNow: number

  // Tabs
  paymentContent: ReactNode
  otherInfoContent: ReactNode

  // Actions
  canPrint: boolean
  defaultPaperSize: PaperSize
  savingType: 'none' | PaperSize | null
  canSave: boolean
  onConfirm: () => void
  onSaveAndPrint: (paperSize: PaperSize) => void
  onPreview?: () => void
  onBack?: () => void
  pageActions?: MobilePageAction[]
}

const TYPE_OPTIONS: Array<{ value: InvoiceType; labelKey: string; fallback: string; icon: typeof Banknote }> = [
  { value: 'cash', labelKey: 'cash', fallback: 'Cash', icon: Banknote },
  { value: 'credit', labelKey: 'credit', fallback: 'Credit', icon: CreditCard },
  { value: 'pending', labelKey: 'pending', fallback: 'Pending', icon: Truck },
  { value: 'quotation', labelKey: 'quotation', fallback: 'Quotation', icon: FileCheck },
]

type Tab = 'lines' | 'payment' | 'other'

/**
 * New / Edit Invoice on a phone, laid out like Odoo's mobile invoice form: Confirm and a
 * status ribbon up top, the document title, underlined fields (Customer with its address,
 * Invoice Date, Due Date), then Invoice Lines / Payment / Other Info tabs. Lines read as a
 * list (photo, name, qty × price, amount) and open a full-screen line form; Customer and
 * Product open full-screen searches. Every action runs through the same handlers as the
 * desktop panel, so saving, stock, credit limits and printing are unchanged.
 */
export function MobileInvoiceForm(props: MobileInvoiceFormProps) {
  const {
    invoice,
    setInvoice,
    isEditing,
    editingInvoiceNumber,
    previewedInvoiceNumber,
    currencySymbol,
    showUrdu,
    selectedCustomer,
    walkInAllowed,
    customerBalance,
    loadingBalance,
    customerPicker,
    creditStrip,
    dueDateField,
    updateInvoiceType,
    getLineExtras,
    productPicker,
    onPickProduct,
    onQuantity,
    onUnitPrice,
    onItemDiscount,
    onRemoveLine,
    onRestoreLine,
    onBarcodeSearch,
    renderRateHistory,
    taxRate,
    hasTaxSystem,
    taxBreakdown,
    updateDiscount,
    setTaxRate,
    totalPaidNow,
    paymentContent,
    otherInfoContent,
    canPrint,
    defaultPaperSize,
    savingType,
    canSave,
    onConfirm,
    onSaveAndPrint,
    onPreview,
    onBack,
    pageActions = [],
  } = props
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()

  const [tab, setTab] = useState<Tab>('lines')
  const [menuOpen, setMenuOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [editingNumber, setEditingNumber] = useState(false)
  /** Which line the product search fills: an existing line, or a new one (null). */
  const [pickerTarget, setPickerTarget] = useState<{ itemId: string | null } | null>(null)
  const [editor, setEditor] = useState<{ itemId: string; isNew: boolean; snapshot: InvoiceItem | null } | null>(null)

  const lines = useMemo(() => invoice.items.filter((item) => item.productId && item.name), [invoice.items])
  const editorItem = editor ? invoice.items.find((item) => item.id === editor.itemId) ?? null : null
  const itemDiscountTotal = lines.reduce((sum, item) => sum + (item.discountAmount || 0), 0)
  const grossSubtotal = lines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const amountDue = invoice.type === 'quotation' ? 0 : Math.max(0, (Number(invoice.total) || 0) - totalPaidNow)
  const isWalkIn = invoice.customerId === 'walk-in'
  const hasCustomer = Boolean(invoice.customerId) && (walkInAllowed || !isWalkIn)
  const saving = savingType !== null

  const docLabel =
    invoice.type === 'quotation'
      ? t('Quotation') || 'Quotation'
      : invoice.type === 'credit'
        ? t('Credit Invoice') || 'Credit Invoice'
        : invoice.type === 'pending'
          ? t('Pending Invoice') || 'Pending Invoice'
          : t('Customer Invoice') || 'Customer Invoice'
  const status = isEditing ? t('Editing') || 'Editing' : invoice.type === 'quotation' ? t('Draft quote') || 'Draft quote' : t('Draft') || 'Draft'

  const openNewLine = () => setPickerTarget({ itemId: null })

  const handlePick = (catalogItem: PurchaseCatalogItem) => {
    const target = pickerTarget
    setPickerTarget(null)
    productPicker.setQuery('')
    const lineId = onPickProduct(target?.itemId ?? null, catalogItem)
    if (!target?.itemId) setEditor({ itemId: lineId, isNew: true, snapshot: null })
  }

  const openLine = (item: InvoiceItem) => setEditor({ itemId: item.id, isNew: false, snapshot: { ...item } })

  const closeEditor = () => setEditor(null)
  const discardEditor = () => {
    if (!editor) return
    if (editor.isNew) onRemoveLine(editor.itemId)
    else if (editor.snapshot) onRestoreLine(editor.snapshot)
    setEditor(null)
  }

  const customerName = isWalkIn
    ? invoice.walkInCustomerName?.trim() || t('walk_in_customer')
    : selectedCustomer?.name || invoice.customerName || ''
  const customerAddress = isWalkIn ? '' : formatCustomerAddress(selectedCustomer)

  return (
    <div className='-mx-4 -mt-2 min-h-full bg-muted/30 pb-[calc(6.5rem+env(safe-area-inset-bottom))]'>
      {/* Breadcrumb bar */}
      <div className='flex items-center gap-1 bg-background px-2 py-1.5'>
        {onBack ? (
          <button
            type='button'
            onClick={onBack}
            aria-label={t('Back') || 'Back'}
            className='flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 active:bg-muted'
          >
            <ArrowLeft className='h-5 w-5' />
          </button>
        ) : null}
        <p className='min-w-0 flex-1 truncate text-[15px] font-medium'>
          {isEditing ? editingInvoiceNumber || t('Edit Invoice') : t('Draft Invoice') || 'Draft Invoice'}
        </p>
        {pageActions.length > 0 || onPreview ? (
          <button
            type='button'
            onClick={() => setMenuOpen(true)}
            aria-label={t('More actions') || 'More actions'}
            className='flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 active:bg-muted'
          >
            <MoreVertical className='h-5 w-5' />
          </button>
        ) : null}
      </div>

      {/* Control panel: Confirm · Preview … status ribbon */}
      <div className='flex items-center gap-2 border-y bg-background px-3 py-2.5'>
        <Button type='button' className='h-10 gap-1.5 px-5 text-[15px]' disabled={!canSave || saving} onClick={onConfirm}>
          {savingType === 'none' ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
          {isEditing ? t('Update') || 'Update' : t('Confirm') || 'Confirm'}
        </Button>
        {onPreview ? (
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='h-10 w-10'
            disabled={lines.length === 0}
            onClick={onPreview}
            aria-label={t('Preview')}
          >
            <Eye className='h-4 w-4' />
          </Button>
        ) : null}
        <span className='ml-auto inline-flex h-8 items-center bg-muted pr-3 pl-4 text-xs font-semibold text-muted-foreground [clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)]'>
          {status}
        </span>
      </div>

      {/* The document */}
      <div className='bg-background px-4 pt-4 pb-2'>
        <p className='text-[13px] font-medium text-muted-foreground'>{docLabel}</p>
        <div className='flex items-center gap-2'>
          {isEditing ? (
            <h1 className='min-w-0 flex-1 truncate font-mono text-2xl font-semibold tracking-tight'>{editingInvoiceNumber}</h1>
          ) : editingNumber ? (
            <div className='flex flex-1 items-center gap-1 py-1'>
              <Input
                autoFocus
                showVoiceInput={false}
                value={invoice.invoiceNumber ?? previewedInvoiceNumber ?? ''}
                onChange={(e) => setInvoice((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
                onBlur={() => setEditingNumber(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingNumber(false)}
                className='h-10 font-mono text-base'
              />
              {invoice.invoiceNumber ? (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='h-10 w-10'
                  title={t('reset_to_auto_generated') || 'Reset to auto-generated'}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setInvoice((prev) => ({ ...prev, invoiceNumber: undefined }))
                    setEditingNumber(false)
                  }}
                >
                  <RotateCcw className='h-4 w-4' />
                </Button>
              ) : null}
            </div>
          ) : (
            <button type='button' onClick={() => setEditingNumber(true)} className='flex min-w-0 items-center gap-2 text-left'>
              <h1 className='truncate text-[28px] leading-tight font-semibold tracking-tight'>
                {invoice.invoiceNumber?.trim() || t('Draft') || 'Draft'}
              </h1>
              <Pencil className='h-4 w-4 shrink-0 text-muted-foreground' />
            </button>
          )}
        </div>
        {!isEditing && !editingNumber && !invoice.invoiceNumber?.trim() && previewedInvoiceNumber ? (
          <p className='mt-0.5 text-xs text-muted-foreground'>
            {t('Will be saved as') || 'Will be saved as'} <span className='font-mono'>{previewedInvoiceNumber}</span>
          </p>
        ) : null}

        {/* Sale type */}
        <div className='mt-4 grid grid-cols-4 gap-1 rounded-xl bg-muted p-1' role='radiogroup' aria-label={t('invoice_type')}>
          {TYPE_OPTIONS.map(({ value, labelKey, fallback, icon: Icon }) => {
            const active = invoice.type === value
            const disabled = (value === 'credit' || value === 'pending') && isWalkIn
            return (
              <button
                key={value}
                type='button'
                role='radio'
                aria-checked={active}
                disabled={disabled}
                onClick={() => updateInvoiceType(value)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-35',
                  active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                )}
              >
                <Icon className='h-4 w-4' />
                {t(labelKey) || fallback}
              </button>
            )
          })}
        </div>

        {/* Customer */}
        <MobileField label={t('customer') || 'Customer'} required className='mt-2'>
          <button
            type='button'
            onClick={() => customerPicker.setOpen(true)}
            className={cn(
              'flex w-full items-center gap-2 border-b py-1.5 text-left',
              hasCustomer ? 'border-border' : 'border-red-400',
            )}
          >
            {hasCustomer ? (
              <>
                {isWalkIn ? (
                  <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-500 text-white'>
                    <User className='h-4 w-4' />
                  </span>
                ) : selectedCustomer?.picture?.url ? (
                  <img src={selectedCustomer.picture.url} alt='' className='h-7 w-7 shrink-0 rounded object-cover' />
                ) : (
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded text-sm font-semibold text-white',
                      initialTileColor(customerName),
                    )}
                  >
                    {customerName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className={getTextClasses(customerName, 'min-w-0 flex-1 truncate text-[15px] font-semibold text-primary')}>
                  {customerName}
                </span>
              </>
            ) : (
              <span className='min-w-0 flex-1 text-[15px] text-muted-foreground'>
                {t('Search a name or phone…') || 'Search a name or phone…'}
              </span>
            )}
            <ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground' />
          </button>
          {!isWalkIn && hasCustomer ? (
            <div className='mt-2 space-y-0.5 text-sm text-foreground/80'>
              {showUrdu && selectedCustomer?.nameUrdu?.trim() ? (
                <p dir='auto' className='text-muted-foreground'>{selectedCustomer.nameUrdu.trim()}</p>
              ) : null}
              {customerAddress ? <p className='whitespace-pre-line'>{customerAddress}</p> : null}
              {selectedCustomer?.phone ? <p>{selectedCustomer.phone}</p> : null}
              {selectedCustomer?.taxNumber ? (
                <p className='text-xs text-muted-foreground'>
                  {t('Tax No') || 'Tax No'}: {selectedCustomer.taxNumber}
                </p>
              ) : null}
              <p className='pt-1 text-[13px]'>
                <span className='text-muted-foreground'>{t('Previous Balance')}: </span>
                {loadingBalance ? (
                  <Loader2 className='inline h-3 w-3 animate-spin' />
                ) : (
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      customerBalance > 0 ? 'text-red-600' : customerBalance < 0 ? 'text-emerald-600' : 'text-muted-foreground',
                    )}
                  >
                    {formatMoney(Math.abs(customerBalance))} {customerBalance > 0 ? '(Dr)' : customerBalance < 0 ? '(Cr)' : ''}
                  </span>
                )}
              </p>
            </div>
          ) : null}
          {creditStrip}
        </MobileField>

        {isWalkIn ? (
          <MobileField label={t('customer_name') || 'Customer Name'} htmlFor='m-walkin-name'>
            <Input
              id='m-walkin-name'
              value={invoice.walkInCustomerName || ''}
              onChange={(e) => setInvoice((prev) => ({ ...prev, walkInCustomerName: e.target.value }))}
              placeholder={t('enter_customer_name_for_print') || 'Name to show on the printed receipt'}
              className='h-10 rounded-none border-0 border-b px-0 text-[15px] shadow-none focus-visible:border-primary focus-visible:ring-0'
            />
          </MobileField>
        ) : null}

        <div className='grid grid-cols-1 gap-x-4'>
          <MobileField label={t('invoice_date') || 'Invoice Date'} htmlFor='m-invoice-date'>
            <DatePicker
              id='m-invoice-date'
              value={invoice.invoiceDate || getBusinessToday()}
              onChange={(day) => setInvoice((prev) => ({ ...prev, invoiceDate: day }))}
            />
          </MobileField>
          {dueDateField ? <div className='py-1'>{dueDateField}</div> : null}
        </div>
      </div>

      {/* Tabs */}
      <div className='flex border-y bg-background px-2' role='tablist'>
        {(
          [
            { key: 'lines', label: t('Invoice Lines') || 'Invoice Lines', count: lines.length },
            { key: 'payment', label: t('Payment') || 'Payment' },
            { key: 'other', label: t('Other Info') || 'Other Info' },
          ] as Array<{ key: Tab; label: string; count?: number }>
        ).map(({ key, label, count }) => (
          <button
            key={key}
            type='button'
            role='tab'
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'relative flex-1 px-2 py-3 text-[13px] font-semibold transition-colors',
              tab === key ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {label}
            {count ? <span className='ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary'>{count}</span> : null}
            {tab === key ? <span className='absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary' /> : null}
          </button>
        ))}
      </div>

      {tab === 'lines' && (
        <div className='bg-background'>
          {lines.length > 0 ? (
            <ul className='divide-y border-b'>
              {lines.map((item) => {
                const discounted = (item.discountAmount || 0) > 0
                return (
                  <li key={item.id}>
                    <button type='button' onClick={() => openLine(item)} className='flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted'>
                      {item.image?.url ? (
                        <img src={item.image.url} alt='' className='h-12 w-12 shrink-0 rounded-lg border object-cover' />
                      ) : (
                        <span className='flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted'>
                          <Package className='h-5 w-5 text-muted-foreground/50' />
                        </span>
                      )}
                      <span className='min-w-0 flex-1'>
                        <span className={getTextClasses(item.name, 'block text-[15px] leading-snug font-semibold break-words')}>{item.name}</span>
                        {showUrdu && item.nameUrdu?.trim() ? (
                          <span dir='auto' className='block truncate text-[13px] text-muted-foreground'>
                            {item.nameUrdu.trim()}
                          </span>
                        ) : null}
                        <span className='mt-0.5 block text-[13px] text-muted-foreground'>
                          {t('quantity') || 'Quantity'}: <span className='text-foreground tabular-nums'>{item.quantity}</span> {item.unit || 'pcs'}
                        </span>
                        <span className='block text-[13px] text-muted-foreground'>
                          {t('unit_price') || 'Unit Price'}: <span className='text-foreground tabular-nums'>{formatMoney(item.unitPrice)}</span>
                          {discounted ? (
                            <span className='ml-1.5 text-emerald-700 dark:text-emerald-400'>
                              −{item.discountType === 'percentage' ? `${item.discountValue}%` : formatMoney(item.discountAmount || 0)}
                            </span>
                          ) : null}
                        </span>
                        {item.batchNumber ? (
                          <span className='block text-xs text-sky-700 dark:text-sky-300'>
                            {t('Batch') || 'Batch'} {item.batchNumber}
                          </span>
                        ) : null}
                      </span>
                      <span className='shrink-0 text-right'>
                        {discounted ? (
                          <span className='block text-xs text-muted-foreground tabular-nums line-through'>{formatMoney(item.quantity * item.unitPrice)}</span>
                        ) : null}
                        <span className='block text-[15px] font-semibold tabular-nums'>{formatMoney(item.subtotal)}</span>
                        <ChevronRight className='mt-1 ml-auto h-4 w-4 text-muted-foreground/60' />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className='px-6 pt-8 pb-2 text-center'>
              <span className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted'>
                <Package className='h-6 w-6 text-muted-foreground/60' />
              </span>
              <p className='mt-2 text-sm text-muted-foreground'>{t('No lines yet — add the first product') || 'No lines yet — add the first product'}</p>
            </div>
          )}

          <div className='flex items-center justify-center gap-6 border-b px-4 py-3.5'>
            <button type='button' onClick={openNewLine} className='inline-flex items-center gap-1.5 text-[15px] font-semibold text-primary active:opacity-70'>
              <Plus className='h-4 w-4' />
              {t('Add a line') || 'Add a line'}
            </button>
            {onBarcodeSearch ? (
              <button
                type='button'
                onClick={() => setScanOpen(true)}
                className='inline-flex items-center gap-1.5 text-[15px] font-semibold text-primary active:opacity-70'
              >
                <ScanBarcode className='h-4 w-4' />
                {t('Scan') || 'Scan'}
              </button>
            ) : null}
          </div>

          {/* Totals — right-aligned, as on the printed invoice */}
          <div className='px-4 pt-3 pb-5'>
            <dl className='ml-auto max-w-[19rem] space-y-1.5 text-sm'>
              <TotalRow label={t('Untaxed Amount') || 'Untaxed Amount'} value={formatMoney(itemDiscountTotal > 0 ? grossSubtotal : invoice.subtotal)} />
              {itemDiscountTotal > 0 ? (
                <TotalRow label={t('Item Discounts') || 'Item discounts'} value={`−${formatMoney(itemDiscountTotal)}`} tone='text-emerald-700 dark:text-emerald-400' />
              ) : null}
              <button type='button' onClick={() => setAdjustOpen(true)} className='-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-0.5 text-left active:bg-muted'>
                <TotalRow
                  label={
                    <span className='inline-flex items-center gap-1 text-primary'>
                      <Percent className='h-3 w-3' />
                      {t('discount') || 'Discount'}
                      {invoice.discountType === 'percentage' && invoice.discountValue ? ` (${invoice.discountValue}%)` : ''}
                    </span>
                  }
                  value={invoice.discount > 0 ? `−${formatMoney(invoice.discount)}` : t('Add') || 'Add'}
                  tone={invoice.discount > 0 ? 'text-red-600' : 'text-primary'}
                />
              </button>
              {hasTaxSystem ? (
                taxBreakdown
              ) : (
                <button type='button' onClick={() => setAdjustOpen(true)} className='-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-0.5 text-left active:bg-muted'>
                  <TotalRow
                    label={
                      <span className='inline-flex items-center gap-1 text-primary'>
                        <Receipt className='h-3 w-3' />
                        {t('tax') || 'Tax'}
                        {taxRate ? ` (${taxRate}%)` : ''}
                      </span>
                    }
                    value={invoice.tax > 0 ? formatMoney(invoice.tax) : t('Add') || 'Add'}
                    tone={invoice.tax > 0 ? undefined : 'text-primary'}
                  />
                </button>
              )}
              <div className='mt-2 flex items-baseline justify-between gap-4 border-t pt-2'>
                <dt className='font-semibold'>{t('total') || 'Total'}:</dt>
                <dd className='text-xl font-bold tabular-nums'>{formatMoney(invoice.total)}</dd>
              </div>
              {invoice.type !== 'quotation' ? (
                <>
                  {totalPaidNow > 0 ? <TotalRow label={t('Paid') || 'Paid'} value={`−${formatMoney(totalPaidNow)}`} tone='text-emerald-700 dark:text-emerald-400' /> : null}
                  <div className='flex items-baseline justify-between gap-4 pt-2'>
                    <dt className='text-muted-foreground'>{t('Amount Due') || 'Amount Due'}:</dt>
                    <dd className={cn('text-lg font-bold tabular-nums', amountDue > 0.004 ? 'text-foreground' : 'text-emerald-600')}>{formatMoney(amountDue)}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      )}

      {tab === 'payment' && <div className='space-y-4 bg-background px-4 py-4'>{paymentContent}</div>}
      {tab === 'other' && <div className='space-y-4 bg-background px-4 py-4'>{otherInfoContent}</div>}

      {/* Bottom bar: total + Save & Print */}
      <div className='fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/90'>
        <div className='flex items-center gap-3'>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-[11px] text-muted-foreground'>
              {lines.length} {lines.length === 1 ? t('line') || 'line' : t('lines') || 'lines'}
              {invoice.type !== 'quotation' && amountDue > 0.004 && amountDue < invoice.total - 0.004
                ? ` · ${t('Due') || 'Due'} ${formatMoney(amountDue)}`
                : ''}
            </p>
            <p className='truncate text-lg leading-tight font-bold tabular-nums'>{formatMoney(invoice.total)}</p>
          </div>
          {canPrint ? (
            <PrintFormatButton
              onPrint={(paperSize) => onSaveAndPrint(paperSize)}
              invoiceHeaderStyles
              defaultPaperSize={defaultPaperSize}
              allowedFormats={['thermal80', 'thermal58', 'a4', 'a5', 'a4-half-left', 'a4-half-right']}
              size='lg'
              variant='default'
              disabled={!canSave || saving}
              className='shrink-0'
              mainButtonClassName='h-11 min-w-0 bg-emerald-600 hover:bg-emerald-700'
              mainButtonContent={
                savingType !== null && savingType !== 'none' ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <>
                    <Printer className='h-4 w-4 shrink-0' />
                    <span className='ml-1.5'>{isEditing ? t('Update & Print') || 'Update & Print' : t('Save & Print') || 'Save & Print'}</span>
                  </>
                )
              }
            />
          ) : (
            <Button type='button' className='h-11 px-6' disabled={!canSave || saving} onClick={onConfirm}>
              {isEditing ? t('Update') || 'Update' : t('Confirm') || 'Confirm'}
            </Button>
          )}
        </div>
      </div>

      {/* Page ⋮ menu */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side='bottom' className='rounded-t-2xl px-0 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]'>
          <div className='mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/25' aria-hidden />
          <SheetTitle className='sr-only'>{t('More actions') || 'More actions'}</SheetTitle>
          <SheetDescription className='sr-only'>{t('Invoice') || 'Invoice'}</SheetDescription>
          <ul className='py-1'>
            {onPreview ? (
              <SheetAction
                icon={<Eye className='h-5 w-5' />}
                label={t('Preview')}
                disabled={lines.length === 0}
                onSelect={() => {
                  setMenuOpen(false)
                  onPreview()
                }}
              />
            ) : null}
            {pageActions.map((action) => (
              <SheetAction
                key={action.key}
                icon={action.icon}
                label={action.label}
                badge={action.badge}
                onSelect={() => {
                  setMenuOpen(false)
                  action.onSelect()
                }}
              />
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      {/* Overall discount / tax */}
      <Sheet open={adjustOpen} onOpenChange={setAdjustOpen}>
        <SheetContent side='bottom' className='rounded-t-2xl px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]'>
          <div className='mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/25' aria-hidden />
          <SheetTitle className='text-base'>{t('Discount & tax') || 'Discount & tax'}</SheetTitle>
          <SheetDescription className='text-xs'>{t('Applies to the whole invoice') || 'Applies to the whole invoice'}</SheetDescription>
          <div className='mt-4 space-y-4'>
            <div>
              <p className='mb-1.5 text-[13px] font-medium text-muted-foreground'>{t('discount') || 'Discount'}</p>
              <div className='flex items-center gap-2'>
                <NumericInput
                  inputMode='decimal'
                  min={0}
                  max={invoice.discountType === 'percentage' ? 100 : undefined}
                  blankWhenZero
                  value={invoice.discountValue || 0}
                  onValueChange={(value) => updateDiscount({ value })}
                  placeholder='0'
                  className='h-12 flex-1 rounded-xl text-lg font-semibold tabular-nums'
                />
                <div className='flex h-12 shrink-0 rounded-xl border bg-muted p-1'>
                  {(['percentage', 'fixed'] as const).map((type) => {
                    const active = (invoice.discountType || 'fixed') === type
                    return (
                      <button
                        key={type}
                        type='button'
                        onClick={() => !active && updateDiscount({ type })}
                        className={cn(
                          'min-w-12 rounded-lg px-3 text-sm font-semibold',
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
            {!hasTaxSystem ? (
              <div>
                <p className='mb-1.5 text-[13px] font-medium text-muted-foreground'>{t('tax_rate') || 'Tax rate'} (%)</p>
                <NumericInput
                  inputMode='decimal'
                  min={0}
                  max={100}
                  blankWhenZero
                  value={taxRate}
                  onValueChange={(value) => setTaxRate(Math.max(0, Math.min(100, value)))}
                  placeholder='0'
                  className='h-12 rounded-xl text-lg font-semibold tabular-nums'
                />
              </div>
            ) : null}
            <Button type='button' className='h-11 w-full' onClick={() => setAdjustOpen(false)}>
              {t('Done') || 'Done'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <MobileCustomerPicker
        open={customerPicker.open}
        onOpenChange={customerPicker.setOpen}
        query={customerPicker.query}
        onQueryChange={customerPicker.setQuery}
        customers={customerPicker.visible}
        totalMatches={customerPicker.total}
        loading={customerPicker.loading}
        selectedId={invoice.customerId ? String(invoice.customerId) : undefined}
        walkInAllowed={walkInAllowed}
        showUrdu={showUrdu}
        onSelect={customerPicker.onSelect}
        onCreate={customerPicker.onCreate}
      />

      <MobileProductPicker
        open={pickerTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPickerTarget(null)
            productPicker.setQuery('')
          }
        }}
        query={productPicker.query}
        onQueryChange={productPicker.setQuery}
        products={productPicker.visible}
        totalMatches={productPicker.total}
        catalog={productPicker.catalog}
        loading={productPicker.loading}
        showUrdu={showUrdu}
        warehouseQtyOf={productPicker.warehouseQtyOf}
        warehouseName={productPicker.warehouseName}
        onPick={handlePick}
        onCreate={
          productPicker.onCreate
            ? () => {
                const target = pickerTarget?.itemId ?? null
                setPickerTarget(null)
                productPicker.onCreate?.(target)
              }
            : undefined
        }
      />

      <MobileLineEditor
        open={editor !== null && editorItem !== null}
        onOpenChange={(open) => !open && closeEditor()}
        item={editorItem}
        isNew={Boolean(editor?.isNew)}
        extras={editorItem ? getLineExtras(editorItem) : null}
        currencySymbol={currencySymbol}
        showUrdu={showUrdu}
        renderRateHistory={editorItem && renderRateHistory ? (onClose) => renderRateHistory(editorItem, onClose) : undefined}
        onChangeProduct={() => editor && setPickerTarget({ itemId: editor.itemId })}
        onQuantity={(qty) => editor && onQuantity(editor.itemId, qty)}
        onUnitPrice={(price) => editor && onUnitPrice(editor.itemId, price)}
        onDiscount={(patch) => editor && onItemDiscount(editor.itemId, patch)}
        onSaveClose={closeEditor}
        onSaveNew={() => {
          closeEditor()
          openNewLine()
        }}
        onDiscard={discardEditor}
        onRemove={() => {
          if (!editor) return
          onRemoveLine(editor.itemId)
          closeEditor()
        }}
      />

      {onBarcodeSearch ? (
        <MobileCameraScanner
          isOpen={scanOpen}
          onOpenChange={setScanOpen}
          trigger={<span className='hidden' aria-hidden />}
          onScanResult={(code) => {
            setScanOpen(false)
            if (code.trim()) onBarcodeSearch(code.trim())
          }}
        />
      ) : null}
    </div>
  )
}

function TotalRow({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: string }) {
  return (
    <div className='flex items-baseline justify-between gap-4'>
      <dt className='text-muted-foreground'>{label}:</dt>
      <dd className={cn('font-medium tabular-nums', tone)}>{value}</dd>
    </div>
  )
}

function SheetAction({
  icon,
  label,
  onSelect,
  disabled,
  badge,
}: {
  icon: ReactNode
  label: string
  onSelect: () => void
  disabled?: boolean
  badge?: number
}) {
  return (
    <li>
      <button
        type='button'
        disabled={disabled}
        onClick={onSelect}
        className='flex w-full items-center gap-4 px-6 py-3.5 text-left text-[15px] active:bg-muted disabled:opacity-40'
      >
        <span className='text-muted-foreground'>{icon}</span>
        <span className='flex-1'>{label}</span>
        {badge ? <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary'>{badge}</span> : null}
      </button>
    </li>
  )
}
