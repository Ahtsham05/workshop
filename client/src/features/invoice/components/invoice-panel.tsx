import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Minus, Plus, Trash2, Save, Calculator, DollarSign, Search, Check, User, Package, Loader2, Printer, ArrowLeft, ChevronDown, Banknote, FileCheck, X, MessageSquare, Send, Briefcase } from 'lucide-react'
import { useGetAvailableImeisQuery } from '@/stores/imei.api'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useLanguage } from '@/context/language-context'
import { Invoice, InvoiceItem, createEmptyManualInvoiceItem } from '../index'
import { toast } from 'sonner'
import { useCreateInvoiceMutation, useUpdateInvoiceMutation, invoiceApi } from '@/stores/invoice.api'
import { useSendSmsMutation } from '@/stores/smsGateway.api'
import { generateInvoiceHTML, generateA4InvoiceHTML, openPrintWindowForFormat } from '../utils/print-utils'
import { PAPER_FORMATS, resolveThermalSize, resolveSheetSize, resolveSheetFormat, type PaperSize, type SheetSize, type PrintOrientation } from '../utils/paper-format'
import type { InvoiceTemplate } from '../utils/invoice-template'
import { PrintFormatButton } from '@/components/print-format-button'
import { withCustomerContactForPrint } from '../utils/invoice-print-whatsapp'
import { sendInvoiceReceiptWhatsApp } from '../utils/send-invoice-whatsapp'
import { buildInvoiceSmsMessage, buildPendingInvoiceItemsMessageUrdu, buildPendingInvoiceItemsSummaryUrdu } from '@/utils/sms-messages'
import { useSendWhatsAppMessageMutation } from '@/stores/whatsapp.api'
import {
  fetchAndStashPrintContact,
  resolveCustomerIdString,
  stashPrintContact,
  type PrintWindowContact,
} from '../utils/invoice-print-contact-bridge'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import SmartInput from '@/components/smart-input.tsx'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
// import { KeyboardLanguageOverride } from '@/components/keyboard-language-override'
import { cn } from '@/lib/utils'
import { getTextClasses, getUrduSecondaryNameClasses, matchesBilingualSearch } from '@/utils/urdu-text-utils'
import { purchaseCatalogApi, useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'

// Stable empty-array reference — an inline `= []` default on `data` would create a new
// array every render while the query is loading.
const EMPTY_SELLABLE_CATALOG: PurchaseCatalogItem[] = []

// The product/customer picker dropdowns mount one DOM row (image, badges, text) per
// match with no virtualization. With 1000+ products/customers, rendering every match
// on an empty search — cmdk's default behavior — is what actually makes the dropdown
// feel slow to open, far more than any timing delay. Capping to the first N matches
// keeps the popover instant; typing to search still filters the full list.
const MAX_VISIBLE_DROPDOWN_RESULTS = 50
import { detectCurrentKeyboardLanguage } from '@/utils/keyboard-language-utils'
import { useSelector, useDispatch } from 'react-redux'
import { RootState, AppDispatch } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { calculateInvoiceLineValues, getProductUnitOptions, getUnitAdjustedPrice } from '@/lib/inventory-unit-conversions'
import { afterPaint, focusField, onEnterAdvance, useInvoiceSaveShortcuts } from '@/lib/invoice-form-keyboard'
import { useSync } from '@/lib/sync/use-sync'
import { buildOfflineInvoicePayload } from '@/lib/sync/offline-invoice'
import { getElectronAPI } from '@/lib/sync/electron'
import { isApiUnreachable } from '@/lib/auth-cache'
import { normalizeInvoiceNotesHtml } from '@/lib/rich-text-utils'
import { BilingualName } from '@/components/bilingual-name'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import { getInvoicePrintInUrdu, setInvoicePrintInUrdu } from '../utils/print-preferences'
import { isWholesaleRetailBusiness } from '@/lib/business-types'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import {
  buildMergedPaymentOptions,
  getWalletTypeFromOptionValue,
  isWalletOptionValue,
  toWalletOptionValue,
} from '@/lib/wallet-payment-options'
import { usePermissions } from '@/context/permission-context'
import {
  EntityCreateEmptyPrompt,
  EntityCreateShortcutButton,
  EntityQuickCreateDialogs,
  type QuickCreateState,
} from '@/components/entity-create-shortcut'
import { QuotationConvertDialog } from './quotation-convert-dialog'

/** Toggle to show payment source fields on invoice checkout. */
const SHOW_INVOICE_PAYMENT_METHOD_UI = true

/** Picks IMEI/serial numbers to sell from in-stock inventory, for products with trackImei enabled. */
function ImeiPicker({
  productId,
  quantity,
  selected,
  onChange,
}: {
  productId: string
  quantity: number
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(t)
  }, [search])
  const { data: available = [], isFetching } = useGetAvailableImeisQuery(
    { productId, search: debounced },
    { skip: !productId },
  )
  const remaining = available.filter((d) => !selected.includes(d.imei))

  return (
    <div className='border-t bg-amber-50/40 dark:bg-amber-950/10 px-3 py-2.5 space-y-2'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium text-amber-700'>
          IMEI Numbers ({selected.length}/{quantity})
        </span>
      </div>
      <div className='relative'>
        <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
        <Input
          placeholder='Search in-stock IMEI…'
          value={search}
          showVoiceInput={false}
          onChange={(e) => setSearch(e.target.value)}
          className='h-8 text-sm pl-8'
        />
      </div>
      {isFetching ? (
        <p className='text-xs text-muted-foreground'>Loading…</p>
      ) : remaining.length > 0 ? (
        <div className='flex flex-wrap gap-1.5 max-h-28 overflow-y-auto'>
          {remaining.map((d) => (
            <button
              key={d.id}
              type='button'
              disabled={selected.length >= quantity}
              onClick={() => onChange([...selected, d.imei])}
              className='text-xs px-2 py-1 rounded-md border bg-background hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed'
            >
              {d.imei}
            </button>
          ))}
        </div>
      ) : (
        <p className='text-xs text-muted-foreground'>No in-stock IMEI found{debounced ? ' for this search' : ''}.</p>
      )}
      {selected.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {selected.map((num) => (
            <Badge key={num} variant='secondary' className='gap-1 pr-1'>
              {num}
              <button
                type='button'
                onClick={() => onChange(selected.filter((n) => n !== num))}
                className='ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5'
              >
                <X className='h-3 w-3' />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

interface InvoicePanelProps {
  invoice: Invoice
  setInvoice: React.Dispatch<React.SetStateAction<Invoice>>
  updateQuantity: (itemId: string, newQuantity: number) => void
  removeFromInvoice: (itemId: string) => void
  updateInvoiceType: (type: 'cash' | 'credit' | 'pending' | 'quotation') => void
  updateDiscount: (discountAmount: number) => void
  taxRate: number
  setTaxRate: (rate: number) => void
  customers: any[]
  customersLoading?: boolean
  setCustomers?: React.Dispatch<React.SetStateAction<any[]>>
  productsLoading?: boolean
  products: any[]
  setProducts: React.Dispatch<React.SetStateAction<any[]>>
  calculateTotals?: (items: any[], discountAmount?: number, deliveryCharge?: number, serviceCharge?: number) => any
  onBackToList?: () => void
  onSaveSuccess?: () => void
  isEditing?: boolean
  editingInvoice?: any
  /** Matches Product Catalog "Cost" toggle — when true, purchase cost is readable in the product picker */
  showProductCost?: boolean
}

export function InvoicePanel({
  invoice,
  setInvoice,
  updateQuantity,
  removeFromInvoice,
  updateInvoiceType,
  updateDiscount,
  taxRate,
  // setTaxRate,
  customers,
  customersLoading = false,
  setCustomers,
  productsLoading = false,
  products,
  setProducts,
  calculateTotals,
  onBackToList,
  onSaveSuccess,
  isEditing = false,
  editingInvoice,
  showProductCost = false,
}: InvoicePanelProps) {
  const { t, isRTL } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const { hasPermission } = usePermissions()
  const canCreateCustomer = hasPermission('createCustomers' as never)
  const canCreateProduct = hasPermission('createProducts' as never)
  const { data: walletsData } = useGetWalletsQuery(undefined, { skip: !SHOW_INVOICE_PAYMENT_METHOD_UI })
  const wallets = walletsData?.results?.filter(w => w.isActive) ?? []
  // Sale invoices receive cash — never show wallet balances in the dropdown (money-in form).
  const paymentMethodOptions = useMemo(
    () =>
      buildMergedPaymentOptions(
        [
          { value: 'cash', label: t('cash') || 'Cash' },
          { value: 'bank', label: t('bank_transfer') || 'Bank Transfer' },
          { value: 'card', label: t('card') || 'Card' },
        ],
        wallets,
        false,
      ),
    [wallets, t],
  )
  const [discountInput, setDiscountInput] = useState(invoice.discount?.toString() || '0')
  const [paidAmountInput, setPaidAmountInput] = useState('')
  const [showProfitDetails, setShowProfitDetails] = useState(false)
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [productSelectOpen, setProductSelectOpen] = useState<string>('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [savingType, setSavingType] = useState<'none' | PaperSize | null>(null)
  const [customerBalance, setCustomerBalance] = useState<number>(0)
  const [isWhatsAppSending, setIsWhatsAppSending] = useState(false)
  const [sendSms, { isLoading: isSendingSms }] = useSendSmsMutation()
  const [sendWhatsAppMessage] = useSendWhatsAppMessageMutation()
  const [sendMethod, setSendMethod] = useState<'none' | 'sms' | 'whatsapp' | 'both'>(() => {
    const s = localStorage.getItem('invoiceSendMethod')
    return s === 'sms' || s === 'whatsapp' || s === 'both' ? s : 'none'
  })
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [cashReceivedInput, setCashReceivedInput] = useState('')
  const [quickCreate, setQuickCreate] = useState<QuickCreateState>(null)
  const [quickCreateProductItemId, setQuickCreateProductItemId] = useState<string | null>(null)

  // Refs for keyboard Enter navigation
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const invoiceTypeTriggerRef = useRef<HTMLButtonElement>(null)
  const invoiceDateRef = useRef<HTMLInputElement>(null)
  const itemsScrollRef = useRef<HTMLDivElement>(null)
  const autoOpenedInvoiceItemIdRef = useRef<string | null>(null)
  const [invoiceTypeSelectOpen, setInvoiceTypeSelectOpen] = useState(false)

  useEffect(() => {
    if (isEditing) {
      autoOpenedInvoiceItemIdRef.current = null
      return
    }
    const first = invoice.items[0]
    if (
      invoice.items.length === 1 &&
      first?.isManualEntry &&
      !first?.productId &&
      first?.id &&
      autoOpenedInvoiceItemIdRef.current !== first.id
    ) {
      autoOpenedInvoiceItemIdRef.current = first.id
      queueMicrotask(() => setProductSelectOpen(first.id))
    }
  }, [invoice.items, isEditing])

  // Auto-scroll items list when items change
  useEffect(() => {
    if (itemsScrollRef.current) {
      itemsScrollRef.current.scrollTop = itemsScrollRef.current.scrollHeight
    }
  }, [invoice.items.length])

  // Detect current keyboard language
  const currentKeyboardLanguage = detectCurrentKeyboardLanguage()
  const voiceLanguage = currentKeyboardLanguage === 'ur' ? 'ur-PK' : 'en-US'

  // RTK Query mutations
  const [createInvoice] = useCreateInvoiceMutation()
  const [updateInvoice] = useUpdateInvoiceMutation()
  const { isElectron, online } = useSync()
  
  // Fetch active branch data for invoice printing
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const preferredLanguage = useSelector((state: RootState) => state.auth.data?.user?.preferredLanguage || 'en')
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const showUnitConversions = isWholesaleRetailBusiness(orgData?.businessType || user?.businessType)
  const defaultPaperSize: PaperSize = branchData?.printSettings?.paperSize ?? 'thermal80'
  const invoiceTemplate: InvoiceTemplate = branchData?.printSettings?.template ?? 'standard'
  const printOrientation: PrintOrientation = branchData?.printSettings?.printOrientation ?? 'portrait'

  const [printReceiptInUrdu, setPrintReceiptInUrdu] = useState(() => getInvoicePrintInUrdu())
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  // Print functionality using utility
  const printInvoice = useCallback(async (invoiceData: any, thermalSize: 'thermal80' | 'thermal58' = 'thermal80') => {
    try {
      const prevBal = invoiceData.previousBalance ?? customerBalance
      const netBal = (prevBal || 0) + (invoiceData.total || 0) - (invoiceData.paidAmount || 0)

      const printData = withCustomerContactForPrint({
        invoiceNumber: invoiceData.invoiceNumber,
        items: invoiceData.items.map((item: any) => ({
          name: item.name,
          nameUrdu: item.nameUrdu,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice,
          imeis: item.imeis,
        })),
        customerId: invoiceData.customerId,
        customerName: invoice.customerName || invoiceData.customerName,
        walkInCustomerName: invoiceData.walkInCustomerName,
        type: invoiceData.type,
        subtotal: invoiceData.subtotal,
        tax: invoiceData.tax,
        discount: invoiceData.discount,
        total: invoiceData.total,
        paidAmount: invoiceData.paidAmount,
        balance: invoiceData.balance,
        notes: invoiceData.notes,
        invoiceAddress: branchData?.location?.address?.trim() || undefined,
        invoiceAddressUrdu: branchData?.location?.addressUrdu?.trim() || undefined,
        deliveryCharge: invoiceData.deliveryCharge,
        serviceCharge: invoiceData.serviceCharge,
        previousBalance: prevBal,
        netBalance: netBal,
        companyName: orgData?.name || branchData?.name,
        companyNameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim() || undefined,
        companyAddress: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', ') || undefined,
        companyPhone: branchData?.phone,
        companyEmail: branchData?.email,
        companyTaxNumber: undefined,
        companyLogo: orgData?.logo?.url,
        isTrial: orgData?.subscription?.isTrial,
        language: invoiceData.language,
        isUrduOnly: invoiceData.isUrduOnly,
        userPreferredLanguage: preferredLanguage,
        invoiceNote: branchData?.invoiceNote,
        customerNameUrdu: (() => {
          const cid = invoiceData.customerId ?? invoice.customerId
          if (!cid || cid === 'walk-in') return undefined
          if (typeof cid === 'object' && cid != null && 'nameUrdu' in cid) {
            const u = String((cid as { nameUrdu?: string }).nameUrdu || '').trim()
            return u || undefined
          }
          return customers.find((c) => String(c._id || c.id) === String(cid))?.nameUrdu?.trim()
        })(),
        printInUrdu: getInvoicePrintInUrdu(),
        printAsQuotation: invoiceData.type === 'quotation',
        invoiceDate: invoiceData.invoiceDate || invoice.invoiceDate,
      }, invoiceData)

      const customerIdStr = resolveCustomerIdString(printData.customerId)
      const printContact: PrintWindowContact = {
        customerId: customerIdStr,
        phone: printData.customerPhone,
        whatsapp: printData.customerWhatsapp,
      }
      if (customerIdStr) {
        stashPrintContact(printContact)
        try {
          await fetchAndStashPrintContact(customerIdStr)
        } catch {
          /* prompt in print window */
        }
      }

      const htmlContent = generateInvoiceHTML(printData, thermalSize)
      openPrintWindowForFormat(htmlContent, thermalSize, printContact)

      // Don't show success toast - let the print dialog speak for itself
    } catch (error: any) {
      console.error('Print error:', error)
      // Only show error if window couldn't be opened (popup blocker)
      if (error.message && error.message.includes('popup blocker')) {
        toast.error('Please allow popups to print. Check your browser settings.')
      } else {
        toast.error('Failed to open print window')
      }
    }
  }, [t, invoice.customerName, invoice.customerId, branchData, customerBalance, preferredLanguage, orgData, customers])

  /** Builds A4/A5 print data + WhatsApp/SMS contact for the invoice being saved/printed. Shared by full and half-sheet printing. */
  const buildA4PrintData = useCallback(async (invoiceData: any) => {
      const prevBal = invoiceData.previousBalance ?? customerBalance
      const netBal = (prevBal || 0) + (invoiceData.total || 0) - (invoiceData.paidAmount || 0)

      const printData = withCustomerContactForPrint({
        invoiceNumber: invoiceData.invoiceNumber,
        items: invoiceData.items.map((item: any) => ({
          name: item.name,
          nameUrdu: item.nameUrdu,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice,
          imeis: item.imeis,
        })),
        customerId: invoiceData.customerId,
        customerName: invoice.customerName || invoiceData.customerName,
        walkInCustomerName: invoiceData.walkInCustomerName,
        type: invoiceData.type,
        subtotal: invoiceData.subtotal,
        tax: invoiceData.tax,
        discount: invoiceData.discount,
        total: invoiceData.total,
        paidAmount: invoiceData.paidAmount,
        balance: invoiceData.balance,
        notes: invoiceData.notes,
        invoiceAddress: branchData?.location?.address?.trim() || undefined,
        invoiceAddressUrdu: branchData?.location?.addressUrdu?.trim() || undefined,
        deliveryCharge: invoiceData.deliveryCharge,
        serviceCharge: invoiceData.serviceCharge,
        previousBalance: prevBal,
        netBalance: netBal,
        companyName: orgData?.name || branchData?.name,
        companyNameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim() || undefined,
        companyAddress: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', ') || undefined,
        companyPhone: branchData?.phone,
        companyEmail: branchData?.email,
        companyTaxNumber: undefined,
        companyLogo: orgData?.logo?.url,
        isTrial: orgData?.subscription?.isTrial,
        language: invoiceData.language,
        isUrduOnly: invoiceData.isUrduOnly,
        userPreferredLanguage: preferredLanguage,
        invoiceNote: branchData?.invoiceNote,
        customerNameUrdu: (() => {
          const cid = invoiceData.customerId ?? invoice.customerId
          if (!cid || cid === 'walk-in') return undefined
          if (typeof cid === 'object' && cid != null && 'nameUrdu' in cid) {
            const u = String((cid as { nameUrdu?: string }).nameUrdu || '').trim()
            return u || undefined
          }
          return customers.find((c) => String(c._id || c.id) === String(cid))?.nameUrdu?.trim()
        })(),
        printInUrdu: getInvoicePrintInUrdu(),
        printAsQuotation: invoiceData.type === 'quotation',
        invoiceDate: invoiceData.invoiceDate || invoice.invoiceDate,
      }, invoiceData)

      const customerIdStr = resolveCustomerIdString(printData.customerId)
      const printContact: PrintWindowContact = {
        customerId: customerIdStr,
        phone: printData.customerPhone,
        whatsapp: printData.customerWhatsapp,
      }
      if (customerIdStr) {
        stashPrintContact(printContact)
        try {
          await fetchAndStashPrintContact(customerIdStr)
        } catch {
          /* prompt in print window */
        }
      }

      return { printData, printContact }
  }, [invoice.customerName, invoice.customerId, branchData, customerBalance, preferredLanguage, orgData, customers])

  // A4 Print functionality using utility — sheetSize also accepts the A4-half-sheet formats
  const printA4Invoice = useCallback(async (invoiceData: any, sheetSize: SheetSize = 'a4') => {
    try {
      const { printData, printContact } = await buildA4PrintData(invoiceData)
      const htmlContent = generateA4InvoiceHTML(printData, sheetSize, invoiceTemplate)
      openPrintWindowForFormat(htmlContent, sheetSize, printContact)
      // Don't show success toast - let the print dialog speak for itself
    } catch (error: any) {
      console.error('A4 Print error:', error)
      // Only show error if window couldn't be opened (popup blocker)
      if (error.message && error.message.includes('popup blocker')) {
        toast.error('Please allow popups to print. Check your browser settings.')
      } else {
        toast.error('Failed to open print window')
      }
    }
  }, [buildA4PrintData, invoiceTemplate])

  // Initialize form values when in edit mode
  useEffect(() => {
    if (isEditing && editingInvoice) {
      // setDiscountInput(editingInvoice.discount?.toString() || '0')
      setPaidAmountInput(editingInvoice.paidAmount?.toString() || '0')
      
      // Set the invoice type and status independently
      setInvoice(prev => ({
        ...prev,
        // Keep original type - don't change it based on status
        type: editingInvoice.type || 'credit',
        status: editingInvoice.status
      }))
    }
  }, [isEditing, editingInvoice, setInvoice])

  // Handle walk-in customer business rules
  useEffect(() => {
    if (invoice.customerId === 'walk-in') {
      // Force cash type for walk-in customers
      if (invoice.type !== 'cash') {
        setInvoice(prev => ({ 
          ...prev, 
          type: 'cash'
        }))
      }
    }
  }, [invoice.customerId, invoice.type, setInvoice])

  // Fetch customer balance when customer is selected
  useEffect(() => {
    const fetchCustomerBalance = async () => {
      if (invoice.customerId && invoice.customerId !== 'walk-in') {
        setLoadingBalance(true)
        try {
          const url = `${summery.fetchCustomerBalance.url}/${invoice.customerId}${summery.fetchCustomerBalance.urlSuffix || ''}`
          const response = await Axios.get(url)
          setCustomerBalance(response.data.balance || 0)
        } catch (error) {
          console.error('Failed to fetch customer balance:', error)
          setCustomerBalance(0)
        } finally {
          setLoadingBalance(false)
        }
      } else {
        setCustomerBalance(0)
      }
    }
    
    fetchCustomerBalance()
  }, [invoice.customerId])

  // Filter customers by name, Urdu name, or phone. Memoized — this component
  // re-renders on nearly every keystroke anywhere in the form (qty, discount, etc.),
  // and re-scanning a 1000+ row customer list each time was real, felt input lag.
  const filteredCustomers = useMemo(
    () => customers.filter((customer) =>
      matchesBilingualSearch(customerSearchQuery, customer.name, customer.nameUrdu, customer.phone),
    ),
    [customers, customerSearchQuery],
  )
  // What actually renders — capped so opening the dropdown never mounts 1000+ rows.
  const visibleCustomers = useMemo(
    () => filteredCustomers.slice(0, MAX_VISIBLE_DROPDOWN_RESULTS),
    [filteredCustomers],
  )

  // Flat sellable catalog: one row per non-variant product, and one row per real
  // variant for hasVariants products — each with its own real price/cost/stock, so the
  // picker shows "Toshiba — Black/64GB" with its own numbers instead of a vague
  // rolled-up product row. See docs/architecture/universal-product-migration.md.
  const { data: sellableCatalog = EMPTY_SELLABLE_CATALOG } = useGetPurchasableCatalogQuery()
  // Memoized for the same reason as filteredCustomers — 1500+ rows re-scanned on
  // every unrelated re-render was the biggest single source of the sluggishness.
  const filteredSellableProducts = useMemo(
    () => sellableCatalog.filter((item) =>
      matchesBilingualSearch(productSearchQuery, item.name, item.nameUrdu, item.barcode, item.brand?.name),
    ),
    [sellableCatalog, productSearchQuery],
  )
  // What actually renders — capped so opening the dropdown never mounts 1000+ rows.
  const visibleSellableProducts = useMemo(
    () => filteredSellableProducts.slice(0, MAX_VISIBLE_DROPDOWN_RESULTS),
    [filteredSellableProducts],
  )

  // Handle product selection for manual entries. `itemsOverride` lets callers
  // (e.g. quick-create right after adding a brand-new row) select into a row that
  // was just added to state but hasn't flowed back into the `invoice` prop yet.
  const handleProductSelect = useCallback((itemId: string, product: any, variantId?: string, itemsOverride?: InvoiceItem[]) => {
    const sourceItems = itemsOverride || invoice.items
    const productId = product._id || product.id
    if (!productId) {
      console.error('Product has no valid ID:', product)
      toast.error('Selected product has no valid ID')
      return
    }

    // Get current stock — for a real variant, `product.stockQuantity` is already that
    // exact variant's live stock (from the catalog); the `products` cache only ever
    // holds the legacy/parent product, which would be the wrong number.
    const currentProduct = variantId ? undefined : products.find(p => (p._id || p.id) === productId)
    const currentStock = currentProduct ? currentProduct.stockQuantity : product.stockQuantity

    // Default to the earliest-expiring batch (already sorted that way by the backend)
    // — the seller can still switch batches on the line afterward. No automatic FEFO
    // splitting across batches yet.
    const defaultBatch = variantId && (product.trackBatch || product.trackExpiry)
      ? product.knownBatches?.[0]
      : undefined
    const batchId = defaultBatch?.id
    const batchNumber = defaultBatch?.batchNumber
    // A batch can carry its own intended retail price, recorded at purchase time —
    // use it instead of the product's generic price when one was auto-selected.
    const unitPriceFromBatch = defaultBatch?.sellingPrice ?? product.price
    const unitOptions = getProductUnitOptions(product)
    
    console.log('=== PRODUCT SELECT DEBUG ===')
    console.log('Selected product:', product.name, 'ID:', productId)
    console.log('Current stock from products state:', currentStock)
    console.log('Product stock from parameter:', product.stockQuantity)
    
    // Find the current item to get its quantity
    const currentItem = sourceItems.find(item => item.id === itemId)
    if (!currentItem) {
      console.error('Item not found:', itemId)
      return
    }

    // If this item already had a (non-variant) product selected, restore its stock
    // first — skipped when the previous selection was a real variant, since the
    // `products` cache only ever holds the legacy/parent product.
    if (currentItem.productId && !currentItem.isManualEntry && !currentItem.variantId) {
      const previousStockQuantity = currentItem.stockQuantity || currentItem.quantity
      setProducts(prevProducts => prevProducts.map(p =>
        (p._id || p.id) === currentItem.productId
          ? { ...p, stockQuantity: p.stockQuantity + previousStockQuantity }
          : p
      ))
      console.log(`Stock restored for previous product: ${currentItem.name} + ${previousStockQuantity}`)
    }

    const lineValues = calculateInvoiceLineValues({
      product,
      quantity: currentItem.quantity,
      unit: unitOptions[0]?.value || product.unit,
      unitPrice: unitPriceFromBatch,
      cost: product.cost,
      conversionFactor: unitOptions[0]?.factor,
    })

    if (!lineValues) {
      toast.error(`Missing conversion for ${product.name}`)
      return
    }

    // Check if we have enough stock for the current quantity
    if (lineValues.stockQuantity > currentStock) {
      toast.error(`${product.name} - Not enough stock available. Current stock: ${currentStock}, Required: ${lineValues.stockQuantity}`)
      console.log('ERROR: Not enough stock for current quantity')
      return
    }
    
    const newItems = sourceItems.map(item =>
      item.id === itemId
        ? {
            ...item,
            productId: productId,
            variantId,
            batchId,
            batchNumber,
            name: product.name,
            nameUrdu: product.nameUrdu,
            image: product.image,
            unit: lineValues.lineUnit,
            conversionFactor: lineValues.conversionFactor,
            stockQuantity: lineValues.stockQuantity,
            unitPrice: unitPriceFromBatch,
            // Use the auto-selected batch's actual cost when known — different batches
            // can have been bought at different prices.
            cost: defaultBatch?.costPerUnit ?? product.cost,
            subtotal: lineValues.subtotal,
            profit: lineValues.subtotal - ((defaultBatch?.costPerUnit ?? product.cost) * lineValues.stockQuantity),
            isManualEntry: false
          }
        : item
    )

    // Update stock to reflect the selection (decrease by current item quantity) — for
    // variant items this client-side cache doesn't apply (the legacy product's field
    // would be the wrong number); the catalog query reflects real stock after refetch.
    if (!variantId) {
      setProducts(prevProducts => prevProducts.map(p =>
        (p._id || p.id) === productId
          ? { ...p, stockQuantity: p.stockQuantity - lineValues.stockQuantity }
          : p
      ))
    }

    console.log(`Stock updated: ${product.name} - decreased by ${lineValues.stockQuantity}`)
    console.log('=== PRODUCT SELECT DEBUG END ===')
    
    if (calculateTotals) {
      // Use parent's calculateTotals function
      const totals = calculateTotals(newItems, invoice.discount, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
      setInvoice(prev => ({
        ...prev,
        items: newItems,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        totalProfit: totals.totalProfit,
        totalCost: totals.totalCost,
        balance: totals.total - prev.paidAmount
      }))
    } else {
      // Fallback calculation
      const subtotal = newItems.reduce((sum, item) => sum + item.subtotal, 0)
      const totalCost = newItems.reduce((sum, item) => sum + (item.cost * item.quantity), 0)
      const totalProfit = newItems.reduce((sum, item) => sum + item.profit, 0)
      const discountAmount = invoice.discount || 0
      const taxAmount = ((subtotal - discountAmount) * taxRate) / 100
      const total = subtotal - discountAmount + taxAmount
      const balance = total - invoice.paidAmount
      
      setInvoice(prev => ({
        ...prev,
        items: newItems,
        subtotal,
        totalCost,
        totalProfit,
        tax: taxAmount,
        total,
        balance
      }))
    }
    
    setProductSelectOpen('')
    setProductSearchQuery('')

    // Focus the quantity input of the just-selected product
    afterPaint(() => {
      const qtyInput = qtyInputRefs.current[itemId]
      if (qtyInput) {
        qtyInput.focus()
        qtyInput.select()
      }
    })
  }, [invoice.items, invoice.discount, invoice.deliveryCharge, invoice.serviceCharge, invoice.paidAmount, taxRate, calculateTotals, setInvoice, products, setProducts])

  // Selecting a flat catalog row (product or real variant) — builds the product-shaped
  // object handleProductSelect expects, using the *variant's* real price/cost/stock
  // when the row is a variant, and wires variantId straight through.
  const handleCatalogItemSelect = useCallback(
    (itemId: string, catalogItem: PurchaseCatalogItem) => {
      const builtProduct = {
        id: catalogItem.productId,
        _id: catalogItem.productId,
        // catalogItem.name already reads "Toshiba — 12" for a variant row —
        // productName alone would lose the variant label the user just picked.
        name: catalogItem.name,
        nameUrdu: catalogItem.nameUrdu,
        image: catalogItem.image,
        barcode: catalogItem.barcode,
        unit: catalogItem.unit,
        hasVariants: catalogItem.type === 'variant',
        trackImei: catalogItem.trackImei,
        trackBatch: catalogItem.trackBatch,
        trackExpiry: catalogItem.trackExpiry,
        knownBatches: catalogItem.batches,
        price: catalogItem.price,
        cost: catalogItem.cost,
        stockQuantity: catalogItem.stockQuantity,
      }
      handleProductSelect(itemId, builtProduct, catalogItem.variantId)
    },
    [handleProductSelect]
  )

  // Switching which batch a line item deducts from on save (no automatic FEFO
  // splitting yet — see docs/architecture/universal-product-migration.md). Different
  // batches can have been bought at, and intended to sell for, different prices —
  // switch both cost AND sale price (unitPrice) to match the batch actually picked,
  // not just its identity. When the picked batch doesn't carry its own sellingPrice
  // (e.g. a legacy batch created before that field existed), falls back to the
  // product/variant's own price — NOT to whatever the line currently shows — so
  // re-selecting an earlier batch reliably resets the price instead of silently
  // keeping whatever the last-selected batch left behind.
  const updateItemBatch = useCallback((itemId: string, batchId: string, batchNumber: string, costPerUnit?: number, sellingPrice?: number, basePrice?: number) => {
    setInvoice(prev => {
      const newItems = prev.items.map(item => {
        if (item.id !== itemId) return item
        const cost = costPerUnit ?? item.cost
        const unitPrice = sellingPrice ?? basePrice ?? item.unitPrice
        const selectedProduct = products.find((p) => (p._id || p.id) === item.productId) || { unit: item.unit }
        const lineValues = calculateInvoiceLineValues({
          product: selectedProduct,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice,
          cost,
          conversionFactor: item.conversionFactor,
        })
        if (!lineValues) return { ...item, batchId, batchNumber, cost, profit: item.subtotal - (cost * item.quantity) }
        return {
          ...item,
          batchId,
          batchNumber,
          cost,
          unitPrice,
          subtotal: lineValues.subtotal,
          profit: lineValues.profit,
        }
      })
      if (!calculateTotals) return { ...prev, items: newItems }
      const totals = calculateTotals(newItems, prev.discount, prev.deliveryCharge || 0, prev.serviceCharge || 0)
      return {
        ...prev,
        items: newItems,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        totalProfit: totals.totalProfit,
        totalCost: totals.totalCost,
      }
    })
  }, [setInvoice, calculateTotals, products])

  const addNewRowAndOpenProduct = useCallback(() => {
    const nextEmptyRow = invoice.items.find((item) => item.isManualEntry && !item.productId)
    if (nextEmptyRow) {
      setProductSelectOpen(nextEmptyRow.id)
      return
    }
    const newItem = createEmptyManualInvoiceItem()
    setInvoice((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }))
    // No delay needed — React batches this with the setInvoice above into a single
    // render, so the new row mounts with its popover already open.
    setProductSelectOpen(newItem.id)
  }, [invoice.items, setInvoice])

  const openProductSelectorForEntry = useCallback(() => {
    const emptyRow = invoice.items.find((item) => item.isManualEntry && !item.productId)
    if (emptyRow) {
      setProductSelectOpen(emptyRow.id)
      return
    }
    const lastManual = [...invoice.items].reverse().find((item) => item.isManualEntry)
    if (lastManual) {
      setProductSelectOpen(lastManual.id)
      return
    }
    addNewRowAndOpenProduct()
  }, [invoice.items, addNewRowAndOpenProduct])

  const handleQuantityKeyDown = useCallback((e: React.KeyboardEvent, currentItemId: string) => {
    onEnterAdvance(e, () => focusField(priceInputRefs.current[currentItemId]))
  }, [])

  const handlePriceKeyDown = useCallback((e: React.KeyboardEvent) => {
    onEnterAdvance(e, addNewRowAndOpenProduct)
  }, [addNewRowAndOpenProduct])

  const focusInvoiceType = useCallback(() => focusField(invoiceTypeTriggerRef.current), [])
  const focusInvoiceDate = useCallback(() => focusField(invoiceDateRef.current), [])

  const openQuickCreate = useCallback(
    (type: 'customer' | 'product', defaultName?: string, productItemId?: string) => {
      setQuickCreate({ type, defaultName: defaultName?.trim() || undefined })
      if (productItemId) setQuickCreateProductItemId(productItemId)
      if (type === 'customer') setCustomerSelectOpen(false)
      if (type === 'product') {
        setProductSelectOpen('')
        setProductSearchQuery('')
      }
    },
    [],
  )

  // The create dialogs already POST and return the saved entity — reuse that
  // response directly instead of re-fetching the entire products/customers list
  // (which was firing a full /products or /customers?limit=1000 request on every
  // single quick-create).
  const handleQuickCreated = useCallback(
    (type: 'customer' | 'supplier' | 'product', entity: any) => {
      if (type === 'customer') {
        const customerId = entity._id || entity.id
        setCustomers?.((prev) => {
          const list = prev || []
          return list.some((c: any) => (c._id || c.id) === customerId) ? list : [...list, entity]
        })
        setInvoice((prev) => ({
          ...prev,
          customerId,
          customerName: entity.name,
          type: 'credit',
        }))
        setCustomerSearchQuery('')
        focusInvoiceType()
        return
      }

      if (type === 'product') {
        const productId = entity._id || entity.id
        setProducts((prev) => (prev.some((p: any) => (p._id || p.id) === productId) ? prev : [...prev, entity]))

        // Keep the item picker and catalog panel in sync without a /purchasable
        // refetch — insert a best-effort row straight into the RTK Query cache.
        // (The create endpoint returns the raw, unpopulated doc, so brand/category
        // objects may be missing here; they'll fill in on the next natural refetch.)
        dispatch(
          purchaseCatalogApi.util.updateQueryData('getPurchasableCatalog', undefined, (draft) => {
            if (draft.some((row) => row.productId === productId)) return
            draft.push({
              type: 'product',
              id: productId,
              productId,
              name: entity.name,
              nameUrdu: entity.nameUrdu,
              barcode: entity.barcode,
              image: entity.image,
              unit: entity.unit,
              trackImei: entity.trackImei,
              brand: entity.brand ?? null,
              categories: entity.categories ?? [],
              price: entity.price,
              cost: entity.cost,
              stockQuantity: entity.stockQuantity,
              trackBatch: entity.trackBatch,
              trackExpiry: entity.trackExpiry,
              batches: entity.batches,
            })
          }),
        )

        // Not created from a specific row's "no results" prompt (e.g. the header
        // "Add Product" button) — reuse the first still-empty row if there is one,
        // otherwise add a fresh row, so the new product always ends up selected.
        let targetItemId = quickCreateProductItemId
        let targetItems = invoice.items
        if (!targetItemId) {
          const emptyItem = invoice.items.find((item) => !item.productId)
          if (emptyItem) {
            targetItemId = emptyItem.id
          } else {
            const newItem = createEmptyManualInvoiceItem()
            targetItemId = newItem.id
            targetItems = [...invoice.items, newItem]
            setInvoice((prev) => ({ ...prev, items: [...prev.items, newItem] }))
          }
        }

        handleProductSelect(targetItemId, entity, undefined, targetItems)
        setQuickCreateProductItemId(null)
      }
    },
    [
      dispatch,
      focusInvoiceType,
      handleProductSelect,
      invoice.items,
      quickCreateProductItemId,
      setCustomers,
      setInvoice,
      setProducts,
    ],
  )

  const handleDiscountChange = useCallback((value: string) => {
    setDiscountInput(value)
    const discountAmount = parseFloat(value) || 0
    updateDiscount(discountAmount)
  }, [updateDiscount])

  const handlePaidAmountChange = useCallback((value: string) => {
    setPaidAmountInput(value)
    const paidAmount = parseFloat(value) || 0
    setInvoice(prev => ({
      ...prev,
      paidAmount,
      balance: prev.total - paidAmount
    }))
  }, [setInvoice])

  const handleSaveInvoice = useCallback(async (printType: 'none' | PaperSize = 'none') => {
    // Validate required fields
    if (!invoice.customerId) {
      toast.error('Please select a customer')
      return
    }

    // Filter out empty auto-added entries (from multi-entry flow)
    const itemsWithProducts = invoice.items.filter(item => item.productId && item.name)

    if (itemsWithProducts.length === 0) {
      toast.error('Please add items to the invoice')
      return
    }

    // Check if user is authenticated
    const token = localStorage.getItem('accessToken')
    if (!token) {
      toast.error('Please login to save invoice')
      return
    }

    // Set the saving state for the specific button
    setSavingType(printType)

    try {
      if (SHOW_INVOICE_PAYMENT_METHOD_UI && invoice.paymentMethod === 'wallet' && !invoice.walletType) {
        toast.error('Please select a wallet for wallet payment')
        return
      }

      // Prepare invoice data for API
      const validItems = invoice.items.filter(item => {
        // Include items that have productId and name (completed items)
        return item.productId && item.name
      })

      // Validate that we have valid items
      if (validItems.length === 0) {
        toast.error('Please select products for all items before saving')
        return
      }

      // IMEI-tracked products must have exactly one IMEI selected per unit sold
      for (const item of validItems) {
        const product = products.find((p: any) => (p._id || p.id) === item.productId)
        if (!product?.trackImei) continue
        const imeiCount = (item.imeis || []).length
        if (imeiCount !== item.quantity) {
          toast.error(`${item.name}: select ${item.quantity} IMEI number(s) — ${imeiCount} selected`)
          return
        }
      }

      const invoiceData = {
        items: validItems.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          name: item.name,
          nameUrdu: item.nameUrdu,
          image: item.image,
          quantity: item.quantity,
          unit: item.unit,
          conversionFactor: item.conversionFactor,
          stockQuantity: item.stockQuantity,
          unitPrice: item.unitPrice,
          cost: item.cost,
          subtotal: item.subtotal,
          profit: item.profit,
          isManualEntry: item.isManualEntry || false,
          imeis: item.imeis || [],
        })),
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        walkInCustomerName: invoice.walkInCustomerName,
        type: invoice.type,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        discount: invoice.discount,
        total: invoice.total,
        totalProfit: invoice.totalProfit,
        totalCost: invoice.totalCost,
        paidAmount: invoice.paidAmount,
        balance: invoice.balance,
        notes: normalizeInvoiceNotesHtml(invoice.notes || ''),
        receivedByName: invoice.type === 'pending' ? (invoice.receivedByName || '').trim() : undefined,
        deliveryCharge: invoice.deliveryCharge,
        serviceCharge: invoice.serviceCharge,
        roundingAdjustment: invoice.roundingAdjustment,
        splitPayment: invoice.splitPayment,
        paymentMethod: invoice.paymentMethod || 'cash',
        walletType: invoice.paymentMethod === 'wallet' ? (invoice.walletType || '') : undefined,
        loyaltyPoints: invoice.loyaltyPoints,
        couponCode: invoice.couponCode,
        returnPolicy: invoice.returnPolicy,
        invoiceDate: invoice.invoiceDate,
        language: invoice.language,
        isUrduOnly: invoice.isUrduOnly,
      }

      // Don't include status in the payload as it's not allowed in updates
      // Status is likely managed by the backend

      console.log('Saving invoice - isEditing:', isEditing, 'editingInvoice._id:', editingInvoice?._id)
      console.log('Invoice data being sent:', invoiceData)
      
      let result: Record<string, unknown>

      const canQueueOffline = isElectron && !isEditing

      const saveOffline = async (): Promise<Record<string, unknown>> => {
        const electron = getElectronAPI()
        const syncStatus = await electron?.sync.status()
        const deviceId = syncStatus?.deviceId || 'local-device'
        const { clientId, localInvoiceNumber, operation } = buildOfflineInvoicePayload(invoiceData, deviceId)
        await electron?.sync.queue(operation)
        dispatch(invoiceApi.util.invalidateTags(['Invoice']))
        toast.success(`Invoice ${localInvoiceNumber} saved offline. It will sync when you are back online.`)
        return {
          ...invoiceData,
          id: clientId,
          invoiceNumber: localInvoiceNumber,
          _offline: true,
        }
      }

      if (canQueueOffline && !online) {
        result = await saveOffline()
      } else if (isEditing && editingInvoice?._id) {
        result = await updateInvoice({ id: editingInvoice._id, ...invoiceData }).unwrap()
      } else {
        try {
          result = await createInvoice(invoiceData).unwrap()
        } catch (error) {
          if (canQueueOffline && isApiUnreachable(error)) {
            result = await saveOffline()
          } else {
            throw error
          }
        }
      }
      
      console.log('Save result:', result)
      
      const successMessage =
        result._offline || (canQueueOffline && !online)
        ? null
        : isEditing 
        ? `Invoice ${editingInvoice?.invoiceNumber || result.invoiceNumber} updated successfully!`
        : `Invoice ${result.invoiceNumber} created successfully!`
      
      if (successMessage) {
        toast.success(successMessage)
      }
      
      // Call success callback to commit stock changes
      if (onSaveSuccess) {
        onSaveSuccess()
      }

      // Refresh customer balance after successful save and prepare print data
      let updatedBalance = customerBalance
      if (invoice.customerId && invoice.customerId !== 'walk-in') {
        try {
          const url = `${summery.fetchCustomerBalance.url}/${invoice.customerId}${summery.fetchCustomerBalance.urlSuffix || ''}`
          const response = await Axios.get(url)
          updatedBalance = response.data.balance || 0
          setCustomerBalance(updatedBalance)
          console.log('Customer balance refreshed:', updatedBalance)
        } catch (error) {
          console.error('Failed to refresh customer balance:', error)
        }
      }
      
      // Always resolve customer name (needed for both printing and sending)
      let resolvedCustomerName: string | undefined
      let resolvedWalkInCustomerName: string | undefined

      if (result.customerId === 'walk-in') {
        resolvedWalkInCustomerName =
          (result.walkInCustomerName as string | undefined) ||
          invoice.walkInCustomerName ||
          editingInvoice?.walkInCustomerName ||
          undefined
      } else {
        resolvedCustomerName =
          invoice.customerName ||
          (result.customerName as string | undefined) ||
          editingInvoice?.customerName ||
          customers.find(c => (c._id || c.id) === (result.customerId || invoice.customerId || editingInvoice?.customerId))?.name ||
          undefined
      }

      let resolvedCustomerUrdu = ''
      const cidForUrdu = result.customerId ?? invoice.customerId ?? editingInvoice?.customerId
      if (cidForUrdu && cidForUrdu !== 'walk-in') {
        if (typeof cidForUrdu === 'object' && cidForUrdu != null && 'nameUrdu' in cidForUrdu) {
          resolvedCustomerUrdu = String((cidForUrdu as { nameUrdu?: string }).nameUrdu || '').trim()
        } else {
          const idStr = String(cidForUrdu)
          resolvedCustomerUrdu = customers.find((c) => String(c._id || c.id) === idStr)?.nameUrdu?.trim() || ''
        }
      }

      const invoiceTotal = Number(result.total ?? invoice.total ?? 0)
      const invoicePaid = Number(result.paidAmount ?? invoice.paidAmount ?? 0)
      const invoiceEffect = invoiceTotal - invoicePaid
      const previousBalanceBeforeInvoice = updatedBalance - invoiceEffect

      // Cast result as any so spread properties (type, subtotal, tax, etc.) remain accessible
      const r = result as any
      const savedInvoicePayload = {
        ...r,
        invoiceNumber: r.invoiceNumber || editingInvoice?.invoiceNumber,
        items: validItems,
        customerId: r.customerId || invoice.customerId || editingInvoice?.customerId,
        customerName: resolvedCustomerName,
        customerNameUrdu: resolvedCustomerUrdu || undefined,
        walkInCustomerName: resolvedWalkInCustomerName,
        previousBalance: previousBalanceBeforeInvoice,
        newBalance: updatedBalance,
        language: (r.language as string | undefined) || invoice.language,
        isUrduOnly: (r.isUrduOnly as boolean | undefined) ?? invoice.isUrduOnly,
        invoiceDate: (r.invoiceDate as string | undefined) || invoice.invoiceDate,
        notes: (r.notes as string | undefined) ?? invoice.notes,
        receivedByName: (r.receivedByName as string | undefined) ?? invoice.receivedByName,
      }

      // Handle print
      if (printType !== 'none') {
        if (PAPER_FORMATS[printType].family === 'thermal') {
          printInvoice(savedInvoicePayload, resolveThermalSize(printType))
        } else {
          printA4Invoice(savedInvoicePayload, resolveSheetFormat(printType, printOrientation))
        }
      }

      // Handle persistent send method (runs additionally after any save/print)
      // Both SMS and WhatsApp fire immediately — no confirmation dialog.
      if (sendMethod !== 'none') {
        const customerId = resolveCustomerIdString(savedInvoicePayload.customerId)
        // SMS/WhatsApp only for registered customers — walk-in has no phone record
        if (!customerId || customerId === 'walk-in') {
          toast.info('SMS / WhatsApp is only available for registered customers.')
        } else {
          const customer = customers.find(c => String(c._id || c.id) === customerId) || null
          const custName = resolvedCustomerName || customer?.name || ''

          // Pending invoices are a goods handoff before formal billing — the SMS/WhatsApp
          // message only lists product names + qty (no prices) plus who collected them,
          // always in Urdu, instead of the usual financial summary.
          const isPendingHandoff = savedInvoicePayload.type === 'pending'
          const pendingMessage = () => buildPendingInvoiceItemsMessageUrdu({
            branchName: orgData?.name || branchData?.name,
            invoiceNumber: String(savedInvoicePayload.invoiceNumber || ''),
            items: validItems.map((item: any) => ({
              name: item.name,
              nameUrdu: item.nameUrdu,
              quantity: item.quantity,
              unit: item.unit,
            })),
            receivedByName: savedInvoicePayload.receivedByName,
          })

          const sendSmsNow = async () => {
            // Fetch fresh from API to ensure we have the phone field
            const contact = await fetchAndStashPrintContact(customerId)
            const phone = contact.phone?.trim() || customer?.phone?.trim() || ''
            if (!phone) {
              toast.error(`No phone number for ${custName || 'this customer'}. Add it in the Customers section first.`)
              return
            }
            const msg = isPendingHandoff ? pendingMessage() : buildInvoiceSmsMessage({
              branchName: orgData?.name || branchData?.name,
              invoiceNumber: String(savedInvoicePayload.invoiceNumber || ''),
              customerName: custName || undefined,
              total: Number(savedInvoicePayload.total ?? 0),
              paidAmount: Number(savedInvoicePayload.paidAmount ?? 0),
              previousBalance: Number(savedInvoicePayload.previousBalance ?? 0),
              newBalance: Number(savedInvoicePayload.newBalance ?? 0),
            })
            try {
              await sendSms({ to: phone, message: msg, source: 'invoice' }).unwrap()
              toast.success(`SMS sent to ${custName || phone}`)
            } catch (err: any) {
              toast.error(err?.data?.message || 'Failed to send SMS — is a device connected?')
            }
          }

          const sendWhatsAppNow = async () => {
            if (isPendingHandoff) {
              const contact = await fetchAndStashPrintContact(customerId)
              const wpPhone = contact.whatsapp?.trim() || contact.phone?.trim() || customer?.phone?.trim() || ''
              if (!wpPhone) {
                toast.error(`No phone/WhatsApp number for ${custName || 'this customer'}. Add it in the Customers section first.`)
                return
              }
              setIsWhatsAppSending(true)
              try {
                await sendWhatsAppMessage({
                  phone: wpPhone,
                  message: pendingMessage(),
                  templateCategory: 'pending_invoice',
                  templateParams: [
                    String(savedInvoicePayload.invoiceNumber || ''),
                    buildPendingInvoiceItemsSummaryUrdu(
                      validItems.map((item: any) => ({
                        name: item.name,
                        nameUrdu: item.nameUrdu,
                        quantity: item.quantity,
                        unit: item.unit,
                      })),
                    ),
                    savedInvoicePayload.receivedByName?.trim() || '-',
                  ],
                }).unwrap()
                toast.success('WhatsApp message sent')
              } catch (err: any) {
                toast.error(err?.data?.message || 'Failed to send on WhatsApp')
              } finally {
                setIsWhatsAppSending(false)
              }
              return
            }
            const prevBal = savedInvoicePayload.previousBalance ?? customerBalance
            const netBal = (prevBal || 0) + (savedInvoicePayload.total || 0) - (savedInvoicePayload.paidAmount || 0)
            const printData = withCustomerContactForPrint({
              invoiceNumber: savedInvoicePayload.invoiceNumber,
              items: validItems.map((item: any) => ({
                name: item.name,
                nameUrdu: item.nameUrdu,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.quantity * item.unitPrice,
                imeis: item.imeis,
              })),
              customerId: savedInvoicePayload.customerId,
              customerName: resolvedCustomerName,
              walkInCustomerName: resolvedWalkInCustomerName,
              type: savedInvoicePayload.type,
              subtotal: savedInvoicePayload.subtotal,
              tax: savedInvoicePayload.tax,
              discount: savedInvoicePayload.discount,
              total: savedInvoicePayload.total,
              paidAmount: savedInvoicePayload.paidAmount,
              balance: savedInvoicePayload.balance,
              notes: savedInvoicePayload.notes,
              invoiceAddress: branchData?.location?.address?.trim() || undefined,
              invoiceAddressUrdu: branchData?.location?.addressUrdu?.trim() || undefined,
              deliveryCharge: savedInvoicePayload.deliveryCharge,
              serviceCharge: savedInvoicePayload.serviceCharge,
              previousBalance: prevBal,
              netBalance: netBal,
              companyName: orgData?.name || branchData?.name,
              companyNameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim() || undefined,
              companyPhone: branchData?.phone,
              companyEmail: branchData?.email,
              companyLogo: orgData?.logo?.url,
              isTrial: orgData?.subscription?.isTrial,
              language: savedInvoicePayload.language,
              isUrduOnly: savedInvoicePayload.isUrduOnly,
              invoiceDate: savedInvoicePayload.invoiceDate,
              printInUrdu: getInvoicePrintInUrdu(),
              printAsQuotation: savedInvoicePayload.type === 'quotation',
            }, savedInvoicePayload, customer)
            const wpPhone = printData.customerPhone?.trim() || printData.customerWhatsapp?.trim() || ''
            if (!wpPhone) {
              toast.error(`No phone/WhatsApp number for ${custName || 'this customer'}. Add it in the Customers section first.`)
              return
            }
            setIsWhatsAppSending(true)
            try {
              const res = await sendInvoiceReceiptWhatsApp({ printData, phone: wpPhone, template: invoiceTemplate })
              if (res.success) toast.success('Invoice sent on WhatsApp')
              else toast.error(res.error || 'Failed to send on WhatsApp')
            } finally {
              setIsWhatsAppSending(false)
            }
          }

          // Fire-and-forget — save/print already completed, sending runs in the background
          if (sendMethod === 'sms' || sendMethod === 'both') sendSmsNow()
          if (sendMethod === 'whatsapp' || sendMethod === 'both') sendWhatsAppNow()
        } // end else (registered customer)
      }

    } catch (error: any) {
      console.error('Error saving invoice:', error)

      if (error?.status === 401) {
        toast.error('Authentication failed. Please login again.')
      } else {
        toast.error(error?.data?.message || 'Failed to save invoice')
      }
    } finally {
      setSavingType(null)
    }
  }, [invoice, createInvoice, updateInvoice, isEditing, editingInvoice, t, printInvoice, printA4Invoice, customers, onSaveSuccess, customerBalance, isElectron, online, orgData, branchData, sendMethod, printOrientation, sendSms, sendWhatsAppMessage, invoiceTemplate])

  useInvoiceSaveShortcuts(
    () => handleSaveInvoice('none'),
    () => handleSaveInvoice(defaultPaperSize),
    () => handleSaveInvoice(resolveSheetSize(defaultPaperSize)),
    savingType !== null,
  )

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'cash': return 'bg-green-100 text-green-800'
      case 'credit': return 'bg-blue-100 text-blue-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'quotation': return 'bg-violet-100 text-violet-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // const getStatusColor = (status: string) => {
  //   switch (status) {
  //     case 'paid': return 'bg-green-100 text-green-800'
  //     case 'finalized': return 'bg-purple-100 text-purple-800'
  //     case 'draft': return 'bg-blue-100 text-blue-800'
  //     case 'cancelled': return 'bg-gray-100 text-gray-800'
  //     case 'overdue': return 'bg-red-100 text-red-800'
  //     case 'pending': return 'bg-yellow-100 text-yellow-800'
  //     default: return 'bg-gray-100 text-gray-800'
  //   }
  // }

  return (
    <div className='space-y-4'>
      {/* Keyboard Language Override 
      <KeyboardLanguageOverride />*/}
      
      {/* Customer and Type Selection */}
      <Card>
        <CardHeader>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
            <CardTitle className='flex items-center gap-2'>
              {onBackToList && (
                <Button variant="ghost" size="sm" onClick={onBackToList}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <DollarSign className='h-5 w-5' />
              {t('invoice_details')}
            </CardTitle>

            <div className='flex w-full flex-wrap items-center gap-x-6 gap-y-2 lg:w-auto lg:justify-end'>
              <div className='flex items-center gap-2'>
                <Label htmlFor='invoice-print-urdu-header' className='text-sm font-normal whitespace-nowrap'>
                  {t('urdu_print')}
                </Label>
                <Switch
                  id='invoice-print-urdu-header'
                  checked={printReceiptInUrdu}
                  onCheckedChange={(v) => {
                    setPrintReceiptInUrdu(v)
                    setInvoicePrintInUrdu(v)
                  }}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {/* Show invoice number in edit mode */}
          {isEditing && editingInvoice?.invoiceNumber && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <Label className="font-medium text-blue-800 flex-shrink-0">Invoice Number:</Label>
                <span 
                  className="font-bold text-blue-900 truncate" 
                  title={editingInvoice.invoiceNumber}
                >
                  {editingInvoice.invoiceNumber}
                </span>
              </div>
            </div>
          )}
          
          <div className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
            <div>
              <Label htmlFor="customer" className='mb-2'>
                {t('customer')} <span className="text-red-500">*</span>
              </Label>
              <div className="flex gap-2">
              <Popover open={customerSelectOpen} onOpenChange={setCustomerSelectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerSelectOpen}
                    onKeyDown={(e) => {
                      if (!customerSelectOpen && invoice.customerId) {
                        onEnterAdvance(e, focusInvoiceType)
                      }
                    }}
                    className={`flex-1 justify-between min-h-[2.5rem] h-auto py-0 ${
                      !invoice.customerId ? 'border-red-500 bg-red-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Search className="w-4 h-4 flex-shrink-0" />
                      {invoice.customerId ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {invoice.customerId === 'walk-in' ? (
                            <Badge variant="secondary" className="flex items-center gap-1 max-w-full min-w-0">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <span className="text-xs truncate" title={t('walk_in_customer')}>
                                {t('walk_in_customer')}
                              </span>
                            </Badge>
                          ) : (
                            (() => {
                              const selectedCustomer = customers.find(c => (c._id || c.id) === invoice.customerId)
                              console.log('Customer search:', { 
                                customerId: invoice.customerId, 
                                customerName: invoice.customerName,
                                walkInCustomerName: invoice.walkInCustomerName,
                                selectedCustomer,
                                customersLength: customers.length 
                              })
                              
                              if (selectedCustomer) {
                                const urdu = selectedCustomer.nameUrdu?.trim()
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1.5 max-w-full min-w-0 pl-1">
                                    <ContactPhotoCell
                                      picture={selectedCustomer.picture}
                                      name={selectedCustomer.name || ''}
                                      className="h-5 w-5 shrink-0 rounded-full"
                                    />
                                    <span className="flex min-w-0 flex-row flex-wrap items-center gap-x-1.5 gap-y-0">
                                      <span className={getTextClasses(selectedCustomer.name, 'text-xs truncate shrink-0')} title={selectedCustomer.name}>
                                        {selectedCustomer.name}
                                      </span>
                                      {selectedCustomer.isEmployeeAccount ? (
                                        <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={t('Employee')} />
                                      ) : null}
                                      {urdu ? (
                                        <span dir="rtl" className={cn('min-w-0 truncate text-xs', getUrduSecondaryNameClasses(urdu))} title={urdu}>
                                          {urdu}
                                        </span>
                                      ) : null}
                                    </span>
                                  </Badge>
                                )
                              } else if (invoice.customerName) {
                                // Fallback to showing the stored customer name if customer not found in list
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1.5 max-w-full pl-1">
                                    <ContactPhotoCell
                                      picture={undefined}
                                      name={invoice.customerName}
                                      className="h-5 w-5 shrink-0 rounded-full"
                                    />
                                    <span className={getTextClasses(invoice.customerName, "text-xs truncate")} title={invoice.customerName}>
                                      {invoice.customerName}
                                    </span>
                                  </Badge>
                                )
                              } else if (invoice.walkInCustomerName) {
                                // Show walk-in customer name
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1 max-w-full">
                                    <User className="w-3 h-3 flex-shrink-0" />
                                    <span className={getTextClasses(invoice.walkInCustomerName, "text-xs truncate")} title={invoice.walkInCustomerName}>
                                      {invoice.walkInCustomerName}
                                    </span>
                                  </Badge>
                                )
                              }
                              return null
                            })()
                          )}
                        </div>
                      ) : (
                        <span className={`truncate ${
                          !invoice.customerId ? 'text-red-500' : 'text-muted-foreground'
                        }`} title={t('select_customer')}>
                          {t('select_customer')} {!invoice.customerId && '*'}
                        </span>
                      )}
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align={isRTL ? "end" : "start"} side="bottom" sideOffset={4}>
                  <Command shouldFilter={false}>
                    <div className="relative">
                      <CommandInput 
                        placeholder={t('search_customers_by_name_or_phone')} 
                        value={customerSearchQuery}
                        onValueChange={setCustomerSearchQuery}
                        className="pr-10"
                      />
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10">
                        <VoiceInputButton 
                          onTranscript={(text) => {
                            setCustomerSearchQuery(text);
                          }}
                          language={voiceLanguage}
                          size="sm"
                        />
                      </div>
                    </div>
                    {customersLoading ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                        {t('Loading customers...')}
                      </div>
                    ) : filteredCustomers.length === 0 && customerSearchQuery.trim() ? (
                      canCreateCustomer ? (
                        <EntityCreateEmptyPrompt
                          message={t('no_customers_found')}
                          actionLabel={t('add_customer')}
                          onCreate={() => openQuickCreate('customer', customerSearchQuery)}
                        />
                      ) : (
                        <CommandEmpty>{t('no_customers_found')}</CommandEmpty>
                      )
                    ) : null}
                    <CommandList className="max-h-[300px] overflow-y-auto">
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setInvoice(prev => ({ ...prev, customerId: 'walk-in' }))
                            setCustomerSelectOpen(false)
                            setCustomerSearchQuery('')
                            focusInvoiceType()
                          }}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <User className="w-4 h-4" />
                            <span>{t('walk_in_customer')}</span>
                          </div>
                          {invoice.customerId === 'walk-in' && (
                            <div className="w-4 h-4 rounded-sm flex items-center justify-center">
                              <Check className="w-3 h-3 text-black" />
                            </div>
                          )}
                        </CommandItem>
                        {visibleCustomers.map((customer) => {
                          const customerId = customer._id || customer.id
                          const isSelected = invoice.customerId === customerId
                          return (
                            <CommandItem
                              key={customerId}
                              onSelect={() => {
                                setInvoice(prev => ({ 
                                  ...prev, 
                                  customerId,
                                  customerName: customer.name, // Set customer name for editing
                                  type: 'credit',
                                }))
                                setCustomerSelectOpen(false)
                                setCustomerSearchQuery('')
                                focusInvoiceType()
                              }}
                              className="flex items-center gap-3 cursor-pointer p-3"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <ContactPhotoCell
                                  picture={customer.picture}
                                  name={customer.name || ''}
                                  className="h-8 w-8 shrink-0"
                                />
                                <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                                  <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                                    <span className={getTextClasses(customer.name, 'truncate font-medium shrink-0')} title={customer.name}>
                                      {customer.name}
                                    </span>
                                    {customer.isEmployeeAccount ? (
                                      <Badge variant="outline" className="flex items-center gap-1 shrink-0 px-1.5 py-0 text-[10px] font-normal">
                                        <Briefcase className="h-2.5 w-2.5" />
                                        {t('Employee')}
                                      </Badge>
                                    ) : null}
                                    {customer.nameUrdu?.trim() ? (
                                      <span
                                        dir="rtl"
                                        className={cn('min-w-0 truncate', getUrduSecondaryNameClasses(customer.nameUrdu))}
                                        title={customer.nameUrdu.trim()}
                                      >
                                        {customer.nameUrdu.trim()}
                                      </span>
                                    ) : null}
                                  </div>
                                  {customer.phone && (
                                    <span className="text-xs text-muted-foreground truncate" title={customer.phone}>
                                      {customer.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0">
                                  <Check className="w-3 h-3 text-black" />
                                </div>
                              )}
                            </CommandItem>
                          )
                        })}
                        {canCreateCustomer ? (
                          <CommandItem
                            onSelect={() => openQuickCreate('customer', customerSearchQuery)}
                            className="flex cursor-pointer items-center gap-2 border-t p-3 text-primary"
                          >
                            <Plus className="h-4 w-4" />
                            <span>{t('add_customer')}</span>
                          </CommandItem>
                        ) : null}
                      </CommandGroup>
                    </CommandList>
                    {filteredCustomers.length > visibleCustomers.length ? (
                      <div className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
                        {t('Showing {{shown}} of {{total}} — keep typing to narrow', {
                          shown: visibleCustomers.length,
                          total: filteredCustomers.length,
                        })}
                      </div>
                    ) : null}
                  </Command>
                </PopoverContent>
              </Popover>
              {canCreateCustomer ? (
                <EntityCreateShortcutButton
                  label={t('add_customer')}
                  onClick={() => openQuickCreate('customer', customerSearchQuery)}
                />
              ) : null}
              </div>
            </div>
            
            <div>
              <Label htmlFor="type" className='mb-2'>{t('invoice_type')}</Label>
              <Select
                value={invoice.type}
                onOpenChange={setInvoiceTypeSelectOpen}
                onValueChange={(value: 'cash' | 'credit' | 'pending' | 'quotation') => updateInvoiceType(value)}
              >
                <SelectTrigger
                  ref={invoiceTypeTriggerRef}
                  className='w-full'
                  onKeyDown={(e) => {
                    if (!invoiceTypeSelectOpen) {
                      onEnterAdvance(e, focusInvoiceDate)
                    }
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('cash')}</SelectItem>
                  {/* Disable credit and pending for walk-in customers */}
                  <SelectItem 
                    value="credit" 
                    disabled={invoice.customerId === 'walk-in'}
                  >
                    {t('credit')}
                  </SelectItem>
                  <SelectItem 
                    value="pending" 
                    disabled={invoice.customerId === 'walk-in'}
                  >
                    {t('pending')}
                  </SelectItem>
                  <SelectItem 
                    value="quotation" 
                    disabled={invoice.customerId === 'walk-in'}
                  >
                    {t('quotation') || 'Quotation'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* {isEditing && invoice.status && (
              <div>
                <Label className='mb-2'>{t('status') || 'Status'}</Label>
                <div className="flex items-center h-10 w-full">
                  <Badge className={getStatusColor(invoice.status)}>
                    {(invoice.status || 'draft').toUpperCase()}
                  </Badge>
                </div>
              </div>
            )} */}
          </div>

          <div>
            <Label htmlFor="invoiceDate">Invoice Date</Label>
            <Input
              ref={invoiceDateRef}
              type="date"
              value={invoice.invoiceDate || new Date().toISOString().split('T')[0]}
              onChange={(e) => setInvoice(prev => ({ ...prev, invoiceDate: e.target.value }))}
              onKeyDown={(e) => onEnterAdvance(e, openProductSelectorForEntry)}
            />
          </div>

          {invoice.type === 'pending' && (
            <div>
              <Label htmlFor="receivedByName">{t('received_by') || 'Received By'}</Label>
              <SmartInput
                id="receivedByName"
                placeholder={t('enter_received_by_name') || 'Name of person collecting the products'}
                value={invoice.receivedByName || ''}
                onChange={(e) => setInvoice(prev => ({ ...prev, receivedByName: e.target.value }))}
                showVoiceInput={true}
                voiceInputSize="sm"
                className="w-full"
              />
            </div>
          )}

          {invoice.customerId === 'walk-in' && (
            <div>
              <Label htmlFor="walkInCustomerName">{t('customer_name')}</Label>
              <SmartInput
                id="walkInCustomerName"
                placeholder={t('enter_customer_name')}
                value={invoice.walkInCustomerName || ''}
                onChange={(e) => setInvoice(prev => ({ ...prev, walkInCustomerName: e.target.value }))}
                showVoiceInput={true}
                voiceInputSize="sm"
                className="w-full"
              />
            </div>
          )}

          {((invoice.customerId && invoice.customerId !== 'walk-in') || invoice.type === 'pending' || invoice.type === 'quotation') && invoice.customerId !== 'walk-in' ? (
            <div>
              <Label htmlFor="customerDisplayName">{t('customer_name')}</Label>
              <SmartInput
                id="customerDisplayName"
                placeholder={t('enter_customer_name') || 'Enter customer name'}
                value={invoice.customerName || ''}
                onChange={(e) => setInvoice(prev => ({ ...prev, customerName: e.target.value }))}
                showVoiceInput={true}
                voiceInputSize="sm"
                className="w-full"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Invoice Items */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <CardTitle>{t('invoice_items')} ({invoice.items.length})</CardTitle>
            <div className="flex items-center gap-2">
              {canCreateProduct ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openQuickCreate('product', productSearchQuery)}
                  className="flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" />
                  {t('add_product')}
                </Button>
              ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const newItem = createEmptyManualInvoiceItem()
                setInvoice(prev => ({
                  ...prev,
                  items: [...prev.items, newItem],
                }))
              }}
              className='flex items-center gap-1'
            >
              <Plus className='h-4 w-4' />
              {t('add_item')}
            </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className='p-4'>
          <div ref={itemsScrollRef} className='space-y-2'>
            {invoice.items.length === 0 ? (
              <div className='text-center text-muted-foreground py-8'>
                {t('no_items_added')}
              </div>
            ) : (
              invoice.items.map((item) => {
                const currentProduct = products.find(p => (p._id || p.id) === item.productId)
                // For a real variant, `products` only ever holds the legacy/parent
                // product (its stockQuantity is a stale fallback, not this variant's
                // real number) — read the variant's live stock from the catalog instead.
                const catalogEntry = item.variantId
                  ? sellableCatalog.find(c => c.variantId === item.variantId)
                  : undefined
                const remainingStock = item.variantId ? catalogEntry?.stockQuantity : currentProduct?.stockQuantity
                return (
                  <div key={item.id} className='rounded-xl border bg-card shadow-sm overflow-hidden'>
                    {/* Row 1: Image + Name/Selector + Delete */}
                    <div className='flex items-start gap-3 p-3'>
                      {item.image?.url ? (
                        <img
                          src={item.image.url}
                          alt={item.name}
                          className='w-10 h-10 object-cover rounded-lg flex-shrink-0 mt-0.5'
                        />
                      ) : (
                        <div className='w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5'>
                          <Package className='h-5 w-5 text-muted-foreground/50' />
                        </div>
                      )}

                      <div className='flex-1 min-w-0'>
                        {item.isManualEntry ? (
                          <div className='space-y-1'>
                            <Popover
                              open={productSelectOpen === item.id}
                              onOpenChange={(open) => {
                                setProductSelectOpen(open ? item.id : '')
                                setProductSearchQuery('')
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  onKeyDown={(e) => {
                                    if (productSelectOpen !== item.id && item.productId) {
                                      onEnterAdvance(e, () => focusField(qtyInputRefs.current[item.id]))
                                    }
                                  }}
                                  className={`w-full justify-between min-h-8 h-auto py-1 text-xs ${
                                    !item.productId ? 'border-red-500 bg-red-50' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Search className="w-3 h-3 flex-shrink-0" />
                                    <span className='flex min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-0 text-left'>
                                      <span
                                        className={getTextClasses(item.name || t('select_product'), `truncate shrink-0 ${
                                          !item.productId ? 'text-red-500' : 'text-muted-foreground'
                                        }`)}
                                        title={item.name || t('select_product')}
                                      >
                                        {item.name || t('select_product')}
                                        {!item.productId && ' *'}
                                      </span>
                                      {item.nameUrdu?.trim() ? (
                                        <span
                                          className={cn('min-w-0 truncate rtl text-xs shrink', getUrduSecondaryNameClasses(item.nameUrdu))}
                                          dir='rtl'
                                          title={item.nameUrdu.trim()}
                                        >
                                          {item.nameUrdu.trim()}
                                        </span>
                                      ) : null}
                                    </span>
                                  </div>
                                  <ChevronDown className="h-3 w-3 opacity-50 flex-shrink-0" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[560px] p-0" align="start" side="bottom" sideOffset={4}>
                                <Command shouldFilter={false}>
                                  <div className="relative">
                                    <CommandInput
                                      placeholder={t('search_products')}
                                      value={productSearchQuery}
                                      onValueChange={setProductSearchQuery}
                                    />
                                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10">
                                    <VoiceInputButton
                                      onTranscript={setProductSearchQuery}
                                      language={voiceLanguage}
                                      size="sm"
                                    />
                                  </div>
                                </div>
                                <CommandList className="max-h-[300px] overflow-y-auto">
                                  {productsLoading && filteredSellableProducts.length === 0 ? (
                                    <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                                      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                                      {t('loading_products')}
                                    </div>
                                  ) : filteredSellableProducts.length === 0 ? (
                                    canCreateProduct ? (
                                      <EntityCreateEmptyPrompt
                                        message={t('no_products_found')}
                                        actionLabel={t('add_product')}
                                        onCreate={() => openQuickCreate('product', productSearchQuery, item.id)}
                                      />
                                    ) : (
                                      <div className="py-6 text-center text-sm text-muted-foreground">
                                        {t('no_products_found')}
                                      </div>
                                    )
                                  ) : (
                                    <CommandGroup>
                                      {visibleSellableProducts.map((catalogItem) => (
                                        <CommandItem
                                          key={catalogItem.id}
                                          value={`${catalogItem.id}-${catalogItem.name}`}
                                          onSelect={() => handleCatalogItemSelect(item.id, catalogItem)}
                                          className="flex items-center gap-2 cursor-pointer p-3"
                                        >
                                          <div className="flex items-center gap-3 flex-1 min-w-0">
                                            {catalogItem.image?.url ? (
                                              <img
                                                src={catalogItem.image.url}
                                                alt={catalogItem.name}
                                                className="w-8 h-8 object-cover rounded flex-shrink-0"
                                              />
                                            ) : (
                                              <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                                <Package className="w-4 h-4 text-muted-foreground" />
                                              </div>
                                            )}
                                            <div className="flex flex-col flex-1 min-w-0">
                                              <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                                                <span className={getTextClasses(catalogItem.name, 'text-sm font-medium truncate shrink-0')} title={catalogItem.name}>
                                                  {catalogItem.name}
                                                </span>
                                                {catalogItem.nameUrdu?.trim() ? (
                                                  <span
                                                    dir="rtl"
                                                    className={cn('min-w-0 truncate text-xs', getUrduSecondaryNameClasses(catalogItem.nameUrdu))}
                                                    title={catalogItem.nameUrdu.trim()}
                                                  >
                                                    {catalogItem.nameUrdu.trim()}
                                                  </span>
                                                ) : null}
                                                {catalogItem.brand?.name && (
                                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                                                    {catalogItem.brand.name}
                                                  </Badge>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>Rs{Number(catalogItem.price || 0).toFixed(2)}</span>
                                                <span
                                                  className={catalogItem.stockQuantity <= 0 ? 'text-red-600 font-medium' : catalogItem.stockQuantity <= 5 ? 'text-red-500 font-medium' : catalogItem.stockQuantity <= 20 ? 'text-amber-500' : 'text-green-600'}
                                                >
                                                  Stock: {catalogItem.stockQuantity}
                                                </span>
                                                <span
                                                  className={cn(
                                                    'text-amber-600 dark:text-amber-400 font-medium transition-all duration-200 select-none',
                                                    showProductCost
                                                      ? 'cursor-default'
                                                      : 'cursor-pointer blur-sm opacity-60 hover:blur-none hover:opacity-100',
                                                  )}
                                                  title="Purchase cost"
                                                >
                                                  Cost: Rs{Number(catalogItem.cost || 0).toFixed(2)}
                                                </span>
                                                {catalogItem.trackBatch && catalogItem.batches && catalogItem.batches.length > 0 && (
                                                  <span
                                                    className="text-blue-600"
                                                    title={catalogItem.batches.map(b => `${b.batchNumber}: ${b.quantity} left${b.expiryDate ? ` (exp ${new Date(b.expiryDate).toLocaleDateString()})` : ''}`).join(', ')}
                                                  >
                                                    {catalogItem.batches.length} batch{catalogItem.batches.length === 1 ? '' : 'es'}
                                                    {catalogItem.batches[0]?.expiryDate && ` · exp ${new Date(catalogItem.batches[0].expiryDate).toLocaleDateString()}`}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  )}
                                </CommandList>
                                {filteredSellableProducts.length > visibleSellableProducts.length ? (
                                  <div className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
                                    {t('Showing {{shown}} of {{total}} — keep typing to narrow', {
                                      shown: visibleSellableProducts.length,
                                      total: filteredSellableProducts.length,
                                    })}
                                  </div>
                                ) : null}
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                        ) : (
                          <div className='min-w-0 flex-1'>
                            <BilingualName primary={item.name} secondary={item.nameUrdu} primaryClassName='font-semibold text-sm' />
                            <div className='flex items-center gap-2 mt-0.5 flex-wrap'>
                              <span className='text-xs text-muted-foreground'>Rs{item.unitPrice} · {item.unit || 'pcs'}</span>
                              {remainingStock !== undefined && (
                                <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                                  remainingStock <= 0 ? 'bg-red-100 text-red-700' :
                                  remainingStock <= 5 ? 'bg-red-50 text-red-500' :
                                  remainingStock <= 20 ? 'bg-amber-50 text-amber-600' :
                                  'bg-green-50 text-green-700'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    remainingStock <= 0 ? 'bg-red-500' :
                                    remainingStock <= 5 ? 'bg-red-400' :
                                    remainingStock <= 20 ? 'bg-amber-400' :
                                    'bg-green-500'
                                  }`} />
                                  {remainingStock <= 0 ? 'Out of stock' : `${remainingStock} left`}
                                </span>
                              )}
                            </div>
                            {/* Which batch this sale depletes — defaults to earliest
                                expiry but switchable; no automatic FEFO splitting across
                                batches yet, see docs/architecture/universal-product-migration.md. */}
                            {catalogEntry?.trackBatch && catalogEntry.batches && catalogEntry.batches.length > 0 && (
                              <div className='flex flex-wrap items-center gap-1 mt-1'>
                                {catalogEntry.batches.map(b => {
                                  const isSelected = item.batchId === b.id
                                  return (
                                    <button
                                      key={b.id}
                                      type='button'
                                      onClick={() => updateItemBatch(item.id, b.id, b.batchNumber, b.costPerUnit, b.sellingPrice, catalogEntry?.price)}
                                      title={b.expiryDate ? `Expires ${new Date(b.expiryDate).toLocaleDateString()}` : undefined}
                                      className={cn(
                                        'rounded-full border px-1.5 py-0.5 text-[11px] transition-colors',
                                        isSelected
                                          ? 'border-blue-600 bg-blue-100 text-blue-800'
                                          : 'border-border bg-background text-muted-foreground hover:bg-muted',
                                      )}
                                    >
                                      {b.batchNumber} · {b.quantity} left
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromInvoice(item.id)}
                        className='h-7 w-7 p-0 flex-shrink-0 hover:bg-red-50 dark:hover:bg-red-950/30'
                      >
                        <Trash2 className='h-3.5 w-3.5 text-red-400 hover:text-red-600' />
                      </Button>
                    </div>

                    {/* Row 2: Controls — only when a product is selected */}
                    {(item.productId && item.name) && (
                      <div className='flex items-center gap-3 flex-wrap border-t bg-muted/20 px-3 py-2.5'>
                        {/* Quantity Stepper */}
                        <div className='flex items-center gap-1.5'>
                          <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className='h-7 w-7 rounded-none border-r p-0 text-muted-foreground hover:text-foreground hover:bg-muted'
                            >
                              <Minus className='h-3.5 w-3.5' />
                            </Button>
                            <Input
                              ref={(el) => { qtyInputRefs.current[item.id] = el }}
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const qty = parseInt(e.target.value) || 1
                                updateQuantity(item.id, qty)
                              }}
                              onKeyDown={(e) => handleQuantityKeyDown(e, item.id)}
                              onFocus={(e) => e.target.select()}
                              className='h-7 w-20 text-center text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className='h-7 w-7 rounded-none border-l p-0 text-muted-foreground hover:text-foreground hover:bg-muted'
                            >
                              <Plus className='h-3.5 w-3.5' />
                            </Button>
                          </div>
                          <span className='text-xs text-muted-foreground'>{item.unit || 'pcs'}</span>
                        </div>

                        {showUnitConversions && (
                          <div className='flex flex-col gap-1 min-w-[80px]'>
                            <Label className='text-[10px] text-muted-foreground'>{t('unit')}</Label>
                            <Select
                              value={item.unit || 'pcs'}
                              onValueChange={(value) => {
                                const selectedProduct = products.find((p) => (p._id || p.id) === item.productId)
                                if (!selectedProduct) {
                                  toast.error('Product not found for this line')
                                  return
                                }

                                const adjustedUnitPrice = getUnitAdjustedPrice({
                                  product: selectedProduct,
                                  unit: value,
                                  basePrice: selectedProduct.price || item.unitPrice || 0,
                                })

                                if (adjustedUnitPrice === null) {
                                  toast.error(`Missing conversion for ${item.name}`)
                                  return
                                }

                                const lineValues = calculateInvoiceLineValues({
                                  product: selectedProduct,
                                  quantity: item.quantity,
                                  unit: value,
                                  unitPrice: adjustedUnitPrice,
                                  cost: item.cost,
                                })

                                if (!lineValues) {
                                  toast.error(`Missing conversion for ${item.name}`)
                                  return
                                }

                                const previousStockQuantity = item.stockQuantity || item.quantity
                                const stockDifference = lineValues.stockQuantity - previousStockQuantity

                                if (stockDifference > 0 && stockDifference > selectedProduct.stockQuantity) {
                                  toast.error(`${item.name} - Only ${selectedProduct.stockQuantity} pcs available for this unit`)
                                  return
                                }

                                if (stockDifference !== 0) {
                                  setProducts((prevProducts) => prevProducts.map((productRow) =>
                                    (productRow._id || productRow.id) === item.productId
                                      ? { ...productRow, stockQuantity: productRow.stockQuantity - stockDifference }
                                      : productRow
                                  ))
                                }

                                const newItems = invoice.items.map((invoiceItem) =>
                                  invoiceItem.id === item.id
                                    ? {
                                        ...invoiceItem,
                                        unit: lineValues.lineUnit,
                                        conversionFactor: lineValues.conversionFactor,
                                        stockQuantity: lineValues.stockQuantity,
                                        unitPrice: adjustedUnitPrice,
                                        subtotal: lineValues.subtotal,
                                        profit: lineValues.profit,
                                      }
                                    : invoiceItem
                                )

                                if (calculateTotals) {
                                  const totals = calculateTotals(newItems, invoice.discount, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
                                  setInvoice((prev) => ({
                                    ...prev,
                                    items: newItems,
                                    subtotal: totals.subtotal,
                                    tax: totals.tax,
                                    total: totals.total,
                                    totalProfit: totals.totalProfit,
                                    totalCost: totals.totalCost,
                                    balance: totals.total - prev.paidAmount,
                                  }))
                                }
                              }}
                            >
                              <SelectTrigger className='h-6 text-xs px-2'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(products.find((p) => (p._id || p.id) === item.productId)
                                  ? getProductUnitOptions(products.find((p) => (p._id || p.id) === item.productId))
                                  : [{ value: item.unit || 'pcs', label: item.unit || 'pcs' }]
                                ).map((unitOption) => (
                                  <SelectItem key={unitOption.value} value={unitOption.value}>
                                    {unitOption.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Price Input */}
                        <span className='text-muted-foreground/60 text-sm select-none'>×</span>
                        <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                          <span className='px-2 h-7 flex items-center text-xs text-muted-foreground bg-muted border-r font-medium select-none'>Rs</span>
                          <Input
                            ref={(el) => { priceInputRefs.current[item.id] = el }}
                            type="text"
                            inputMode="decimal"
                            showVoiceInput={false}
                            value={item.unitPrice > 0 ? item.unitPrice : ''}
                            onKeyDown={handlePriceKeyDown}
                            onChange={(e) => {
                              const newPrice = parseFloat(e.target.value) || 0
                              const newItems = invoice.items.map(i =>
                                i.id === item.id
                                  ? (() => {
                                      const selectedProduct = products.find((p) => (p._id || p.id) === i.productId) || { unit: i.unit }
                                      const lineValues = calculateInvoiceLineValues({
                                        product: selectedProduct,
                                        quantity: i.quantity,
                                        unit: i.unit,
                                        unitPrice: newPrice,
                                        cost: i.cost,
                                        conversionFactor: i.conversionFactor,
                                      })

                                      if (!lineValues) {
                                        return i
                                      }

                                      return {
                                        ...i,
                                        unitPrice: newPrice,
                                        subtotal: lineValues.subtotal,
                                        profit: lineValues.profit,
                                        stockQuantity: lineValues.stockQuantity,
                                        conversionFactor: lineValues.conversionFactor,
                                      }
                                    })()
                                  : i
                              )

                              if (calculateTotals) {
                                const totals = calculateTotals(newItems, invoice.discount, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
                                setInvoice(prev => ({
                                  ...prev,
                                  items: newItems,
                                  subtotal: totals.subtotal,
                                  tax: totals.tax,
                                  total: totals.total,
                                  totalProfit: totals.totalProfit,
                                  totalCost: totals.totalCost,
                                  balance: totals.total - prev.paidAmount
                                }))
                              } else {
                                const subtotal = newItems.reduce((sum, item) => sum + item.subtotal, 0)
                                const totalCost = newItems.reduce((sum, item) => sum + (item.cost * item.quantity), 0)
                                const totalProfit = newItems.reduce((sum, item) => sum + item.profit, 0)
                                const discountAmount = invoice.discount || 0
                                const taxAmount = ((subtotal - discountAmount) * taxRate) / 100
                                const total = subtotal - discountAmount + taxAmount
                                const balance = total - invoice.paidAmount

                                setInvoice(prev => ({
                                  ...prev,
                                  items: newItems,
                                  subtotal,
                                  totalCost,
                                  totalProfit,
                                  tax: taxAmount,
                                  total,
                                  balance
                                }))
                              }
                            }}
                            onFocus={(e) => e.target.select()}
                            className='h-7 w-16 text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                          />
                        </div>

                        {/* Subtotal */}
                        <div className='flex items-center gap-1.5 ml-auto'>
                          <span className='text-muted-foreground/60 text-sm select-none'>=</span>
                          <div className='text-right'>
                            <p className='font-bold text-sm'>Rs{item.subtotal}</p>
                            {showProfitDetails && (
                              <p className='text-xs text-green-600'>+Rs{item.profit}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {(() => {
                      const product = products.find((p: any) => (p._id || p.id) === item.productId)
                      if (!product?.trackImei) return null
                      return (
                        <ImeiPicker
                          productId={item.productId}
                          quantity={item.quantity}
                          selected={item.imeis || []}
                          onChange={(next) => {
                            setInvoice((prev) => ({
                              ...prev,
                              items: prev.items.map((it) => (it.id === item.id ? { ...it, imeis: next } : it)),
                            }))
                          }}
                        />
                      )
                    })()}
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Totals and Payment */}
      <Card>
        <CardContent className='p-4 space-y-4'>
          {/* Discount Control */}
          <div>
            <Label htmlFor="discount">{t('discount')} (Rs)</Label>
            <Input
              type="text"
              inputMode="decimal"
              showVoiceInput={false}
              value={discountInput}
              onChange={(e) => handleDiscountChange(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <Separator />

          {/* Totals Display */}
          <div className='space-y-2'>
            <div className='flex justify-between gap-6'>
              <span className='text-muted-foreground'>{t('subtotal')}:</span>
              <span className='tabular-nums font-medium'>Rs{invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className='flex justify-between gap-6 text-red-600'>
                <span>{t('discount')}:</span>
                <span className='tabular-nums'>-Rs{invoice.discount.toFixed(2)}</span>
              </div>
            )}
            {invoice.tax > 0 && (
              <div className='flex justify-between gap-6'>
                <span className='text-muted-foreground'>
                  {t('tax')} ({taxRate}%):
                </span>
                <span className='tabular-nums'>Rs{invoice.tax.toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className='flex justify-between gap-6 font-bold text-lg'>
              <span>{t('total')}:</span>
              <span className='tabular-nums'>Rs{invoice.total.toFixed(2)}</span>
            </div>
            
            {/* Profit Display */}
            {/* <div className='flex justify-between items-center'> */}
            <div className='justify-between items-center hidden'>
              <span className='text-green-600'>{t('total_profit')}:</span>
              <div className='flex items-center gap-2'>
                <span className='text-green-600 font-medium'>
                  Rs{invoice.totalProfit.toFixed(2)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowProfitDetails(!showProfitDetails)}
                >
                  <Calculator className='h-4 w-4' />
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Payment Details */}
          <div className='space-y-4'>
            <div className='flex items-center gap-2'>
              <Badge className={getTypeColor(invoice.type)}>
                {t(invoice.type)}
              </Badge>
            </div>

            {/* Payment Method selector — gated by SHOW_INVOICE_PAYMENT_METHOD_UI */}
            {SHOW_INVOICE_PAYMENT_METHOD_UI && invoice.type !== 'pending' && invoice.type !== 'quotation' && (
              <div className='space-y-3'>
                <div>
                  <Label className='mb-2 block'>{t('payment_method') || 'Payment Method'}</Label>
                  <Select
                    value={
                      invoice.paymentMethod === 'wallet' && invoice.walletType
                        ? toWalletOptionValue(invoice.walletType)
                        : invoice.paymentMethod || 'cash'
                    }
                    onValueChange={(val: string) => {
                      if (isWalletOptionValue(val)) {
                        setInvoice(prev => ({ ...prev, paymentMethod: 'wallet', walletType: getWalletTypeFromOptionValue(val) }))
                      } else {
                        setInvoice(prev => ({ ...prev, paymentMethod: val as 'cash' | 'bank' | 'card', walletType: undefined }))
                      }
                    }}
                  >
                    <SelectTrigger className='w-full'>
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
                    <p className='mt-1 text-xs text-muted-foreground'>{t('no_wallets_configured') || 'No wallets configured. Add one from the Wallet page.'}</p>
                  )}
                </div>
              </div>
            )}

            {invoice.type !== 'pending' && invoice.type !== 'quotation' && (
              <>
                {invoice.type === 'credit' && (
                  <div>
                    <Label htmlFor="paidAmount">{t('paid_amount')}</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      showVoiceInput={false}
                      value={paidAmountInput}
                      onChange={(e) => handlePaidAmountChange(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                )}

                {/* Cash Received & Change Calculator — only for cash payments */}
                {invoice.type === 'cash' && (!invoice.paymentMethod || invoice.paymentMethod === 'cash') && (
                  <div className='space-y-3 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'>
                    <h4 className='text-sm font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2'>
                      <Banknote className='h-4 w-4' />
                      Cash Received
                    </h4>
                    <div>
                      <Label className='text-xs text-muted-foreground'>Amount Given by Customer (Rs)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        showVoiceInput={false}
                        value={cashReceivedInput}
                        onChange={(e) => setCashReceivedInput(e.target.value)}
                        placeholder={invoice.total.toFixed(2)}
                        className='mt-1 text-base font-semibold'
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                    {parseFloat(cashReceivedInput) > 0 && (
                      <div className='space-y-2 pt-2 border-t border-emerald-200 dark:border-emerald-700'>
                        <div className='flex justify-between text-sm'>
                          <span className='text-muted-foreground'>Total Bill:</span>
                          <span className='font-semibold'>Rs{invoice.total.toFixed(2)}</span>
                        </div>
                        <div className='flex justify-between text-sm'>
                          <span className='text-muted-foreground'>Amount Received:</span>
                          <span className='font-semibold text-emerald-700'>Rs{parseFloat(cashReceivedInput).toFixed(2)}</span>
                        </div>
                        {parseFloat(cashReceivedInput) >= invoice.total ? (
                          <div className='flex justify-between items-center p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700'>
                            <span className='font-bold text-emerald-800 dark:text-emerald-200'>Change to Return:</span>
                            <span className='font-bold text-xl text-emerald-700 dark:text-emerald-300'>
                              Rs{(parseFloat(cashReceivedInput) - invoice.total).toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <div className='flex justify-between items-center p-2.5 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700'>
                            <span className='font-bold text-red-800 dark:text-red-200'>Amount Short:</span>
                            <span className='font-bold text-xl text-red-600 dark:text-red-400'>
                              Rs{(invoice.total - parseFloat(cashReceivedInput)).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Customer Balance Display - After Payment Details */}
            {invoice.customerId && invoice.customerId !== 'walk-in' && (
              <>
                <Separator className="my-2" />
                <div className='space-y-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg'>
                  <div className='flex justify-between items-center text-sm'>
                    <span className="font-medium">{t('Previous Balance')}:</span>
                    <span className={`font-bold ${customerBalance > 0 ? 'text-red-600' : customerBalance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                      {loadingBalance ? (
                        <span className="text-xs">Loading...</span>
                      ) : (
                        `Rs${Math.abs(customerBalance).toFixed(2)} ${customerBalance > 0 ? '(Dr)' : customerBalance < 0 ? '(Cr)' : ''}`
                      )}
                    </span>
                  </div>
                  <div className='flex justify-between items-center text-sm'>
                    <span className="font-medium">{t('Current Amount')}:</span>
                    <span className="font-bold text-red-600">Rs{invoice.total.toFixed(2)} (Dr)</span>
                  </div>
                  {invoice.paidAmount > 0 && (
                    <div className='flex justify-between items-center text-sm'>
                      <span className="font-medium">{t('Paid Now')}:</span>
                      <span className="font-bold text-green-600">-Rs{invoice.paidAmount.toFixed(2)} (Cr)</span>
                    </div>
                  )}
                  <Separator />
                  <div className='flex justify-between items-center'>
                    <span className="font-bold">{t('Net Balance')}:</span>
                    <span className={`font-bold text-lg ${(customerBalance + invoice.total - invoice.paidAmount) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      Rs{Math.abs(customerBalance + invoice.total - invoice.paidAmount).toFixed(2)} {(customerBalance + invoice.total - invoice.paidAmount) > 0 ? '(Receivable)' : '(Payable)'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Terms & Conditions */}
          <RichTextEditor
            value={invoice.notes || ''}
            onChange={(notes) => setInvoice((prev) => ({ ...prev, notes }))}
            fieldLabel={t('terms_and_conditions')}
            addButtonLabel={t('add_terms_and_conditions')}
            placeholder={t('terms_and_conditions_placeholder')}
            defaultExpanded={Boolean(invoice.notes?.trim())}
          />

          {/* Save Buttons */}
          {isEditing && editingInvoice?.type === 'quotation' && (
            <Button
              type='button'
              className='w-full bg-emerald-600 hover:bg-emerald-700'
              size='lg'
              onClick={() => setShowConvertDialog(true)}
            >
              <FileCheck className='h-4 w-4 mr-2' />
              {t('convert_to_invoice') || 'Convert to Invoice'}
            </Button>
          )}

          <div className='grid grid-cols-1 gap-3'>
            <Button 
              onClick={() => handleSaveInvoice('none')}
              className='w-full'
              size="lg"
              disabled={!invoice.customerId || invoice.items.length === 0 || savingType !== null}
              variant="outline"
            >
              {savingType === 'none' ? (
                <>
                  <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                  {t('saving')}...
                </>
              ) : (
                <>
                  <Save className='h-4 w-4 mr-2' />
                  {isEditing ? t('update_invoice') : t('save_invoice')} (Ctrl+D)
                </>
              )}
            </Button>

            <PrintFormatButton
              onPrint={(paperSize) => handleSaveInvoice(paperSize)}
              defaultPaperSize={defaultPaperSize}
              allowedFormats={['thermal80', 'thermal58', 'a4', 'a5', 'a4-half-left', 'a4-half-right']}
              size="lg"
              variant="default"
              fullWidth
              disabled={!invoice.customerId || invoice.items.length === 0 || savingType !== null}
              mainButtonContent={
                savingType !== null && savingType !== 'none' ? (
                  <>
                    <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                    {t('saving')}...
                  </>
                ) : (
                  <>
                    <Printer className='h-4 w-4 mr-2' />
                    {isEditing
                      ? `${t('update_and_print_receipt')} (Ctrl+Enter)`
                      : `${t('save_and_print_receipt')} (Ctrl+Enter)`
                    }
                  </>
                )
              }
            />

            {/* Send After Save selector */}
            <div className='rounded-lg border bg-muted/40 p-3 space-y-2'>
              <p className='text-xs font-medium text-muted-foreground'>
                Also send after saving:
                {isSendingSms && (
                  <span className='ml-2 inline-flex items-center gap-1 text-blue-600'>
                    <Loader2 className='h-3 w-3 animate-spin' /> Sending SMS…
                  </span>
                )}
                {isWhatsAppSending && (
                  <span className='ml-2 inline-flex items-center gap-1 text-green-600'>
                    <Loader2 className='h-3 w-3 animate-spin' /> Sending WhatsApp…
                  </span>
                )}
              </p>
              <div className='flex gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant={sendMethod === 'none' ? 'default' : 'outline'}
                  className='flex-1'
                  onClick={() => {
                    setSendMethod('none')
                    localStorage.setItem('invoiceSendMethod', 'none')
                  }}
                >
                  None
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant={sendMethod === 'sms' ? 'default' : 'outline'}
                  className={cn('flex-1 gap-1.5', sendMethod === 'sms' && 'bg-blue-600 hover:bg-blue-700 border-blue-600')}
                  onClick={() => {
                    setSendMethod('sms')
                    localStorage.setItem('invoiceSendMethod', 'sms')
                  }}
                >
                  <MessageSquare className='h-3.5 w-3.5' />
                  SMS
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant={sendMethod === 'whatsapp' ? 'default' : 'outline'}
                  className={cn('flex-1 gap-1.5', sendMethod === 'whatsapp' && 'border-[#25d366]')}
                  style={sendMethod === 'whatsapp' ? { backgroundColor: '#25d366', borderColor: '#25d366' } : {}}
                  onClick={() => {
                    setSendMethod('whatsapp')
                    localStorage.setItem('invoiceSendMethod', 'whatsapp')
                  }}
                >
                  <Send className='h-3.5 w-3.5' />
                  WhatsApp
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant={sendMethod === 'both' ? 'default' : 'outline'}
                  className={cn('flex-1 gap-1.5', sendMethod === 'both' && 'bg-purple-600 hover:bg-purple-700 border-purple-600')}
                  onClick={() => {
                    setSendMethod('both')
                    localStorage.setItem('invoiceSendMethod', 'both')
                  }}
                >
                  <MessageSquare className='h-3.5 w-3.5' />
                  Both
                </Button>
              </div>
              {sendMethod !== 'none' && (
                <p className='text-xs text-muted-foreground'>
                  {sendMethod === 'sms' && 'Every save button will also send an SMS to the customer.'}
                  {sendMethod === 'whatsapp' && 'Every save button will also send the invoice PDF via WhatsApp.'}
                  {sendMethod === 'both' && 'Every save button will also send both an SMS and the invoice PDF via WhatsApp.'}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <EntityQuickCreateDialogs
        state={quickCreate}
        onClose={() => {
          setQuickCreate(null)
          setQuickCreateProductItemId(null)
        }}
        onCreated={handleQuickCreated}
      />

      <QuotationConvertDialog
        invoice={isEditing && editingInvoice?.type === 'quotation' ? editingInvoice : null}
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
        onConverted={() => {
          onSaveSuccess?.()
          onBackToList?.()
        }}
      />

    </div>
  )
}
