import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Minus, Plus, Trash2, Save, Calculator, DollarSign, Search, Check, User, Package, Loader2, Printer, ArrowLeft, ArrowLeftRight, ChevronDown, Banknote, FileCheck, MessageSquare, Send, Briefcase, Truck, History, CreditCard, Eye, Percent, Receipt, ScanBarcode, Layers, Ban, Pencil, RotateCcw } from 'lucide-react'
import type { ImeiRecord, ImeiEntryInput } from '@/stores/imei.api'
import {
  entryImei,
  SerialSummaryTrigger,
  SerialNumberDialog,
  BatchAllocationEditor,
} from '@/components/serial-batch-line-controls'
import { UsedPhoneSelectDialog } from './used-phone-select-dialog'
import type { PhoneBuybackRecord } from '@/stores/usedPhoneBuyback.api'
import { isUsedPhonesBucketProduct } from '@/features/mobile-shop/old-phones/constants'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '@/context/language-context'
import { useIsPhone } from '@/hooks/use-mobile'
import { useIsNarrower } from '@/hooks/use-element-width'
import { Invoice, InvoiceItem, BatchAllocation, createEmptyManualInvoiceItem } from '../index'
import { toast } from 'sonner'
import { useCreateInvoiceMutation, useUpdateInvoiceMutation, useGetNextInvoiceNumberQuery, invoiceApi } from '@/stores/invoice.api'
import { useGetAllSalesmanProfilesQuery } from '@/stores/salesmanProfile.api'
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
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { purchaseCatalogApi, useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { BranchStockTrigger } from '@/components/branch-stock-trigger'

// Stable empty-array reference — an inline `= []` default on `data` would create a new
// array every render while the query is loading.
const EMPTY_SELLABLE_CATALOG: PurchaseCatalogItem[] = []

// The product/customer picker dropdowns mount one DOM row (image, badges, text) per
// match with no virtualization. With 1000+ products/customers, rendering every match
// on an empty search — cmdk's default behavior — is what actually makes the dropdown
// feel slow to open, far more than any timing delay. Capping to the first N matches
// keeps the popover instant; typing to search still filters the full list.
const MAX_VISIBLE_DROPDOWN_RESULTS = 50

// Per-type accent for the Invoice Type buttons — same cash=green/credit=blue/
// pending=amber/quotation=violet mapping as the "New Invoice" title badge (getTypeColor).
// Kept subtle: a light tint + thin border, not a filled/shadowed badge.
const INVOICE_TYPE_STYLES: Record<'cash' | 'credit' | 'pending' | 'quotation', { active: string; icon: string }> = {
  cash: {
    active: 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400',
    icon: 'text-green-600 dark:text-green-400',
  },
  credit: {
    active: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  pending: {
    active: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  quotation: {
    active: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-400',
    icon: 'text-violet-600 dark:text-violet-400',
  },
}
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { calculateInvoiceLineValues, getProductUnitOptions, getUnitAdjustedPrice } from '@/lib/inventory-unit-conversions'
import { applyLineDiscount, computeDiscountAmount, type DiscountType } from '@/lib/discount'
import { afterPaint, focusField, onEnterAdvance, useInvoiceSaveShortcuts } from '@/lib/invoice-form-keyboard'
import { useSync } from '@/lib/sync/use-sync'
import { buildOfflineInvoicePayload } from '@/lib/sync/offline-invoice'
import { getElectronAPI } from '@/lib/sync/electron'
import { isApiUnreachable } from '@/lib/auth-cache'
import { normalizeInvoiceNotesHtml } from '@/lib/rich-text-utils'
import { BilingualName } from '@/components/bilingual-name'
import { useUrduDisplay } from '@/context/urdu-display-context'
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
import { SplitPaymentFields } from '@/components/split-payment-fields'
import { usePermissions } from '@/context/permission-context'
import {
  EntityCreateEmptyPrompt,
  EntityCreateShortcutButton,
  EntityQuickCreateDialogs,
  type QuickCreateState,
} from '@/components/entity-create-shortcut'
import { QuotationConvertDialog } from './quotation-convert-dialog'
import { ProductHistoryDialog } from './product-history-dialog'

/** Toggle to show payment source fields on invoice checkout. */
const SHOW_INVOICE_PAYMENT_METHOD_UI = true

interface InvoicePanelProps {
  invoice: Invoice
  setInvoice: React.Dispatch<React.SetStateAction<Invoice>>
  updateQuantity: (itemId: string, newQuantity: number) => void
  removeFromInvoice: (itemId: string) => void
  updateInvoiceType: (type: 'cash' | 'credit' | 'pending' | 'quotation') => void
  updateDiscount: (patch: { type?: DiscountType; value?: number }) => void
  updateItemDiscount: (itemId: string, patch: { type?: DiscountType; value?: number }) => void
  taxRate: number
  setTaxRate: (rate: number) => void
  customers: any[]
  customersLoading?: boolean
  setCustomers?: React.Dispatch<React.SetStateAction<any[]>>
  productsLoading?: boolean
  products: any[]
  setProducts: React.Dispatch<React.SetStateAction<any[]>>
  calculateTotals?: (items: any[], discountType?: DiscountType, discountValue?: number, deliveryCharge?: number, serviceCharge?: number) => any
  onBackToList?: () => void
  onSaveSuccess?: () => void
  isEditing?: boolean
  editingInvoice?: any
  /** Matches Product Catalog "Cost" toggle — when true, purchase cost is readable in the product picker */
  showProductCost?: boolean
  /** When false (catalog hidden), the panel switches to a dense "fast invoicing" layout —
   * single-row items and a sticky save bar — to fit more lines on screen. */
  showProductCatalog?: boolean
  /** Fast-invoicing mode only: DOM node (owned by the page, sitting outside the cards'
   * scroll region) to portal the save/print bar into, so it's always visible without
   * scrolling. Falls back to an inline sticky bar until this is available. */
  stickyActionsContainer?: HTMLElement | null
  /** Looks up a product by exact barcode and appends it as a new line — same handler the
   * Product Catalog panel's own barcode field already uses. Wired to the header's "Scan
   * Barcode" quick action so it also works with the catalog hidden. */
  onBarcodeSearch?: (barcode: string) => void
}

export function InvoicePanel({
  invoice,
  setInvoice,
  updateQuantity,
  removeFromInvoice,
  updateInvoiceType,
  updateDiscount,
  updateItemDiscount,
  taxRate,
  setTaxRate,
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
  showProductCatalog = true,
  stickyActionsContainer = null,
  onBarcodeSearch,
}: InvoicePanelProps) {
  const { t, isRTL } = useLanguage()
  const { showUrdu } = useUrduDisplay()
  // Below sm (640px): items render as cards instead of the table (see the items list
  // below). Read via JS rather than CSS show/hide so only one variant ever mounts — two
  // copies of the same row would double up every interactive control (Popover triggers,
  // input refs) under one shared item-id key, breaking things like the product picker.
  const isPhone = useIsPhone()
  // Preview of the number the next save would actually receive (see next-number route +
  // Invoice.generateNextDocumentNumber) — shown read-only until the user clicks the pencil
  // to type their own. Only relevant before the invoice is first saved; a saved invoice
  // already has its real invoiceNumber from the server, and that number can't be changed
  // after the fact (updateInvoice's validation doesn't accept the field at all). Grouping
  // cash/credit/pending together as one query arg (only 'quotation' gets its own) avoids
  // three separate network round trips as the user flips between those three — they all
  // resolve to the same INV- prefix server-side anyway.
  const { data: nextInvoiceNumberData } = useGetNextInvoiceNumberQuery(
    invoice.type === 'quotation' ? 'quotation' : 'invoice',
    { skip: isEditing },
  )
  const previewedInvoiceNumber = nextInvoiceNumberData?.invoiceNumber as string | undefined
  const [isEditingInvoiceNumber, setIsEditingInvoiceNumber] = useState(false)
  const dispatch = useDispatch<AppDispatch>()
  const { hasPermission } = usePermissions()
  const canCreateCustomer = hasPermission('createCustomers' as never)
  const canCreateProduct = hasPermission('createProducts' as never)
  const { data: walletsData } = useGetWalletsQuery(undefined, { skip: !SHOW_INVOICE_PAYMENT_METHOD_UI })
  const wallets = walletsData?.results?.filter(w => w.isActive) ?? []
  // Sale invoices receive cash — never show wallet balances in the dropdown (money-in form).
  // No generic 'Bank Transfer'/'Card' placeholders — every real account (bank or mobile
  // wallet) is already selectable here by its own name.
  const paymentMethodOptions = useMemo(
    () =>
      buildMergedPaymentOptions(
        [{ value: 'cash', label: t('cash') || 'Cash' }],
        wallets,
        false,
      ),
    [wallets, t],
  )
  // The split leg is an independent amount that adds to Paid Amount, not carved out of it —
  // see split-payment-fields.tsx. This is what's actually been paid so far.
  const totalPaidNow = (invoice.paidAmount || 0) + (invoice.splitPaymentMethod ? (invoice.splitPaidAmount || 0) : 0)
  const { data: salesmen } = useGetAllSalesmanProfilesQuery({ status: 'active' })
  const salesmanOptions = useMemo(
    () => (salesmen || []).map((s) => ({ value: s.id, label: s.name, sublabel: s.salesmanCode })),
    [salesmen],
  )
  const [paidAmountInput, setPaidAmountInput] = useState('')
  // Cash-type invoices never show/edit Paid Amount normally (it's just the total) — but once
  // split-mode reveals the field, seed its draft from the real value so it doesn't start blank.
  const wasCashSplitEditable = useRef(false)
  useEffect(() => {
    const isCashSplitEditable = invoice.type === 'cash' && Boolean(invoice.splitPaymentMethod)
    if (isCashSplitEditable && !wasCashSplitEditable.current) {
      setPaidAmountInput(String(invoice.paidAmount ?? 0))
    }
    wasCashSplitEditable.current = isCashSplitEditable
  }, [invoice.type, invoice.splitPaymentMethod, invoice.paidAmount])
  const [showProfitDetails, setShowProfitDetails] = useState(false)
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [productSelectOpen, setProductSelectOpen] = useState<string>('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  // Which line's serial/IMEI picker dialog is open — '' means none.
  const [serialDialogItemId, setSerialDialogItemId] = useState<string>('')
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
  // Cash Received & Change calculator — catalog-shown mode only (see the
  // showProductCatalog check around the Payment & Amount card below); the compact
  // catalog-hidden layout uses Paid Amount directly instead.
  const [cashReceivedInput, setCashReceivedInput] = useState('')
  const [quickCreate, setQuickCreate] = useState<QuickCreateState>(null)
  const [quickCreateProductItemId, setQuickCreateProductItemId] = useState<string | null>(null)
  // Draft tax-rate % shown in the items footer's "Add Tax" popover — kept as a string so
  // the input can hold "" while typing, only committed to the real taxRate on change.
  const [taxRateInput, setTaxRateInput] = useState(() => (taxRate ? String(taxRate) : ''))
  const [applyDiscountOpen, setApplyDiscountOpen] = useState(false)
  const [addTaxOpen, setAddTaxOpen] = useState(false)
  const [scanBarcodeOpen, setScanBarcodeOpen] = useState(false)
  const [scanBarcodeValue, setScanBarcodeValue] = useState('')

  // Refs for keyboard Enter navigation
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const invoiceTypeTriggerRef = useRef<HTMLButtonElement>(null)
  const invoiceDateRef = useRef<HTMLInputElement>(null)
  const itemsScrollRef = useRef<HTMLDivElement>(null)
  // The items table's fixed-width columns (colgroup below) need ~760px+ before table-fixed
  // stops proportionally squeezing every column below its intended width (that's what makes
  // headers/values visually run together — the table is forced to 100% of a too-narrow
  // container instead of overflowing). Below that, fall back to the same stacked-card row
  // layout used for catalog-visible/phone (see renderItemCard) — triggered by the item area's
  // actual rendered width, so a docked devtools panel or a collapsed sidebar can trigger it
  // too, not just a narrow viewport. Mirrors Purchase's identical guard (see purchase-panel.tsx).
  const itemsAreaRef = useRef<HTMLDivElement>(null)
  const isItemsAreaNarrow = useIsNarrower(itemsAreaRef, 760)
  const autoOpenedInvoiceItemIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (isEditing) {
      autoOpenedInvoiceItemIdRef.current = null
      return
    }
    const first = invoice.items[0]
    // Fresh invoice (every row still an untouched empty manual entry) — auto-open the
    // first row's product picker so a cashier can start typing immediately instead of
    // clicking into it. Matches on "all rows empty" rather than a single row so this
    // still fires now that a new invoice starts pre-populated with several empty rows.
    if (
      invoice.items.every((item) => item.isManualEntry && !item.productId) &&
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

  // New invoices default the salesman to the logged-in user, if they're themselves a
  // tracked salesman — saves a click for the common case of a salesman billing their own
  // sale. Never overrides an already-set value (edits, or a manual pick made this session,
  // or a restored draft that already had one).
  useEffect(() => {
    if (isEditing || invoice.salesmanId || !user?.id || !salesmen) return
    // String(...) both sides: populated userId can arrive as an ObjectId-shaped value
    // before the API layer's JSON round-trip normalizes it to a plain string, and a
    // strict === would silently never match in that window. Standalone salesmen (no
    // userId) never match here — there's no login to compare against, as intended.
    const ownProfile = salesmen.find((s) => {
      const linkedUserId = typeof s.userId === 'string' ? s.userId : s.userId?.id
      return linkedUserId != null && String(linkedUserId) === String(user.id)
    })
    if (import.meta.env.DEV && !ownProfile && salesmen.length > 0) {
      // eslint-disable-next-line no-console
      console.debug('[salesman-autoselect] logged-in user has no matching active salesman profile', {
        userId: user.id,
        salesmen: salesmen.map((s) => ({ code: s.salesmanCode, userId: typeof s.userId === 'string' ? s.userId : s.userId?.id })),
      })
    }
    if (ownProfile) {
      setInvoice(prev => (prev.salesmanId ? prev : { ...prev, salesmanId: ownProfile.id }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, user?.id, salesmen])
  const invoiceTemplate: InvoiceTemplate = branchData?.printSettings?.template ?? 'standard'
  const printOrientation: PrintOrientation = branchData?.printSettings?.printOrientation ?? 'portrait'

  const [printReceiptInUrdu, setPrintReceiptInUrdu] = useState(() => getInvoicePrintInUrdu())
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [historyDialog, setHistoryDialog] = useState<{
    open: boolean
    productId: string
    productName: string
    currentPrice: number
  }>({ open: false, productId: '', productName: '', currentPrice: 0 })
  // Print functionality using utility
  const printInvoice = useCallback(async (invoiceData: any, thermalSize: 'thermal80' | 'thermal58' = 'thermal80') => {
    try {
      const prevBal = invoiceData.previousBalance ?? customerBalance
      const netBal = (prevBal || 0) + (invoiceData.total || 0) - (invoiceData.paidAmount || 0)
      const cidForContact = invoiceData.customerId ?? invoice.customerId
      const loadedCustomer = cidForContact && cidForContact !== 'walk-in'
        ? customers.find((c) => String(c._id || c.id) === String(cidForContact))
        : undefined

      const printData = withCustomerContactForPrint({
        invoiceNumber: invoiceData.invoiceNumber,
        items: invoiceData.items.map((item: any) => ({
          name: item.name,
          nameUrdu: item.nameUrdu,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          discountAmount: item.discountAmount,
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
        companyName: resolveBranchCompanyName(orgData?.name, branchData?.name),
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
      }, invoiceData, loadedCustomer)

      const customerIdStr = resolveCustomerIdString(printData.customerId)
      const printContact: PrintWindowContact = {
        customerId: customerIdStr,
        phone: printData.customerPhone,
        whatsapp: printData.customerWhatsapp,
      }
      if (customerIdStr) {
        stashPrintContact(printContact)
        // Already-loaded customer data (above) covers phone/whatsapp for the print
        // window itself — refresh from the server in the background instead of
        // blocking the print window on a network round trip. Its Send SMS/WhatsApp
        // actions read window.__invoicePrintContactById lazily when clicked, well
        // after this resolves.
        fetchAndStashPrintContact(customerIdStr).catch(() => {
          /* prompt in print window */
        })
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

  /** Builds print data + WhatsApp/SMS contact for the invoice being saved/printed. Format-agnostic — feeds both the thermal and A4/A5 HTML generators. */
  const buildPrintData = useCallback(async (invoiceData: any) => {
      const prevBal = invoiceData.previousBalance ?? customerBalance
      const netBal = (prevBal || 0) + (invoiceData.total || 0) - (invoiceData.paidAmount || 0)
      const cidForContact = invoiceData.customerId ?? invoice.customerId
      const loadedCustomer = cidForContact && cidForContact !== 'walk-in'
        ? customers.find((c) => String(c._id || c.id) === String(cidForContact))
        : undefined

      const printData = withCustomerContactForPrint({
        invoiceNumber: invoiceData.invoiceNumber,
        items: invoiceData.items.map((item: any) => ({
          name: item.name,
          nameUrdu: item.nameUrdu,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          discountAmount: item.discountAmount,
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
        companyName: resolveBranchCompanyName(orgData?.name, branchData?.name),
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
      }, invoiceData, loadedCustomer)

      const customerIdStr = resolveCustomerIdString(printData.customerId)
      const printContact: PrintWindowContact = {
        customerId: customerIdStr,
        phone: printData.customerPhone,
        whatsapp: printData.customerWhatsapp,
      }
      if (customerIdStr) {
        stashPrintContact(printContact)
        // Already-loaded customer data (above) covers phone/whatsapp for the print
        // window itself — refresh from the server in the background instead of
        // blocking on a network round trip before the print window can open.
        fetchAndStashPrintContact(customerIdStr).catch(() => {
          /* prompt in print window */
        })
      }

      return { printData, printContact }
  }, [invoice.customerName, invoice.customerId, branchData, customerBalance, preferredLanguage, orgData, customers])

  // A4 Print functionality using utility — sheetSize also accepts the A4-half-sheet formats
  const printA4Invoice = useCallback(async (invoiceData: any, sheetSize: SheetSize = 'a4') => {
    try {
      const { printData, printContact } = await buildPrintData(invoiceData)
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
  }, [buildPrintData, invoiceTemplate])

  // "Preview" header action — opens the same print HTML the Save & Print button would
  // produce for the branch's configured paper size (thermal80/58, A4, A5, or A4-half),
  // built straight from the live, not-yet-saved `invoice` state (no create/update API
  // call, no invoiceNumber yet). Lets the cashier sanity-check the actual print layout —
  // not a generic A4 sheet — before committing.
  const previewInvoice = useCallback(async () => {
    const itemsWithProducts = invoice.items.filter((item) => item.productId && item.name)
    if (itemsWithProducts.length === 0) {
      toast.error(t('Add at least one item to preview'))
      return
    }
    const splitPaidAmountForPreview = invoice.splitPaymentMethod ? Math.max(0, Number(invoice.splitPaidAmount || 0)) : 0
    const totalPaidAmountForPreview = (invoice.paidAmount || 0) + splitPaidAmountForPreview
    const draftInvoiceData = {
      invoiceNumber: (isEditing && editingInvoice?.invoiceNumber) || t('Draft Preview'),
      items: itemsWithProducts,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      walkInCustomerName: invoice.walkInCustomerName,
      type: invoice.type,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      discount: invoice.discount,
      total: invoice.total,
      paidAmount: totalPaidAmountForPreview,
      balance: invoice.total - totalPaidAmountForPreview,
      notes: invoice.notes,
      deliveryCharge: invoice.deliveryCharge,
      serviceCharge: invoice.serviceCharge,
      invoiceDate: invoice.invoiceDate,
      language: invoice.language,
      isUrduOnly: invoice.isUrduOnly,
    }
    try {
      const { printData, printContact } = await buildPrintData(draftInvoiceData)
      if (PAPER_FORMATS[defaultPaperSize].family === 'thermal') {
        const thermalSize = resolveThermalSize(defaultPaperSize)
        const htmlContent = generateInvoiceHTML(printData, thermalSize)
        openPrintWindowForFormat(htmlContent, thermalSize, printContact)
      } else {
        const sheetSize = resolveSheetFormat(defaultPaperSize, printOrientation)
        const htmlContent = generateA4InvoiceHTML(printData, sheetSize, invoiceTemplate)
        openPrintWindowForFormat(htmlContent, sheetSize, printContact)
      }
    } catch (error: any) {
      console.error('Preview error:', error)
      toast.error('Failed to open preview')
    }
  }, [invoice, buildPrintData, invoiceTemplate, isEditing, editingInvoice, t, defaultPaperSize, printOrientation])

  // Initialize form values when in edit mode
  useEffect(() => {
    if (isEditing && editingInvoice) {
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
      // Force cash type for walk-in customers — except quotations, which have no
      // accounting effect until converted (see invoice.service.js's
      // convertQuotationToInvoice) and are exactly how the CRM Leads module attaches
      // a quote to a lead before it's ever a registered customer.
      if (invoice.type !== 'cash' && invoice.type !== 'quotation') {
        setInvoice(prev => ({
          ...prev,
          type: 'cash'
        }))
      }
    }
  }, [invoice.customerId, invoice.type, setInvoice])

  // A supplier-as-customer's own shadow-customer balance only reflects sales made
  // to them — it ignores what the business owes them from purchases. Their linked
  // Supplier ledger already nets both sides together (see supplierLedger.service.js
  // syncPurchaseFromCustomerSale), so that's the accurate number to show here.
  // Supplier balance convention is positive = payable (we owe them); this component's
  // customerBalance convention is positive = receivable (they owe us) — negate.
  const fetchBalanceForCustomerId = async (customerId: string): Promise<number> => {
    if (!customerId || customerId === 'walk-in') return 0
    const linkedCustomer = customers.find((c) => (c._id || c.id) === customerId)
    if (linkedCustomer?.isSupplierAccount && linkedCustomer?.linkedSupplierId) {
      const url = `${summery.fetchSupplierBalance.url}/${linkedCustomer.linkedSupplierId}${summery.fetchSupplierBalance.urlSuffix || ''}`
      const response = await Axios.get(url)
      return -(response.data.balance || 0)
    }
    const url = `${summery.fetchCustomerBalance.url}/${customerId}${summery.fetchCustomerBalance.urlSuffix || ''}`
    const response = await Axios.get(url)
    return response.data.balance || 0
  }

  // Fetch customer balance when customer is selected
  useEffect(() => {
    const fetchCustomerBalance = async () => {
      if (invoice.customerId && invoice.customerId !== 'walk-in') {
        setLoadingBalance(true)
        try {
          setCustomerBalance(await fetchBalanceForCustomerId(invoice.customerId))
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
  }, [invoice.customerId, customers])

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

    // Default to the earliest-expiring batch that still has stock (already sorted that
    // way by the backend) — the seller can still switch batches on the line afterward.
    // No automatic FEFO splitting across batches yet. Skips depleted (0-qty) batches so
    // a newly added line doesn't default to one that can't actually fulfill anything.
    const defaultBatch = variantId && (product.trackBatch || product.trackExpiry)
      ? product.knownBatches?.find((b: { quantity: number }) => b.quantity > 0) ?? product.knownBatches?.[0]
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

    // Overselling is allowed for every product, variant/batch-tracked included — a
    // purchase entry brings the balance back up. Just surface a heads-up instead of
    // blocking the sale.
    if (variantId && lineValues.stockQuantity > currentStock) {
      toast.warning(`${product.name} - selling into negative stock (Current: ${currentStock}, Required: ${lineValues.stockQuantity})`)
    }

    // Preserve any discount already set on this row (e.g. entered before a product was
    // picked) by re-applying it to the newly resolved gross line.
    const selectionNet = applyLineDiscount(
      { subtotal: lineValues.subtotal, profit: lineValues.subtotal - ((defaultBatch?.costPerUnit ?? product.cost) * lineValues.stockQuantity) },
      currentItem.discountType,
      currentItem.discountValue,
    )

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
            subtotal: selectionNet.subtotal,
            profit: selectionNet.profit,
            discountAmount: selectionNet.discountAmount,
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
      const totals = calculateTotals(newItems, invoice.discountType, invoice.discountValue, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
      setInvoice(prev => ({
        ...prev,
        items: newItems,
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
        totalProfit: totals.totalProfit,
        totalCost: totals.totalCost,
        // Cash (non-split) invoices always treat "Paid Amount" as the running total —
        // mirrors updateQuantity/updateDiscount in index.tsx, without which a fresh cash
        // invoice's Paid Amount stays stuck at 0 after picking the first product,
        // hiding the "Split this payment" toggle (SplitPaymentFields only renders once
        // paidAmount > 0).
        paidAmount: (prev.type === 'cash' && !prev.splitPaymentMethod) ? totals.total : prev.paidAmount,
        balance: (prev.type === 'cash' && !prev.splitPaymentMethod) ? 0 : totals.total - prev.paidAmount,
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
  }, [invoice.items, invoice.discount, invoice.discountType, invoice.discountValue, invoice.deliveryCharge, invoice.serviceCharge, invoice.paidAmount, taxRate, calculateTotals, setInvoice, products, setProducts])

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
        trackSerial: catalogItem.trackSerial,
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
  const updateItemBatch = useCallback((itemId: string, batchId: string, batchNumber: string, availableQuantity: number, costPerUnit?: number, sellingPrice?: number, basePrice?: number) => {
    // Switching to a batch with less stock than the line already asks for must pull the
    // quantity down to match — otherwise the line silently keeps a quantity the newly
    // selected batch can't actually fulfill (caught late, only when saving fails).
    const currentItem = invoice.items.find((item) => item.id === itemId)
    if (currentItem && availableQuantity > 0 && availableQuantity < currentItem.quantity) {
      toast.error(`${currentItem.name} - quantity reduced to ${availableQuantity} to match batch ${batchNumber}'s available stock`)
    }

    setInvoice(prev => {
      const newItems = prev.items.map(item => {
        if (item.id !== itemId) return item
        const cost = costPerUnit ?? item.cost
        const unitPrice = sellingPrice ?? basePrice ?? item.unitPrice
        const quantity = availableQuantity > 0 ? Math.min(item.quantity, availableQuantity) : item.quantity
        const selectedProduct = products.find((p) => (p._id || p.id) === item.productId) || { unit: item.unit }
        const lineValues = calculateInvoiceLineValues({
          product: selectedProduct,
          quantity,
          unit: item.unit,
          unitPrice,
          cost,
          conversionFactor: item.conversionFactor,
        })
        if (!lineValues) return { ...item, batchId, batchNumber, cost, quantity, stockQuantity: quantity, profit: item.subtotal - (cost * quantity) }
        const net = applyLineDiscount(lineValues, item.discountType, item.discountValue)
        return {
          ...item,
          batchId,
          batchNumber,
          cost,
          unitPrice,
          quantity,
          stockQuantity: quantity,
          subtotal: net.subtotal,
          profit: net.profit,
          discountAmount: net.discountAmount,
        }
      })
      if (!calculateTotals) return { ...prev, items: newItems }
      const totals = calculateTotals(newItems, prev.discountType, prev.discountValue, prev.deliveryCharge || 0, prev.serviceCharge || 0)
      return {
        ...prev,
        items: newItems,
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
        totalProfit: totals.totalProfit,
        totalCost: totals.totalCost,
        paidAmount: (prev.type === 'cash' && !prev.splitPaymentMethod) ? totals.total : prev.paidAmount,
        balance: (prev.type === 'cash' && !prev.splitPaymentMethod) ? 0 : totals.total - prev.paidAmount,
      }
    })
  }, [invoice.items, setInvoice, calculateTotals, products])

  // Shared recompute for editing a line's batch split — a batch chip's "insufficient
  // stock" block is only for a *single* picked batch; once a line is split across
  // several (see autoAllocateBatches in updateQuantity), the seller can rebalance those
  // rows by hand. The total (`item.quantity`) is always just the sum of the rows, so
  // editing one number naturally grows/shrinks the line rather than needing to be
  // rebalanced against a fixed target. Collapses back to a plain single-batch line
  // (clearing batchAllocations) the moment only one row is left with stock.
  const applyBatchAllocations = useCallback((itemId: string, compute: (current: BatchAllocation[]) => BatchAllocation[]) => {
    setInvoice(prev => {
      const newItems = prev.items.map(item => {
        if (item.id !== itemId) return item
        const current: BatchAllocation[] = item.batchAllocations
          ?? (item.batchId ? [{ batchId: item.batchId, batchNumber: item.batchNumber || '', quantity: item.quantity }] : [])
        const next = compute(current).filter((a) => a.quantity > 0)
        const totalQty = next.reduce((sum, a) => sum + a.quantity, 0)
        const selectedProduct = products.find((p) => (p._id || p.id) === item.productId) || { unit: item.unit }
        const lineValues = calculateInvoiceLineValues({
          product: selectedProduct,
          quantity: totalQty,
          unit: item.unit,
          unitPrice: item.unitPrice,
          cost: item.cost,
          conversionFactor: item.conversionFactor,
        })
        const discountPatch = lineValues
          ? applyLineDiscount(lineValues, item.discountType, item.discountValue)
          : { subtotal: item.subtotal, profit: item.profit, discountAmount: item.discountAmount }
        const only = next.length <= 1 ? next[0] : undefined
        return {
          ...item,
          quantity: totalQty,
          stockQuantity: totalQty,
          batchId: only ? only.batchId : (next[0]?.batchId ?? item.batchId),
          batchNumber: only ? only.batchNumber : (next[0]?.batchNumber ?? item.batchNumber),
          batchAllocations: only ? undefined : next,
          subtotal: discountPatch.subtotal,
          profit: discountPatch.profit,
          discountAmount: discountPatch.discountAmount,
        }
      })
      if (!calculateTotals) return { ...prev, items: newItems }
      const totals = calculateTotals(newItems, prev.discountType, prev.discountValue, prev.deliveryCharge || 0, prev.serviceCharge || 0)
      return {
        ...prev,
        items: newItems,
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
        totalProfit: totals.totalProfit,
        totalCost: totals.totalCost,
        paidAmount: (prev.type === 'cash' && !prev.splitPaymentMethod) ? totals.total : prev.paidAmount,
        balance: (prev.type === 'cash' && !prev.splitPaymentMethod) ? 0 : totals.total - prev.paidAmount,
      }
    })
  }, [setInvoice, calculateTotals, products])

  const updateAllocationQuantity = useCallback((itemId: string, batchId: string, newQty: number) => {
    applyBatchAllocations(itemId, (current) => current.map((a) => (a.batchId === batchId ? { ...a, quantity: newQty } : a)))
  }, [applyBatchAllocations])

  const addBatchToSplit = useCallback((itemId: string, batch: { id: string; batchNumber: string }) => {
    applyBatchAllocations(itemId, (current) =>
      current.some((a) => a.batchId === batch.id) ? current : [...current, { batchId: batch.id, batchNumber: batch.batchNumber, quantity: 1 }],
    )
  }, [applyBatchAllocations])

  /**
   * When a serial-tracked + batch-tracked line's picked serials change, re-derive the
   * batch split from what was actually picked — each serial belongs to exactly one real
   * batch (or none, for legacy/opening stock), so the allocation should follow the
   * seller's serial choices instead of being edited independently and risking a mismatch
   * (a batch counted as "3" on the line but only 2 of its actual serials picked). Any
   * portion of the line not yet pinned to a specific batch — serials still left to pick,
   * or ones with no recorded batch — fills whichever batches still have room, in the same
   * FEFO order as the initial auto-split, so the numbers always keep summing to the
   * line's quantity.
   */
  const updateItemImeis = useCallback((itemId: string, nextImeis: ImeiEntryInput[], records: ImeiRecord[]) => {
    setInvoice(prev => {
      const newItems = prev.items.map((item) => {
        if (item.id !== itemId) return item
        if (!item.variantId) {
          const patch: Partial<InvoiceItem> = { imeis: nextImeis }
          // A single-unit line for a bucket-style product (e.g. Old Phones' shared "Used
          // Phones" catalog entry, price 0 — every unit sells for a different amount) has
          // no meaningful product-level price or name to default to. Once the specific
          // unit is picked, back both in from its own record instead — still freely
          // editable afterwards, and left alone if the cashier already typed a price.
          if (nextImeis.length === 1 && item.quantity === 1) {
            const record = records.find((r) => r.imei === entryImei(nextImeis[0]))
            if (record) {
              if (record.askingPrice && item.unitPrice === 0) {
                patch.unitPrice = record.askingPrice
                patch.subtotal = record.askingPrice * item.quantity
                patch.profit = patch.subtotal - (item.cost || 0) * item.quantity
              }
              if (record.brand || record.model) {
                patch.name = [record.brand, record.model].filter(Boolean).join(' ')
              }
            }
          }
          return { ...item, ...patch }
        }

        const catalogEntry = sellableCatalog.find((c) => c.variantId === item.variantId)
        const batches = catalogEntry?.batches ?? []
        if (batches.length === 0) return { ...item, imeis: nextImeis }

        const batchIdByImei = new Map<string, string | null>(
          records.map((r) => [r.imei, (typeof r.batchId === 'string' ? r.batchId : r.batchId?.id) || null])
        )
        const knownCounts = new Map<string, number>()
        nextImeis.forEach((entry) => {
          const bId = batchIdByImei.get(entryImei(entry))
          if (bId) knownCounts.set(bId, (knownCounts.get(bId) || 0) + 1)
        })

        const currentAllocations: BatchAllocation[] = item.batchAllocations
          ?? (item.batchId ? [{ batchId: item.batchId, batchNumber: item.batchNumber || '', quantity: item.quantity }] : [])

        // Preserve the batches already part of the split (for order/labels), plus any new
        // one a picked serial actually belongs to that wasn't already in it.
        const orderedBatchIds = [...new Set([...currentAllocations.map((a) => a.batchId), ...knownCounts.keys()])]
        const next: BatchAllocation[] = orderedBatchIds.map((batchId) => ({
          batchId,
          batchNumber: currentAllocations.find((a) => a.batchId === batchId)?.batchNumber
            ?? batches.find((b) => b.id === batchId)?.batchNumber ?? '',
          quantity: knownCounts.get(batchId) ?? 0,
        }))

        let leftover = Math.max(0, item.quantity - next.reduce((sum, a) => sum + a.quantity, 0))
        for (const alloc of next) {
          if (leftover <= 0) break
          const cap = batches.find((b) => b.id === alloc.batchId)?.quantity ?? Infinity
          const take = Math.min(Math.max(0, cap - alloc.quantity), leftover)
          alloc.quantity += take
          leftover -= take
        }
        if (leftover > 0) {
          for (const b of batches.filter((b) => b.quantity > 0 && !next.some((a) => a.batchId === b.id))) {
            if (leftover <= 0) break
            const take = Math.min(b.quantity, leftover)
            next.push({ batchId: b.id, batchNumber: b.batchNumber, quantity: take })
            leftover -= take
          }
        }

        const finalAllocations = next.filter((a) => a.quantity > 0)
        const only = finalAllocations.length <= 1 ? finalAllocations[0] : undefined
        return {
          ...item,
          imeis: nextImeis,
          batchId: only ? only.batchId : (finalAllocations[0]?.batchId ?? item.batchId),
          batchNumber: only ? only.batchNumber : (finalAllocations[0]?.batchNumber ?? item.batchNumber),
          batchAllocations: only ? undefined : finalAllocations,
        }
      })
      return { ...prev, items: newItems }
    })
  }, [setInvoice, sellableCatalog])

  /** Selecting a specific used phone from UsedPhoneSelectDialog replaces the line's
   *  identity outright — unlike updateItemImeis's generic backfill (which never overwrites
   *  a price the cashier already typed), picking a *different* unit here should always
   *  update the name/price to match it, since the whole point of this picker is knowing
   *  exactly which phone the line now represents. */
  const selectUsedPhoneForItem = useCallback((itemId: string, buyback: PhoneBuybackRecord) => {
    const summary = typeof buyback.imeiRecordId === 'object' && buyback.imeiRecordId !== null ? buyback.imeiRecordId : null
    const price = summary?.askingPrice || buyback.askingPrice || buyback.agreedPrice || 0
    const name = [buyback.brand, buyback.model].filter(Boolean).join(' ') || 'Used Phone'
    const imeiEntry: ImeiEntryInput = summary?.imei2 ? { imei: buyback.imei, imei2: summary.imei2 } : buyback.imei
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.map((item) => item.id === itemId
        ? {
          ...item,
          imeis: [imeiEntry],
          name,
          unitPrice: price,
          subtotal: price * item.quantity,
          profit: price * item.quantity - (item.cost || 0) * item.quantity,
        }
        : item),
    }))
    setSerialDialogItemId('')
  }, [setInvoice])

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

  const handlePriceKeyDown = useCallback((e: React.KeyboardEvent, currentItemId: string) => {
    onEnterAdvance(e, () => {
      // Serial/IMEI-tracked lines route through the picker dialog next — it hands off to
      // the next product itself (onComplete) once the line's fully covered. Everything
      // else goes straight to the next product row, as before.
      const item = invoice.items.find((i) => i.id === currentItemId)
      const product = item ? products.find((p: any) => (p._id || p.id) === item.productId) : undefined
      if (product?.trackImei || product?.trackSerial) {
        setSerialDialogItemId(currentItemId)
        return
      }
      addNewRowAndOpenProduct()
    })
  }, [invoice.items, products, addNewRowAndOpenProduct])

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
          // See the customer-select handler above: reset the cash-default
          // paidAmount/balance so a fresh credit invoice doesn't save as fully paid.
          paidAmount: 0,
          balance: prev.total,
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
              trackSerial: entity.trackSerial,
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
    updateDiscount({ value: Math.max(0, parseFloat(value) || 0) })
  }, [updateDiscount])

  // Flip both the overall discount and every line item's discount to the other unit in
  // one click — re-deriving each raw value so the actual Rs discounted stays the same,
  // it's just entered/displayed in the new unit. Mirrors purchase-invoice's
  // toggleAllDiscountTypes (see purchase-panel.tsx).
  const toggleAllDiscountTypes = useCallback(() => {
    setInvoice((prev) => {
      const targetType: DiscountType = prev.discountType === 'percentage' ? 'fixed' : 'percentage'

      const items = prev.items.map((item) => {
        const gross = item.quantity * item.unitPrice
        const currentAmount = computeDiscountAmount(gross, item.discountType, item.discountValue)
        const newValue = targetType === 'percentage'
          ? (gross > 0 ? (currentAmount / gross) * 100 : 0)
          : currentAmount
        const roundedValue = Math.round(newValue * 100) / 100
        const totalCost = (item.stockQuantity || item.quantity) * item.cost
        const net = applyLineDiscount({ subtotal: gross, profit: gross - totalCost }, targetType, roundedValue)
        return {
          ...item,
          discountType: targetType,
          discountValue: roundedValue,
          discountAmount: net.discountAmount,
          subtotal: net.subtotal,
          profit: net.profit,
        }
      })

      const netSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
      const currentOverallAmount = computeDiscountAmount(netSubtotal, prev.discountType, prev.discountValue)
      const newOverallValue = targetType === 'percentage'
        ? (netSubtotal > 0 ? (currentOverallAmount / netSubtotal) * 100 : 0)
        : currentOverallAmount
      const roundedOverallValue = Math.round(newOverallValue * 100) / 100

      const totals = calculateTotals
        ? calculateTotals(items, targetType, roundedOverallValue, prev.deliveryCharge || 0, prev.serviceCharge || 0)
        : null

      return {
        ...prev,
        items,
        discountType: targetType,
        discountValue: roundedOverallValue,
        ...(totals && {
          subtotal: totals.subtotal,
          tax: totals.tax,
          discount: totals.discount,
          total: totals.total,
          totalProfit: totals.totalProfit,
          totalCost: totals.totalCost,
          paidAmount: (prev.type === 'cash' && !prev.splitPaymentMethod) ? totals.total : prev.paidAmount,
          balance: (prev.type === 'cash' && !prev.splitPaymentMethod) ? 0 : totals.total - prev.paidAmount,
        }),
      }
    })
  }, [setInvoice, calculateTotals])

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
      if (SHOW_INVOICE_PAYMENT_METHOD_UI && invoice.splitPaymentMethod === 'wallet' && !invoice.splitWalletType) {
        toast.error('Please select an account for the split payment')
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

      // IMEI/serial-tracked products must have exactly one number selected per unit sold
      for (const item of validItems) {
        const product = products.find((p: any) => (p._id || p.id) === item.productId)
        if (!product?.trackImei && !product?.trackSerial) continue
        const label = product?.trackSerial ? 'serial' : 'IMEI'
        const imeiCount = (item.imeis || []).length
        if (imeiCount !== item.quantity) {
          toast.error(`${item.name}: select ${item.quantity} ${label} number(s) — ${imeiCount} selected`)
          return
        }
      }

      // The split leg is an independent amount, not carved out of Paid Amount — the two
      // legs add up to what was actually paid (see split-payment-fields.tsx).
      const splitPaidAmountForSave = invoice.splitPaymentMethod ? Math.max(0, Number(invoice.splitPaidAmount || 0)) : 0
      const totalPaidAmountForSave = (invoice.paidAmount || 0) + splitPaidAmountForSave

      const invoiceData = {
        items: validItems.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          batchAllocations: item.batchAllocations,
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
          discountType: item.discountType || 'fixed',
          discountValue: item.discountValue || 0,
          discountAmount: item.discountAmount || 0,
          isManualEntry: item.isManualEntry || false,
          imeis: item.imeis || [],
        })),
        // Manual invoice-number override — only meaningful on create. updateInvoice's
        // validation schema doesn't allow this field at all (an existing invoice's number
        // isn't editable after the fact), so it's left out of the payload entirely when
        // editing rather than sent and silently rejected.
        ...(!isEditing && invoice.invoiceNumber?.trim() ? { invoiceNumber: invoice.invoiceNumber.trim() } : {}),
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        walkInCustomerName: invoice.walkInCustomerName,
        leadId: invoice.leadId || undefined,
        type: invoice.type,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        discountType: invoice.discountType || 'fixed',
        discountValue: invoice.discountValue || 0,
        discount: invoice.discount,
        total: invoice.total,
        totalProfit: invoice.totalProfit,
        totalCost: invoice.totalCost,
        paidAmount: totalPaidAmountForSave,
        balance: invoice.total - totalPaidAmountForSave,
        salesmanId: invoice.salesmanId || undefined,
        notes: normalizeInvoiceNotesHtml(invoice.notes || ''),
        receivedByName: invoice.type === 'pending' ? (invoice.receivedByName || '').trim() : undefined,
        deliveryCharge: invoice.deliveryCharge,
        serviceCharge: invoice.serviceCharge,
        roundingAdjustment: invoice.roundingAdjustment,
        splitPayment: invoice.splitPayment,
        paymentMethod: invoice.paymentMethod || 'cash',
        walletType: invoice.paymentMethod === 'wallet' ? (invoice.walletType || '') : undefined,
        splitPaymentMethod: invoice.splitPaymentMethod,
        splitWalletType: invoice.splitPaymentMethod === 'wallet' ? (invoice.splitWalletType || '') : undefined,
        splitPaidAmount: splitPaidAmountForSave,
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
          updatedBalance = await fetchBalanceForCustomerId(invoice.customerId)
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
      // Both SMS and WhatsApp fire immediately — no confirmation dialog. Pending-only —
      // the "Also send after saving" selector is only shown for pending invoices, so this
      // guard stops a sendMethod choice left over from an earlier pending invoice (it's
      // persisted in localStorage) from silently firing on a cash/credit/quotation save
      // where the toggle is no longer visible to turn off.
      if (sendMethod !== 'none' && savedInvoicePayload.type === 'pending') {
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
            branchName: resolveBranchCompanyName(orgData?.name, branchData?.name),
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
              branchName: resolveBranchCompanyName(orgData?.name, branchData?.name),
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
                subtotal: item.subtotal,
                discountAmount: item.discountAmount,
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
              companyName: resolveBranchCompanyName(orgData?.name, branchData?.name),
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

          // Fire-and-forget — save/print already completed, sending runs in the background.
          // WhatsApp is only offered for pending (goods handoff) invoices — the UI already
          // disables that choice for other types, this is the belt-and-suspenders check.
          if (sendMethod === 'sms' || sendMethod === 'both') sendSmsNow()
          if ((sendMethod === 'whatsapp' || sendMethod === 'both') && isPendingHandoff) sendWhatsAppNow()
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

  // Shared per-line-item content — computed once, then assembled into either a
  // <TableRow> (catalog hidden) or a stacked card (catalog shown, see the
  // showProductCatalog branch below). Product info (name/batches/branch/stock) is
  // shared as-is between both layouts. Qty/price/discount/total are computed as TWO
  // sets instead — table cell styling (h-9, boxed) vs. card styling (h-7, labeled,
  // matching Purchase's item card) — since forcing one set of classes to work in both
  // contexts is what caused the card layout's controls to wrap onto separate lines
  // earlier; each layout now gets markup actually built for it.
  const renderInvoiceItemParts = (item: InvoiceItem) => {
                const currentProduct = products.find(p => (p._id || p.id) === item.productId)
                // For a real variant, `products` only ever holds the legacy/parent
                // product (its stockQuantity is a stale fallback, not this variant's
                // real number) — read the variant's live stock from the catalog instead.
                const catalogEntry = item.variantId
                  ? sellableCatalog.find(c => c.variantId === item.variantId)
                  : undefined
                // `products` is also a local running-balance cache for plain products:
                // addToInvoice/updateQuantity already decrement it by this very line's
                // quantity as it changes (see index.tsx), so `currentProduct.stockQuantity`
                // is never the raw total either — it's already net of item.quantity, which
                // would double-subtract it below. `sellableCatalog` is never locally
                // mutated, so it's the one source that's always the true, un-netted total —
                // prefer it here too, only falling back to the stale cache if this item
                // isn't in the catalog at all (e.g. a deleted product).
                const stockCatalogEntry = item.variantId
                  ? catalogEntry
                  : sellableCatalog.find(c => c.type === 'product' && c.productId === item.productId)
                const totalCatalogStock = stockCatalogEntry?.stockQuantity ?? currentProduct?.stockQuantity
                // The catalog number is a snapshot from when it was fetched — it has no idea
                // this line has already claimed `item.quantity` of it. Subtract that out so
                // the badge reads as "what's left after this invoice", not "what existed
                // before you started adding it" — otherwise it never moves as you type a
                // higher quantity, even while a batch chip below visibly runs out.
                const remainingStock = totalCatalogStock !== undefined ? Math.max(0, totalCatalogStock - item.quantity) : undefined
                const hasProduct = Boolean(item.productId && item.name)
                const deleteButton = (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeFromInvoice(item.id)}
                    className='h-7 w-7 p-0 flex-shrink-0 hover:bg-red-50 dark:hover:bg-red-950/30'
                  >
                    <Trash2 className='h-3.5 w-3.5 text-red-400 hover:text-red-600' />
                  </Button>
                )
                // Past sales of this exact product to this exact customer — only
                // meaningful once both a real product and a real (non walk-in) customer
                // are on the invoice.
                const canShowHistory = !!item.productId && !!invoice.customerId && invoice.customerId !== 'walk-in'
                const historyButton = canShowHistory ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setHistoryDialog({
                      open: true,
                      productId: item.productId,
                      productName: item.name,
                      currentPrice: item.unitPrice,
                    })}
                    title={t('view_history')}
                    className='h-7 w-7 p-0 flex-shrink-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                  >
                    <History className='h-3.5 w-3.5' />
                  </Button>
                ) : null

    // Hoisted out of productCell's assembly below so productCellCard (catalog-shown
    // card layout) can reuse the exact same pieces in a different order — table mode
    // wants name → batches → stock/branch, card mode wants name → stock/branch →
    // batches (branches "upper", batches "below", per request) — without recomputing
    // any of this twice.
    const hasBatches = !!(catalogEntry?.trackBatch && catalogEntry.batches && catalogEntry.batches.length > 0)

    const stockBadge = remainingStock !== undefined && (
      <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
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
        {/* remainingStock is "what's left after this line sells" — 0 doesn't mean
            there's nothing to sell, it can just mean this line is taking the last
            unit(s) (e.g. exactly 2 in stock, selling 2). Only call it "Out of stock"
            when there was truly nothing here before this line was even added. */}
        {remainingStock <= 0
          ? ((totalCatalogStock ?? 0) > 0 ? '0 left' : 'Out of stock')
          : `${remainingStock} left`}
      </span>
    )

    const branchTrigger = (
      <BranchStockTrigger
        productId={item.productId}
        variantId={item.variantId}
        itemName={item.name}
      />
    )

    const serialTrigger = (currentProduct?.trackImei || currentProduct?.trackSerial) && (
      <SerialSummaryTrigger
        selectedCount={(item.imeis || []).length}
        quantity={item.quantity}
        isSerial={!!currentProduct?.trackSerial}
        onClick={() => setSerialDialogItemId(item.id)}
      />
    )

    // Which batch(es) this sale depletes — defaults to the earliest-expiry batch,
    // switchable by clicking another. If the quantity outgrows a single batch,
    // updateQuantity auto-suggests a FEFO split (earliest expiry first) across several
    // — rendered here as an editable breakdown instead of these plain single-select
    // chips. See docs/architecture/universal-product-migration.md.
    const batchTags = hasBatches && (
      item.batchAllocations && item.batchAllocations.length > 1 ? (
        <BatchAllocationEditor
          allocations={item.batchAllocations}
          batches={catalogEntry!.batches!}
          onUpdateQuantity={(batchId, qty) => updateAllocationQuantity(item.id, batchId, qty)}
          onAddBatch={(batch) => addBatchToSplit(item.id, batch)}
        />
      ) : (() => {
        // Hide batches with nothing left to sell from — nothing to pick there. The
        // exception is whichever batch this line already has selected: keep showing
        // it (even at 0) so the selection and its "insufficient stock" warning below
        // stay visible instead of the chip just vanishing with no explanation.
        const visibleBatches = catalogEntry!.batches!.filter(
          (b) => b.quantity > 0 || item.batchId === b.id,
        )
        if (visibleBatches.length === 0) return null
        const selectedBatch = visibleBatches.find((b) => item.batchId === b.id) ?? visibleBatches[0]
        // Only the batch this line is actually drawing from has its stock reduced by
        // this line's quantity — other batches' numbers are untouched by a selection
        // that doesn't draw from them.
        const selectedLeft = Math.max(0, selectedBatch.quantity - item.quantity)
        const pillClass = 'inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-600 bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-800 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
        // One known batch needs no picker — just show it. With a real choice,
        // collapse every option behind a single compact trigger instead of one chip
        // per batch: long batch numbers (e.g. "BATCH-260627-102") rendered inline
        // used to wrap a line across 3-4 rows on their own once there were 2-3
        // batches to pick from.
        if (visibleBatches.length === 1) {
          return (
            <span
              className={pillClass}
              title={selectedBatch.expiryDate ? `Expires ${new Date(selectedBatch.expiryDate).toLocaleDateString()}` : undefined}
            >
              <Layers className='h-2.5 w-2.5 shrink-0' />
              <span className='max-w-[100px] truncate'>{selectedBatch.batchNumber}</span>
              · {selectedLeft} left
            </span>
          )
        }
        return (
          <Popover>
            <PopoverTrigger asChild>
              <button type='button' className={cn(pillClass, 'hover:bg-blue-200 dark:hover:bg-blue-950/60')}>
                <Layers className='h-2.5 w-2.5 shrink-0' />
                <span className='max-w-[80px] truncate'>{selectedBatch.batchNumber}</span>
                · {selectedLeft} left
                <ChevronDown className='h-2.5 w-2.5 shrink-0' />
              </button>
            </PopoverTrigger>
            <PopoverContent className='w-64 p-1.5' align='start'>
              <div className='flex flex-col gap-0.5'>
                {visibleBatches.map((b) => {
                  const isSelected = item.batchId === b.id
                  const batchLeft = isSelected ? selectedLeft : b.quantity
                  return (
                    <button
                      key={b.id}
                      type='button'
                      onClick={() => updateItemBatch(item.id, b.id, b.batchNumber, b.quantity, b.costPerUnit, b.sellingPrice, catalogEntry?.price)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                        isSelected ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200' : 'hover:bg-muted',
                      )}
                    >
                      <span className='truncate font-medium'>{b.batchNumber}</span>
                      <span className='flex shrink-0 items-center gap-1.5'>
                        {b.expiryDate && (
                          <span className='text-muted-foreground'>exp {new Date(b.expiryDate).toLocaleDateString()}</span>
                        )}
                        <span className='font-semibold'>{batchLeft} left</span>
                        {isSelected && <Check className='h-3 w-3' />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        )
      })()
    )

    const insufficientStockWarning = !(item.batchAllocations && item.batchAllocations.length > 1) && (() => {
      const selectedBatch = item.batchId
        ? catalogEntry?.batches?.find((b) => b.id === item.batchId)
        : undefined
      if (!selectedBatch || item.quantity <= selectedBatch.quantity) return null
      return (
        <p className='text-xs text-destructive mt-1'>
          Only {selectedBatch.quantity} available in batch {selectedBatch.batchNumber} — reduce the quantity or pick a different batch.
        </p>
      )
    })()

    // Manual (still unpicked) row's product-search combobox — identical in both
    // layouts, so it's built once and reused by productCell/productCellCard below.
    const manualEntryPicker = (
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
                                  className={cn(
                                    'h-9 w-full min-w-[200px] justify-between text-sm font-normal',
                                    !item.productId && 'border-dashed',
                                  )}
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Search className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                    <span className='flex min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-0 text-left'>
                                      <span
                                        className={getTextClasses(item.name || t('select_product'), 'truncate shrink-0 text-muted-foreground')}
                                        title={item.name || t('select_product')}
                                      >
                                        {item.name || t('select_product')}
                                        {!item.productId && ' *'}
                                      </span>
                                      {showUrdu && item.nameUrdu?.trim() ? (
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
                                                {showUrdu && catalogItem.nameUrdu?.trim() ? (
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
                                                <BranchStockTrigger
                                                  productId={catalogItem.productId}
                                                  variantId={catalogItem.variantId}
                                                  itemName={catalogItem.name}
                                                />
                                                {catalogItem.cost != null && (
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
                                                )}
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
    )
    const productImage = item.image?.url ? (
      <img
        src={item.image.url}
        alt={item.name}
        className='h-10 w-10 flex-shrink-0 rounded-lg object-cover'
      />
    ) : (
      <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted'>
        <Package className='h-5 w-5 text-muted-foreground/50' />
      </div>
    )

    // Table order (catalog hidden — unchanged): name → batches+serial → stock+branch.
    const productCell = (
      <div className='flex items-start gap-3'>
        {productImage}
        <div className='min-w-0 flex-1'>
          {item.isManualEntry ? manualEntryPicker : (
            <div className='min-w-0 flex-1'>
              <BilingualName
                primary={item.name}
                secondary={item.nameUrdu}
                primaryClassName='font-semibold text-sm'
                truncate
              />
              {(hasBatches || serialTrigger) && (
                <div className='flex flex-wrap items-center gap-1.5 mt-1'>
                  {batchTags}
                  {serialTrigger}
                </div>
              )}
              <div className='flex flex-wrap items-center gap-1.5 mt-1'>
                {stockBadge}
                {branchTrigger}
              </div>
              {insufficientStockWarning}
            </div>
          )}
        </div>
      </div>
    )

    // Card order (catalog shown, per request): name → stock+branch ("branches upper")
    // → batches+serial ("batches below") — the reverse of the table's order above.
    const productCellCard = (
      <div className='flex items-start gap-3'>
        {productImage}
        <div className='min-w-0 flex-1'>
          {item.isManualEntry ? manualEntryPicker : (
            <div className='min-w-0 flex-1'>
              <BilingualName
                primary={item.name}
                secondary={item.nameUrdu}
                primaryClassName='font-semibold text-sm'
                truncate
              />
              <div className='flex flex-wrap items-center gap-1.5 mt-1'>
                {stockBadge}
                {branchTrigger}
              </div>
              {(hasBatches || serialTrigger) && (
                <div className='flex flex-wrap items-center gap-1.5 mt-1'>
                  {batchTags}
                  {serialTrigger}
                </div>
              )}
              {insufficientStockWarning}
            </div>
          )}
        </div>
      </div>
    )
    // Shared by qtyControl (table) and qtyControlCard (catalog-shown card) below — same
    // reasoning as updateUnitPrice above.
    const updateUnit = (value: string) => {
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

      // Simple products may sell into negative stock — variant/batch
      // items still enforce the cap (though unit conversion doesn't
      // apply to those today anyway).
      if (item.variantId && stockDifference > 0 && stockDifference > selectedProduct.stockQuantity) {
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

      const net = applyLineDiscount(lineValues, item.discountType, item.discountValue)
      const newItems = invoice.items.map((invoiceItem) =>
        invoiceItem.id === item.id
          ? {
              ...invoiceItem,
              unit: lineValues.lineUnit,
              conversionFactor: lineValues.conversionFactor,
              stockQuantity: lineValues.stockQuantity,
              unitPrice: adjustedUnitPrice,
              subtotal: net.subtotal,
              profit: net.profit,
              discountAmount: net.discountAmount,
            }
          : invoiceItem
      )

      if (calculateTotals) {
        const totals = calculateTotals(newItems, invoice.discountType, invoice.discountValue, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
        setInvoice((prev) => ({
          ...prev,
          items: newItems,
          subtotal: totals.subtotal,
          tax: totals.tax,
          discount: totals.discount,
          total: totals.total,
          totalProfit: totals.totalProfit,
          totalCost: totals.totalCost,
          paidAmount: (prev.type === 'cash' && !prev.splitPaymentMethod) ? totals.total : prev.paidAmount,
          balance: (prev.type === 'cash' && !prev.splitPaymentMethod) ? 0 : totals.total - prev.paidAmount,
        }))
      }
    }
    const unitOptions = products.find((p) => (p._id || p.id) === item.productId)
      ? getProductUnitOptions(products.find((p) => (p._id || p.id) === item.productId))
      : [{ value: item.unit || 'pcs', label: item.unit || 'pcs' }]
    const qtyControl = (
                      !hasProduct ? (
                        <span className='text-xs text-muted-foreground'>—</span>
                      ) : (
                        <div className='flex flex-wrap items-center gap-1.5'>
                        {/* Quantity Stepper */}
                        <div className='flex items-center gap-1.5 shrink-0'>
                          <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className='h-8 w-8 rounded-none border-r p-0 text-muted-foreground hover:text-foreground hover:bg-muted xl:h-9 xl:w-9'
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
                              className='h-8 w-10 text-center text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] xl:h-9 xl:w-14'
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className='h-8 w-8 rounded-none border-l p-0 text-muted-foreground hover:text-foreground hover:bg-muted xl:h-9 xl:w-9'
                            >
                              <Plus className='h-3.5 w-3.5' />
                            </Button>
                          </div>
                          <span className='text-xs text-muted-foreground'>{item.unit || 'pcs'}</span>
                        </div>

                        {showUnitConversions && (
                          <div className='flex flex-col gap-1 min-w-[80px] shrink-0'>
                            <Label className='text-[10px] text-muted-foreground'>{t('unit')}</Label>
                            <Select value={item.unit || 'pcs'} onValueChange={updateUnit}>
                              <SelectTrigger className='h-6 text-xs px-2'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {unitOptions.map((unitOption) => (
                                  <SelectItem key={unitOption.value} value={unitOption.value}>
                                    {unitOption.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        </div>
                      )
    )
    // Shared by priceControl (table) and priceControlCard (catalog-shown card) below —
    // extracted so this line's price-update math has one home instead of drifting apart
    // as two separate onChange bodies.
    const updateUnitPrice = (newPrice: number) => {
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

              const net = applyLineDiscount(lineValues, i.discountType, i.discountValue)
              return {
                ...i,
                unitPrice: newPrice,
                subtotal: net.subtotal,
                profit: net.profit,
                discountAmount: net.discountAmount,
                stockQuantity: lineValues.stockQuantity,
                conversionFactor: lineValues.conversionFactor,
              }
            })()
          : i
      )

      if (calculateTotals) {
        const totals = calculateTotals(newItems, invoice.discountType, invoice.discountValue, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
        setInvoice(prev => ({
          ...prev,
          items: newItems,
          subtotal: totals.subtotal,
          tax: totals.tax,
          discount: totals.discount,
          total: totals.total,
          totalProfit: totals.totalProfit,
          totalCost: totals.totalCost,
          paidAmount: (prev.type === 'cash' && !prev.splitPaymentMethod) ? totals.total : prev.paidAmount,
          balance: (prev.type === 'cash' && !prev.splitPaymentMethod) ? 0 : totals.total - prev.paidAmount,
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
    }
    const priceControl = (
                      !hasProduct ? (
                        <span className='text-xs text-muted-foreground'>—</span>
                      ) : (
                        <div className='flex w-full items-center rounded-lg border bg-background overflow-hidden'>
                          <span className='px-1.5 h-8 flex items-center text-xs text-muted-foreground bg-muted border-r font-medium select-none xl:px-2 xl:h-9'>Rs</span>
                          <Input
                            ref={(el) => { priceInputRefs.current[item.id] = el }}
                            type="text"
                            inputMode="decimal"
                            showVoiceInput={false}
                            value={item.unitPrice > 0 ? item.unitPrice : ''}
                            onKeyDown={(e) => handlePriceKeyDown(e, item.id)}
                            onChange={(e) => updateUnitPrice(parseFloat(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            className='h-8 min-w-0 flex-1 text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] xl:h-9'
                          />
                        </div>
                      )
    )
    const discountControl = (
                      !hasProduct ? (
                        <span className='text-xs text-muted-foreground'>—</span>
                      ) : (
                        <div className='inline-flex items-center rounded-lg border bg-background overflow-hidden'>
                          <Input
                            type="text"
                            inputMode="decimal"
                            showVoiceInput={false}
                            value={item.discountValue || ''}
                            onChange={(e) => updateItemDiscount(item.id, { value: Math.max(0, parseFloat(e.target.value) || 0) })}
                            onFocus={(e) => e.target.select()}
                            placeholder='0'
                            className='h-8 w-10 text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] xl:h-9 xl:w-14'
                          />
                          <button
                            type="button"
                            onClick={() => updateItemDiscount(item.id, { type: item.discountType === 'percentage' ? 'fixed' : 'percentage' })}
                            title='Click to switch between Rs and % discount'
                            className='px-1.5 h-8 flex items-center text-xs text-muted-foreground bg-muted border-l font-medium select-none cursor-pointer hover:bg-primary hover:text-primary-foreground active:scale-95 transition-colors xl:px-2 xl:h-9'
                          >
                            {item.discountType === 'percentage' ? '%' : 'Rs'}
                          </button>
                        </div>
                      )
    )
    const totalDisplay = (
                      !hasProduct ? (
                        <span className='text-xs text-muted-foreground'>—</span>
                      ) : (
                        <div>
                          {(item.discountAmount || 0) > 0 && (
                            <p className='text-[10px] text-muted-foreground line-through leading-none'>Rs{(item.quantity * item.unitPrice).toFixed(2)}</p>
                          )}
                          <p className='font-bold text-sm'>Rs{item.subtotal.toFixed(2)}</p>
                          {showProfitDetails && (
                            <p className='text-xs text-green-600'>+Rs{item.profit.toFixed(2)}</p>
                          )}
                        </div>
                      )
    )

    // Catalog-shown card equivalents of the four controls above — styled to match
    // Purchase's item-card design (client/src/features/purchase-invoice/components/
    // purchase-panel.tsx: h-7 controls, a small label above each field, ×/−/= separators)
    // per request, instead of reusing the table's h-9 boxed-cell styling. The table
    // versions above are untouched — catalog-hidden mode keeps its exact current look.
    const qtyControlCard = !hasProduct ? null : (
      <div className='flex items-center gap-1.5 shrink-0'>
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
            onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
            onKeyDown={(e) => handleQuantityKeyDown(e, item.id)}
            onFocus={(e) => e.target.select()}
            className='h-7 w-14 text-center text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
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
        {showUnitConversions && (
          <Select value={item.unit || 'pcs'} onValueChange={updateUnit}>
            <SelectTrigger className='h-6 text-xs px-2'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {unitOptions.map((unitOption) => (
                <SelectItem key={unitOption.value} value={unitOption.value}>
                  {unitOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    )
    const priceControlCard = !hasProduct ? null : (
      <div className='flex flex-col gap-0.5'>
        <span className='text-[10px] text-muted-foreground leading-none'>Unit Price</span>
        <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
          <span className='px-2 h-7 flex items-center text-xs text-muted-foreground bg-muted border-r font-medium select-none'>Rs</span>
          <Input
            ref={(el) => { priceInputRefs.current[item.id] = el }}
            type="text"
            inputMode="decimal"
            showVoiceInput={false}
            value={item.unitPrice > 0 ? item.unitPrice : ''}
            onKeyDown={(e) => handlePriceKeyDown(e, item.id)}
            onChange={(e) => updateUnitPrice(parseFloat(e.target.value) || 0)}
            onFocus={(e) => e.target.select()}
            placeholder='0'
            className='h-7 w-20 text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
          />
        </div>
      </div>
    )
    const discountControlCard = !hasProduct ? null : (
      <div className='flex flex-col gap-0.5'>
        <span className='text-[10px] text-muted-foreground leading-none'>Discount</span>
        <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
          <Input
            type="text"
            inputMode="decimal"
            showVoiceInput={false}
            value={item.discountValue || ''}
            onChange={(e) => updateItemDiscount(item.id, { value: Math.max(0, parseFloat(e.target.value) || 0) })}
            onFocus={(e) => e.target.select()}
            placeholder='0'
            className='h-7 w-14 text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
          />
          <button
            type="button"
            onClick={() => updateItemDiscount(item.id, { type: item.discountType === 'percentage' ? 'fixed' : 'percentage' })}
            title='Click to switch between Rs and % discount'
            className='px-2 h-7 flex items-center text-xs text-muted-foreground bg-muted border-l font-medium select-none cursor-pointer hover:bg-primary hover:text-primary-foreground active:scale-95 transition-colors'
          >
            {item.discountType === 'percentage' ? '%' : 'Rs'}
          </button>
        </div>
      </div>
    )
    const totalDisplayCard = !hasProduct ? null : (
      <div className='flex flex-col items-end gap-0 ml-auto shrink-0'>
        {(item.discountAmount || 0) > 0 && (
          <span className='text-[10px] text-muted-foreground line-through leading-none'>Rs{(item.quantity * item.unitPrice).toFixed(2)}</span>
        )}
        <div className='flex items-center gap-1.5'>
          <span className='text-muted-foreground/60 text-sm select-none'>=</span>
          <p className='font-bold text-sm'>Rs{item.subtotal.toFixed(2)}</p>
        </div>
        {showProfitDetails && (
          <p className='text-xs text-green-600'>+Rs{item.profit.toFixed(2)}</p>
        )}
      </div>
    )

    return {
      hasProduct, productCell, qtyControl, priceControl, discountControl, totalDisplay, deleteButton, historyButton,
      productCellCard, qtyControlCard, priceControlCard, discountControlCard, totalDisplayCard,
    }
  }

  // Shared by the catalog-shown items list and the catalog-hidden list's phone-width view
  // (<sm) below — same stacked name-then-controls card, just reached from two call sites
  // instead of the fixed-width table.
  const renderItemCard = (item: InvoiceItem) => {
    const { hasProduct, productCellCard, qtyControlCard, priceControlCard, discountControlCard, totalDisplayCard, deleteButton, historyButton } = renderInvoiceItemParts(item)
    return (
      <div key={item.id} className={cn('rounded-xl border bg-card shadow-sm overflow-hidden', !hasProduct && 'border-dashed')}>
        <div className='flex items-start gap-3 p-3'>
          {/* min-w-0 flex-1 here (not on productCellCard's own root, which is shared
              markup) is what actually pushes history/delete to the card's right edge —
              without it this row sizes to the name's content width and the icons just
              trail right after it. */}
          <div className='min-w-0 flex-1'>{productCellCard}</div>
          <div className='flex items-center gap-0.5 shrink-0'>
            {historyButton}
            {deleteButton}
          </div>
        </div>
        {hasProduct && (
          <div className='flex items-center gap-3 flex-wrap border-t bg-muted/20 px-3 py-2.5'>
            {qtyControlCard}
            <span className='text-muted-foreground/60 text-sm select-none'>×</span>
            {priceControlCard}
            <span className='text-muted-foreground/60 text-sm select-none'>−</span>
            {discountControlCard}
            {totalDisplayCard}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        !showProductCatalog
          ? // Three columns — details / items / summary+payment+actions — each column is
            // its own independent top-to-bottom stack (the wrapper divs below), so a
            // column's height is just its own content, never stretched or clipped to
            // match another column's. `minmax(0,1fr)` on the middle track, not a bare
            // `1fr`: a bare `1fr` track's minimum is its content's natural (unwrapped)
            // size, so one long product name would force this whole column — and the
            // page — wider instead of letting the name column's flex-1/min-w-0/truncate
            // chain actually clip it.
            'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[320px_minmax(0,1fr)_300px] items-start'
          : 'space-y-4',
      )}
    >
      {/* Keyboard Language Override
      <KeyboardLanguageOverride />*/}

      {/* Column 1 (compact mode): Invoice Details.
          min-w-0 matters here even though the track is a fixed 320px — a grid item's
          default min-width is content-based ("auto"), so a long customer/product name
          can still force this item wider than its fixed-length track and spill out. */}
      <div className={cn('min-w-0 space-y-4', !showProductCatalog && 'md:col-start-1 md:row-start-1 xl:row-start-1 xl:col-start-1')}>
      {/* Invoice Details */}
      <Card>
        <CardHeader className='pb-4'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <CardTitle className='flex items-center gap-2 text-base'>
              {onBackToList && (
                <Button variant="ghost" size="sm" className='-ml-2 h-8 w-8 p-0' onClick={onBackToList}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <DollarSign className='h-4 w-4 text-muted-foreground' />
              {t('invoice_details')}
            </CardTitle>

            <div className='flex items-center gap-2'>
              <Label htmlFor='invoice-print-urdu-header' className='text-xs font-normal text-muted-foreground whitespace-nowrap'>
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

          {/* Invoice number — real (read-only) once saved; before that, a live preview of
              what the next save would auto-assign, editable via the pencil. Saved invoices
              can't have their number changed after the fact (updateInvoice's validation
              doesn't accept the field), so editing only applies pre-save. */}
          {isEditing ? (
            editingInvoice?.invoiceNumber && (
              <div className='mt-3 flex items-center gap-2'>
                <span className='text-xs text-muted-foreground'>{t('invoice_number') || 'Invoice Number'}</span>
                <span className='rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs'>
                  {editingInvoice.invoiceNumber}
                </span>
              </div>
            )
          ) : (
            <div className='mt-3 flex items-center gap-2'>
              <span className='text-xs text-muted-foreground'>{t('invoice_number') || 'Invoice Number'}</span>
              {isEditingInvoiceNumber ? (
                <div className='flex items-center gap-1'>
                  <Input
                    autoFocus
                    showVoiceInput={false}
                    value={invoice.invoiceNumber ?? previewedInvoiceNumber ?? ''}
                    onChange={(e) => setInvoice(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => setIsEditingInvoiceNumber(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); setIsEditingInvoiceNumber(false) }
                    }}
                    className='h-7 w-44 font-mono text-xs'
                  />
                  {invoice.invoiceNumber && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='h-7 w-7 p-0 text-muted-foreground'
                      title={t('reset_to_auto_generated') || 'Reset to auto-generated'}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setInvoice(prev => ({ ...prev, invoiceNumber: undefined }))
                        setIsEditingInvoiceNumber(false)
                      }}
                    >
                      <RotateCcw className='h-3.5 w-3.5' />
                    </Button>
                  )}
                </div>
              ) : (
                <button
                  type='button'
                  onClick={() => setIsEditingInvoiceNumber(true)}
                  className='inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-muted'
                  title={t('edit_invoice_number') || 'Edit invoice number'}
                >
                  {invoice.invoiceNumber || previewedInvoiceNumber || '…'}
                  <Pencil className='h-3 w-3 text-muted-foreground' />
                </button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className='space-y-4'>
          {/* Customer + Invoice Date share a row only when the catalog is showing —
              that layout has a wide enough Invoice Details column for the pair to sit
              comfortably. In catalog-hidden (compact) mode the column is much narrower
              (part of a 3-column page), so pairing them there just crams both — Date
              drops back to its own full-width row below Customer instead. */}
          <div className={cn('grid gap-4', showProductCatalog && 'sm:grid-cols-2')}>
          <div className="min-w-0">
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
                    className={`flex-1 shrink min-w-0 justify-between min-h-[2.5rem] h-auto py-0 ${
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
                                const urdu = showUrdu ? selectedCustomer.nameUrdu?.trim() : undefined
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1.5 max-w-full min-w-0 pl-1">
                                    <ContactPhotoCell
                                      picture={selectedCustomer.picture}
                                      name={selectedCustomer.name || ''}
                                      className="h-5 w-5 shrink-0 rounded-full"
                                    />
                                    <span className="flex min-w-0 flex-row flex-wrap items-center gap-x-1.5 gap-y-0">
                                      <span className={getTextClasses(selectedCustomer.name, 'text-xs min-w-0 break-words')} title={selectedCustomer.name}>
                                        {selectedCustomer.name}
                                      </span>
                                      {selectedCustomer.isEmployeeAccount ? (
                                        <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={t('Employee')} />
                                      ) : null}
                                      {selectedCustomer.isSupplierAccount ? (
                                        <Truck className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={t('Supplier')} />
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
                                  <Badge variant="secondary" className="flex items-center gap-1.5 max-w-full min-w-0 pl-1">
                                    <ContactPhotoCell
                                      picture={undefined}
                                      name={invoice.customerName}
                                      className="h-5 w-5 shrink-0 rounded-full"
                                    />
                                    <span className={getTextClasses(invoice.customerName, "text-xs break-words")} title={invoice.customerName}>
                                      {invoice.customerName}
                                    </span>
                                  </Badge>
                                )
                              } else if (invoice.walkInCustomerName) {
                                // Show walk-in customer name
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1 max-w-full min-w-0">
                                    <User className="w-3 h-3 flex-shrink-0" />
                                    <span className={getTextClasses(invoice.walkInCustomerName, "text-xs break-words")} title={invoice.walkInCustomerName}>
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
                                  // Switching to credit must clear the cash-default paidAmount/balance
                                  // (mirrors updateInvoiceType) — items added before a customer is
                                  // picked default to type 'cash', which forces paidAmount = total;
                                  // left uncorrected, the invoice saves as fully paid/cash-equivalent.
                                  paidAmount: 0,
                                  balance: prev.total,
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
                                    {customer.isSupplierAccount ? (
                                      <Badge variant="outline" className="flex items-center gap-1 shrink-0 px-1.5 py-0 text-[10px] font-normal">
                                        <Truck className="h-2.5 w-2.5" />
                                        {t('Supplier')}
                                      </Badge>
                                    ) : null}
                                    {showUrdu && customer.nameUrdu?.trim() ? (
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
            <Label htmlFor="invoiceDate">{t('invoice_date') || 'Invoice Date'}</Label>
            <Input
              ref={invoiceDateRef}
              type="date"
              value={invoice.invoiceDate || new Date().toISOString().split('T')[0]}
              onChange={(e) => setInvoice(prev => ({ ...prev, invoiceDate: e.target.value }))}
              onKeyDown={(e) => onEnterAdvance(e, openProductSelectorForEntry)}
            />
          </div>
          </div>

          {isEditing && editingInvoice?.invoiceNumber && (
            <div>
              <Label>{t('invoice_number') || 'Invoice No.'}</Label>
              <div className='flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm'>
                <span className='truncate font-medium' title={editingInvoice.invoiceNumber}>
                  {editingInvoice.invoiceNumber}
                </span>
              </div>
            </div>
          )}

          {showProductCatalog ? (
            <>
              {/* Catalog-shown layout only: Invoice Type takes the left half of the row
                  (smaller icons/text, all 4 options in one row) paired with Salesman on
                  the right half, instead of Invoice Type spanning the full row on its
                  own. Customer Name is dropped entirely here per request — the Customer
                  field above already carries that. Catalog-hidden mode keeps its own
                  unchanged copy of both blocks below. */}
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <Label className='mb-2 block'>{t('invoice_type')}</Label>
                  <div className='grid grid-cols-4 gap-1'>
                    {(
                      [
                        { value: 'cash', label: t('cash'), icon: Banknote },
                        { value: 'credit', label: t('credit'), icon: CreditCard },
                        { value: 'pending', label: t('pending'), icon: Truck },
                        { value: 'quotation', label: t('quotation') || 'Quotation', icon: FileCheck },
                      ] as const
                    ).map(({ value, label, icon: Icon }) => {
                      const disabled = (value === 'credit' || value === 'pending') && invoice.customerId === 'walk-in'
                      const active = invoice.type === value
                      const styles = INVOICE_TYPE_STYLES[value]
                      return (
                        <button
                          key={value}
                          type='button'
                          ref={value === 'cash' ? invoiceTypeTriggerRef : undefined}
                          disabled={disabled}
                          onClick={() => updateInvoiceType(value)}
                          onKeyDown={(e) => onEnterAdvance(e, focusInvoiceDate)}
                          className={cn(
                            'flex flex-col items-center gap-0.5 rounded-lg border px-0.5 py-1.5 text-[9px] font-medium leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                            active
                              ? styles.active
                              : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          <Icon className={cn('h-3 w-3', active && styles.icon)} />
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {salesmanOptions.length > 0 && (
                  <div>
                    <Label htmlFor="salesmanId">{t('salesman') || 'Salesman'}</Label>
                    <SearchableSelect
                      id="salesmanId"
                      options={salesmanOptions}
                      value={invoice.salesmanId || ''}
                      onValueChange={(value) => setInvoice(prev => ({ ...prev, salesmanId: value }))}
                      placeholder={t('select_salesman') || 'Select a salesman...'}
                      clearLabel={t('none') || 'None'}
                    />
                  </div>
                )}
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
            </>
          ) : (
            <>
              {/* Invoice Type — segmented buttons instead of a dropdown so the current
                  selection (and which types are off-limits for a walk-in customer) is
                  visible at a glance. Same updateInvoiceType/disabled rules as the old
                  Select; Enter on the first button still jumps to Invoice Date
                  (focusInvoiceType/focusInvoiceDate below), matching the previous
                  keyboard flow. */}
              <div>
                <Label className='mb-2 block'>{t('invoice_type')}</Label>
                <div className='grid grid-cols-4 gap-1.5 sm:gap-2'>
                  {(
                    [
                      { value: 'cash', label: t('cash'), icon: Banknote },
                      { value: 'credit', label: t('credit'), icon: CreditCard },
                      { value: 'pending', label: t('pending'), icon: Truck },
                      { value: 'quotation', label: t('quotation') || 'Quotation', icon: FileCheck },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => {
                    // Disable credit and pending for walk-in customers
                    const disabled = (value === 'credit' || value === 'pending') && invoice.customerId === 'walk-in'
                    const active = invoice.type === value
                    const styles = INVOICE_TYPE_STYLES[value]
                    return (
                      <button
                        key={value}
                        type='button'
                        ref={value === 'cash' ? invoiceTypeTriggerRef : undefined}
                        disabled={disabled}
                        onClick={() => updateInvoiceType(value)}
                        onKeyDown={(e) => onEnterAdvance(e, focusInvoiceDate)}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:px-2 sm:py-2.5 sm:text-xs',
                          active
                            ? styles.active
                            : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <Icon className={cn('h-4 w-4', active && styles.icon)} />
                        <span className='truncate'>{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Salesman (+ Received By, when pending) — each its own full-width row in
                  catalog-hidden mode; the narrow 3-column page doesn't have room to pair
                  them the way catalog-shown mode does above. */}
              <div className='grid gap-4'>
                {salesmanOptions.length > 0 && (
                  <div>
                    <Label htmlFor="salesmanId">{t('salesman') || 'Salesman'}</Label>
                    <SearchableSelect
                      id="salesmanId"
                      options={salesmanOptions}
                      value={invoice.salesmanId || ''}
                      onValueChange={(value) => setInvoice(prev => ({ ...prev, salesmanId: value }))}
                      placeholder={t('select_salesman') || 'Select a salesman...'}
                      clearLabel={t('none') || 'None'}
                    />
                  </div>
                )}

                {/* Free-text name for walk-in sales only — a linked customer already has a
                    real name on their record (print pulls from there instead; see
                    formatPrintCustomerCell in print-utils.ts), so editing it here would
                    look like it does something without actually touching that record.
                    walkInCustomerName already flows through save/load and every print
                    path (thermal, A4, WhatsApp, SMS) — this is just the missing input for
                    it. */}
                {invoice.customerId === 'walk-in' && (
                  <div>
                    <Label htmlFor="walkInCustomerName">{t('customer_name') || 'Customer Name'}</Label>
                    <SmartInput
                      id="walkInCustomerName"
                      placeholder={t('enter_customer_name_for_print') || 'Name to show on the printed receipt'}
                      value={invoice.walkInCustomerName || ''}
                      onChange={(e) => setInvoice(prev => ({ ...prev, walkInCustomerName: e.target.value }))}
                      showVoiceInput={true}
                      voiceInputSize="sm"
                      className="w-full"
                    />
                  </div>
                )}

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
              </div>
            </>
          )}
        </CardContent>
      </Card>

      </div>

      {/* Column 2 (compact mode): at-a-glance stats + Invoice Items. Spans both tracks of
          the md-tier 2-col grid (Details | Summary+Payment sit above it in row 1) so it
          always runs full width; reverts to its own single track at xl once Details and
          Summary+Payment split back out into separate side columns. */}
      <div className={cn('min-w-0 space-y-4', !showProductCatalog && 'md:col-start-1 md:row-start-2 md:col-span-2 xl:row-start-1 xl:col-span-1 xl:col-start-2')}>
      {/* At-a-glance totals strip — same numbers as the Summary card below, surfaced here
          too so they're visible while scanning the items table itself. Purely derived from
          invoice state already computed elsewhere; no new totals logic. Hidden once the
          catalog is showing: Column 2 and Column 3 both stack into the same left-hand
          column there (see index.tsx), so the Summary card ends up just a bit further down
          the same column and this strip would only be repeating those numbers a second
          time above it. Also hidden below sm (phone widths) — 5 cards in one line has no
          room to breathe that narrow and the Summary card right above (in the md-tier
          pairing) already covers the same numbers in full. */}
      {!showProductCatalog && (
        <div className='hidden grid-cols-5 gap-2 sm:grid'>
          {[
            { label: t('items') || 'Items', value: String(invoice.items.filter((i) => i.productId && i.name).length) },
            { label: t('subtotal'), value: `Rs${invoice.subtotal.toFixed(2)}` },
            { label: t('discount'), value: `Rs${(invoice.discount + invoice.items.reduce((sum, i) => sum + (i.discountAmount || 0), 0)).toFixed(2)}` },
            { label: t('tax'), value: `Rs${invoice.tax.toFixed(2)}` },
            { label: t('total_amount') || t('total'), value: `Rs${invoice.total.toFixed(2)}`, highlight: true },
          ].map((stat) => (
            <div
              key={stat.label}
              className={cn(
                'min-w-0 rounded-lg border px-2 py-1.5',
                stat.highlight ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' : 'bg-card',
              )}
            >
              <p className='truncate text-[10px] text-muted-foreground'>{stat.label}</p>
              <p className={cn('truncate text-sm font-bold tabular-nums', stat.highlight && 'text-emerald-700 dark:text-emerald-400')}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Invoice Items — middle column (compact mode): sits beside the details+payment
          stack, spanning both its rows so it runs the full height. */}
      <Card className='min-w-0'>
        <CardHeader className='py-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <CardTitle className='text-base'>{t('invoice_items')} ({invoice.items.length})</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {onBarcodeSearch ? (
                <Popover
                  open={scanBarcodeOpen}
                  onOpenChange={(open) => {
                    setScanBarcodeOpen(open)
                    if (!open) setScanBarcodeValue('')
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button type='button' size='sm' variant='outline' className='flex items-center gap-1'>
                      <ScanBarcode className='h-4 w-4' />
                      <span className='hidden sm:inline'>{t('scan_barcode') || 'Scan Barcode'}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className='w-64 p-3' align='end'>
                    <Label className='mb-1.5 block text-xs'>{t('Scan or type a barcode, then press Enter')}</Label>
                    <Input
                      autoFocus
                      value={scanBarcodeValue}
                      onChange={(e) => setScanBarcodeValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && scanBarcodeValue.trim()) {
                          onBarcodeSearch(scanBarcodeValue.trim())
                          setScanBarcodeValue('')
                          setScanBarcodeOpen(false)
                        }
                      }}
                      placeholder='e.g. 8901030...'
                    />
                  </PopoverContent>
                </Popover>
              ) : null}
              {invoice.items.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={toggleAllDiscountTypes}
                  className="flex items-center gap-1"
                  title="Switch every discount (all items + overall) to this unit at once"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('Switch All Discounts to')}</span>
                  <span className="sm:hidden">{t('Switch to')}</span>
                  {' '}{invoice.discountType === 'percentage' ? 'Rs' : '%'}
                </Button>
              )}
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
        <CardContent ref={itemsAreaRef} className='flex flex-1 flex-col p-0 lg:min-h-0'>
          {/* Capped + internally scrollable regardless of table vs. stacked-card layout —
              without max-h here, the card layout (catalog-visible/phone/narrow) grew with
              the item count and pushed Payment & Amount off screen, forcing a full-page
              scroll through every item just to reach Save. */}
          <div
            ref={itemsScrollRef}
            className={cn(
              'overflow-y-auto max-h-[460px]',
              (showProductCatalog || isPhone || isItemsAreaNarrow) ? 'space-y-2 p-3' : 'overflow-x-auto',
            )}
          >
            {invoice.items.length === 0 ? (
              <div className='text-center text-muted-foreground py-8'>
                {t('no_items_added')}
              </div>
            ) : showProductCatalog || isPhone || isItemsAreaNarrow ? (
              // Catalog-visible mode, catalog-hidden on a phone (<sm/640px), or the item
              // area's rendered width is too narrow for the table's fixed columns (see
              // isItemsAreaNarrow above): items render as stacked cards instead of a table.
              // Catalog mode: this column runs narrower (the Product Catalog panel takes the
              // other half of the screen), so a 7-column table doesn't have room to breathe.
              // Phone/narrow: the fixed-width table below has no room to breathe either, so
              // name and qty/price/discount/total move onto their own line instead of
              // fighting for space in one row. Gated on JS boolean values, not a CSS
              // breakpoint class — this and the table branch below are mutually exclusive, so
              // only one copy of each row's interactive controls (Popover triggers, input
              // refs) ever mounts. Rendering both and hiding one with `sm:hidden`/`hidden
              // sm:block` doubled up every row under the same item-id key and broke things
              // like the product picker popover.
              invoice.items.map((item) => renderItemCard(item))
            ) : (
              <Table className='table-fixed'>
                  <colgroup>
                    <col className='w-10' />
                    <col />
                    {/* Qty/Price/Discount/Total run narrower from sm up to (not including) xl —
                        tablet's Items column is full-width (not squeezed into a fixed 3-col
                        track like desktop's), but these four still leave Product almost no
                        room at their desktop size. At xl the table also horizontally scrolls
                        inside its narrower track anyway, so the original wider sizing there is
                        unchanged. */}
                    <col className='w-[140px] xl:w-[184px]' />
                    <col className='w-[100px] xl:w-[150px]' />
                    {/* Discount's input shrank to fit its actual content (small number + a
                        Rs/% toggle) — its column no longer needs 150px, so the extra space
                        reverts to Product (the unlabeled `<col />` above, which soaks up
                        whatever's left in this table-fixed layout). */}
                    <col className='w-[85px] xl:w-[100px]' />
                    <col className='w-[85px] xl:w-[110px]' />
                    <col className='w-16' />
                  </colgroup>
                  <TableHeader className='sticky top-0 z-10 bg-muted'>
                    <TableRow className='hover:bg-transparent'>
                      <TableHead className='w-10 pl-4'>#</TableHead>
                      <TableHead className='min-w-[160px]'>{t('product') || 'Product'}</TableHead>
                      <TableHead className='min-w-[140px] xl:min-w-[150px]'>{t('Qty')}</TableHead>
                      <TableHead className='min-w-[100px] xl:min-w-[130px]'>{t('unit_price') || 'Unit Price'}</TableHead>
                      <TableHead className='min-w-[85px] xl:min-w-[100px]'>{t('discount') || 'Discount'}</TableHead>
                      <TableHead className='min-w-[85px] xl:min-w-[100px] text-right'>{t('total') || 'Total'}</TableHead>
                      <TableHead className='w-16 pr-3' />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.items.map((item, itemIndex) => {
                      // A line split across multiple batches needs the BatchAllocationEditor's
                      // per-batch tag list, which runs taller than a single table row can hold
                      // gracefully — cramming the qty/price/discount/total cells beside it
                      // left them vertically stranded next to a much taller product cell. These
                      // rows get the card layout instead (name+tags on top, controls wrapped
                      // onto their own line below), spanning every column; regular single-batch
                      // rows keep the compact table row.
                      const isSplitAcrossBatches = !!(item.batchAllocations && item.batchAllocations.length > 1)
                      if (isSplitAcrossBatches) {
                        return (
                          <TableRow key={item.id} className='hover:bg-transparent'>
                            <TableCell colSpan={7} className='p-2'>
                              {renderItemCard(item)}
                            </TableCell>
                          </TableRow>
                        )
                      }
                      const { hasProduct, productCell, qtyControl, priceControl, discountControl, totalDisplay, deleteButton, historyButton } = renderInvoiceItemParts(item)
                      return (
                        <TableRow key={item.id} className={cn(!hasProduct && 'bg-muted/10')}>
                          <TableCell className='py-3 pl-4 align-top text-xs text-muted-foreground'>{itemIndex + 1}</TableCell>
                          <TableCell className='whitespace-normal py-2.5 align-top'>{productCell}</TableCell>
                          <TableCell className='align-middle py-3'>{qtyControl}</TableCell>
                          <TableCell className='align-middle py-3'>{priceControl}</TableCell>
                          <TableCell className='align-middle py-3'>{discountControl}</TableCell>
                          <TableCell className='align-middle py-3 text-right'>{totalDisplay}</TableCell>
                          <TableCell className='py-3 pr-3 align-middle'>
                            <div className='flex items-center justify-end gap-0.5'>
                              {historyButton}
                              {deleteButton}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
            )}
          </div>

          {/* Apply Discount / Add Tax — the one place the overall (whole-invoice) discount
              and tax rate are edited; both feed the Summary card's totals directly. */}
          <div className='flex flex-wrap items-center gap-2 border-t p-3'>
            <Popover open={applyDiscountOpen} onOpenChange={setApplyDiscountOpen}>
              <PopoverTrigger asChild>
                <Button type='button' variant='outline' size='sm' className='gap-1.5'>
                  <Percent className='h-4 w-4' />
                  {t('Apply Discount')}
                  {invoice.discount > 0 && (
                    <Badge variant='secondary' className='ml-1 tabular-nums'>-Rs{invoice.discount.toFixed(2)}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-64 p-3' align='start'>
                <Label className='mb-2 block text-xs'>{t('discount') || 'Discount'}</Label>
                <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                  <Input
                    type='text'
                    inputMode='decimal'
                    showVoiceInput={false}
                    value={invoice.discountValue || ''}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder='0'
                    className='h-9 flex-1 border-0 text-right text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                  />
                  <button
                    type='button'
                    onClick={() => updateDiscount({ type: invoice.discountType === 'percentage' ? 'fixed' : 'percentage' })}
                    title='Click to switch between Rs and % discount'
                    className='px-3 h-9 flex items-center text-xs text-muted-foreground bg-muted border-l font-medium select-none cursor-pointer hover:bg-primary hover:text-primary-foreground active:scale-95 transition-colors'
                  >
                    {invoice.discountType === 'percentage' ? '%' : 'Rs'}
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            <Popover open={addTaxOpen} onOpenChange={setAddTaxOpen}>
              <PopoverTrigger asChild>
                <Button type='button' variant='outline' size='sm' className='gap-1.5'>
                  <Receipt className='h-4 w-4' />
                  {t('Add Tax')}
                  {taxRate > 0 && (
                    <Badge variant='secondary' className='ml-1 tabular-nums'>{taxRate}%</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-56 p-3' align='start'>
                <Label className='mb-2 block text-xs'>{t('tax_rate')} (%)</Label>
                <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                  <Input
                    type='text'
                    inputMode='decimal'
                    showVoiceInput={false}
                    value={taxRateInput}
                    onChange={(e) => {
                      const raw = e.target.value
                      setTaxRateInput(raw)
                      setTaxRate(Math.max(0, Math.min(100, parseFloat(raw) || 0)))
                    }}
                    onFocus={(e) => e.target.select()}
                    placeholder='0'
                    className='h-9 flex-1 border-0 text-right text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                  />
                  <span className='px-3 h-9 flex items-center text-xs text-muted-foreground bg-muted border-l font-medium select-none'>%</span>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Column 3 (compact mode): Summary, Payment & Amount. Sits beside Invoice Details
          in row 1 of the md-tier 2-col grid (md:col-start-2); at xl it moves out to its
          own third track via xl:col-start-3, same as before. */}
      <div className={cn('space-y-4', !showProductCatalog && 'md:col-start-2 md:row-start-1 xl:row-start-1 xl:col-start-3')}>
      {/* Summary — the same totals shown in the stats strip above the items table, laid
          out as a running receipt-style breakdown. Discount and tax are now edited from
          the items table's footer ("Apply Discount"/"Add Tax" popovers) rather than here,
          so this card is read-only. */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Receipt className='h-4 w-4 text-muted-foreground' />
            {t('Summary')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-2 pt-0'>
          <div className='flex justify-between gap-6'>
            <span className='text-muted-foreground'>{t('subtotal')}:</span>
            <span className='tabular-nums font-medium'>Rs{invoice.subtotal.toFixed(2)}</span>
          </div>
          {(() => {
            const itemDiscountTotal = invoice.items.reduce((sum, item) => sum + (item.discountAmount || 0), 0)
            return itemDiscountTotal > 0 ? (
              <div className='flex justify-between gap-6 text-sm text-green-600'>
                <span>{t('Item Discounts')}:</span>
                <span className='tabular-nums'>-Rs{itemDiscountTotal.toFixed(2)}</span>
              </div>
            ) : null
          })()}
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
          {(() => {
            const itemDiscountTotal = invoice.items.reduce((sum, item) => sum + (item.discountAmount || 0), 0)
            const totalSaved = itemDiscountTotal + invoice.discount
            return totalSaved > 0 ? (
              <div className='flex justify-between gap-6 text-xs font-medium text-green-600'>
                <span>{t('You Saved')}:</span>
                <span className='tabular-nums'>Rs{totalSaved.toFixed(2)}</span>
              </div>
            ) : null
          })()}

          {/* Profit Display */}
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

          <Separator />
          {/* Type + Total Items + Total Quantity as one row of tags instead of a badge
              plus two separate label/value rows underneath — same info, less height. */}
          <div className='flex flex-wrap items-center gap-1.5'>
            <Badge className={getTypeColor(invoice.type)}>
              {t(invoice.type)}
            </Badge>
            <Badge variant='secondary' className='gap-1 tabular-nums'>
              {t('Total Items')}: {invoice.items.filter((i) => i.productId && i.name).length}
            </Badge>
            <Badge variant='secondary' className='gap-1 tabular-nums'>
              {t('total_quantity') || 'Total Qty'}: {invoice.items.reduce((sum, i) => sum + (i.productId && i.name ? i.quantity : 0), 0)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Payment & Amount — right column (compact mode), below the Summary card */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Banknote className='h-4 w-4 text-muted-foreground' />
            {t('Payment & Amount')}
          </CardTitle>
        </CardHeader>
        <CardContent className='p-4 pt-0 space-y-4'>
          {/* Payment Details */}
          <div className='space-y-4'>
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
                        setInvoice(prev => ({
                          ...prev,
                          paymentMethod: 'wallet',
                          walletType: getWalletTypeFromOptionValue(val),
                          // The split leg's bucket is derived from this field — stale once it changes.
                          splitPaymentMethod: undefined,
                          splitWalletType: undefined,
                          splitPaidAmount: 0,
                        }))
                      } else {
                        setInvoice(prev => ({
                          ...prev,
                          paymentMethod: val as 'cash',
                          walletType: undefined,
                          splitPaymentMethod: undefined,
                          splitWalletType: undefined,
                          splitPaidAmount: 0,
                        }))
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

            {invoice.type !== 'pending' && invoice.type !== 'quotation' && (invoice.type === 'credit' || (invoice.type === 'cash' && invoice.splitPaymentMethod)) && (
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

            {SHOW_INVOICE_PAYMENT_METHOD_UI && invoice.type !== 'pending' && invoice.type !== 'quotation' && (
              <SplitPaymentFields
                primaryMethod={invoice.paymentMethod === 'wallet' ? 'wallet' : 'cash'}
                wallets={wallets}
                paidAmount={invoice.paidAmount || 0}
                showBalance={false}
                value={{
                  splitPaymentMethod: invoice.splitPaymentMethod,
                  splitWalletType: invoice.splitWalletType,
                  splitPaidAmount: invoice.splitPaidAmount,
                }}
                onChange={(patch) => setInvoice(prev => ({ ...prev, ...patch }))}
              />
            )}

            {/* Cash Received & Change Calculator — brought back for catalog-shown mode
                only, per request; the compact catalog-hidden layout dropped it earlier in
                favor of editing Paid Amount directly. Only for pure-cash payments, and
                hidden once splitting is on: "amount given by customer" no longer means the
                whole total was cash, so the change math would be wrong. */}
            {showProductCatalog && invoice.type !== 'pending' && invoice.type !== 'quotation' && invoice.type === 'cash' && (!invoice.paymentMethod || invoice.paymentMethod === 'cash') && !invoice.splitPaymentMethod && (
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

            {/* Customer Balance Display - After Payment Details */}
            {invoice.customerId && invoice.customerId !== 'walk-in' && (
              <>
                <Separator className="my-2" />
                <div className='space-y-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg'>
                  {customers.find((c) => (c._id || c.id) === invoice.customerId)?.isSupplierAccount ? (
                    <p className="text-xs text-muted-foreground -mt-1 mb-1">
                      {t('Net balance with this supplier — includes purchases and sales combined')}
                    </p>
                  ) : null}
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
                  {totalPaidNow > 0 && (
                    <div className='flex justify-between items-center text-sm'>
                      <span className="font-medium">{t('Paid Now')}:</span>
                      <span className="font-bold text-green-600">-Rs{totalPaidNow.toFixed(2)} (Cr)</span>
                    </div>
                  )}
                  <Separator />
                  <div className='flex justify-between items-center'>
                    <span className="font-bold">{t('Net Balance')}:</span>
                    <span className={`font-bold text-lg ${(customerBalance + invoice.total - totalPaidNow) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      Rs{Math.abs(customerBalance + invoice.total - totalPaidNow).toFixed(2)} {(customerBalance + invoice.total - totalPaidNow) > 0 ? '(Receivable)' : '(Payable)'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

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
            {/* Compact mode (catalog hidden): the sticky bar below is the buttons row —
                these full-size duplicates would just repeat it right above. */}
            {showProductCatalog && (
              <>
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
              </>
            )}

            {/* Send After Save selector — pending-only: it's a goods-handoff receipt
                (see isPendingHandoff in handleSaveInvoice), not a general notifier, so
                it stays out of the way for cash/credit/quotation invoices entirely. */}
            {invoice.type === 'pending' && (
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
                {/* Icon-only — labels made this row overflow the 300px sidebar column (see
                    git history), and four short-word buttons read fine as icons + a
                    tooltip once each icon is visually distinct from the others. */}
                <div className='flex gap-1'>
                  <Button
                    type='button'
                    size='sm'
                    variant={sendMethod === 'none' ? 'default' : 'outline'}
                    title="None — don't send anything"
                    className='h-8 flex-1 px-0'
                    onClick={() => {
                      setSendMethod('none')
                      localStorage.setItem('invoiceSendMethod', 'none')
                    }}
                  >
                    <Ban className='h-3.5 w-3.5' />
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant={sendMethod === 'sms' ? 'default' : 'outline'}
                    title='SMS'
                    className={cn('h-8 flex-1 px-0', sendMethod === 'sms' && 'bg-blue-600 hover:bg-blue-700 border-blue-600')}
                    onClick={() => {
                      setSendMethod('sms')
                      localStorage.setItem('invoiceSendMethod', 'sms')
                    }}
                  >
                    <MessageSquare className='h-3.5 w-3.5' />
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant={sendMethod === 'whatsapp' ? 'default' : 'outline'}
                    title='WhatsApp'
                    className={cn('h-8 flex-1 px-0', sendMethod === 'whatsapp' && 'border-[#25d366]')}
                    style={sendMethod === 'whatsapp' ? { backgroundColor: '#25d366', borderColor: '#25d366' } : {}}
                    onClick={() => {
                      setSendMethod('whatsapp')
                      localStorage.setItem('invoiceSendMethod', 'whatsapp')
                    }}
                  >
                    <Send className='h-3.5 w-3.5' />
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant={sendMethod === 'both' ? 'default' : 'outline'}
                    title='Both — SMS and WhatsApp'
                    className={cn('h-8 flex-1 gap-0.5 px-0', sendMethod === 'both' && 'bg-purple-600 hover:bg-purple-700 border-purple-600')}
                    onClick={() => {
                      setSendMethod('both')
                      localStorage.setItem('invoiceSendMethod', 'both')
                    }}
                  >
                    <MessageSquare className='h-3.5 w-3.5' />
                    <Send className='h-3.5 w-3.5' />
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
            )}
          </div>
        </CardContent>
      </Card>

      </div>

      {/* Fast-invoicing header actions — catalog hidden means the panel is a multi-column
          layout; the primary actions are always reachable without scrolling, same idea as
          the Fast Billing checkout panel. The full Save/Print controls in the Payment &
          Amount card above still work as usual (catalog-visible mode only). Portaled into a
          slot the page places in its header (see index.tsx) — a plain `position: sticky`
          bar only shows once you've scrolled far enough for it, which isn't "always
          visible" when the cards column alone is taller than the viewport. Falls back to
          rendering inline (with its own sticky positioning) until that slot exists. */}
      {!showProductCatalog && (() => {
        const disabled = !invoice.customerId || invoice.items.length === 0 || savingType !== null
        const bar = (
          <div className='flex flex-wrap items-center gap-2'>
            <Button type='button' onClick={previewInvoice} size='sm' variant='ghost' disabled={invoice.items.length === 0} className='gap-1.5'>
              <Eye className='h-4 w-4' />
              {t('Preview')}
            </Button>
            <Button
              type='button'
              onClick={() => handleSaveInvoice('none')}
              size='sm'
              variant='outline'
              disabled={disabled}
              className='gap-1.5'
            >
              {savingType === 'none' ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <Save className='h-4 w-4' />
              )}
              {isEditing ? t('update_invoice') : t('Save Invoice')}
            </Button>
            <PrintFormatButton
              onPrint={(paperSize) => handleSaveInvoice(paperSize)}
              defaultPaperSize={defaultPaperSize}
              allowedFormats={['thermal80', 'thermal58', 'a4', 'a5', 'a4-half-left', 'a4-half-right']}
              size='sm'
              variant='default'
              disabled={disabled}
              mainButtonClassName='bg-emerald-600 hover:bg-emerald-700'
              mainButtonContent={
                savingType !== null && savingType !== 'none' ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <>
                    <Printer className='h-4 w-4' />
                    <span className='ml-1.5'>{isEditing ? t('update_and_print_receipt') : t('Save & Print Invoice')}</span>
                  </>
                )
              }
            />
          </div>
        )
        if (stickyActionsContainer) return createPortal(bar, stickyActionsContainer)
        // No header slot yet — fall back to a floating bottom bar (with item count/total
        // for context, since it's not sitting next to the page title in this fallback).
        return (
          <div className='sticky bottom-3 z-20 md:col-start-1 md:col-span-2 xl:col-start-1 xl:col-span-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 p-3 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/90'>
            <div className='flex items-baseline gap-2 pl-1'>
              <span className='text-xs text-muted-foreground'>
                {invoice.items.filter((i) => i.productId && i.name).length} {t('invoice_items')}
              </span>
              <span className='text-lg font-bold tabular-nums'>Rs{invoice.total.toFixed(2)}</span>
            </div>
            {bar}
          </div>
        )
      })()}

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

      {invoice.customerId && invoice.customerId !== 'walk-in' && (
        <ProductHistoryDialog
          open={historyDialog.open}
          onOpenChange={(open) => setHistoryDialog((prev) => ({ ...prev, open }))}
          customerId={invoice.customerId}
          productId={historyDialog.productId}
          productName={historyDialog.productName}
          customerName={invoice.customerName || ''}
          currentPrice={historyDialog.currentPrice}
        />
      )}

      {(() => {
        const dialogItem = invoice.items.find((i) => i.id === serialDialogItemId)
        if (!dialogItem) return null
        const dialogProduct = products.find((p: any) => (p._id || p.id) === dialogItem.productId)

        if (isUsedPhonesBucketProduct(dialogProduct)) {
          return (
            <UsedPhoneSelectDialog
              open={!!serialDialogItemId}
              onOpenChange={(open) => setSerialDialogItemId(open ? serialDialogItemId : '')}
              onSelect={(buyback) => selectUsedPhoneForItem(dialogItem.id, buyback)}
            />
          )
        }

        return (
          <SerialNumberDialog
            open={!!serialDialogItemId}
            onOpenChange={(open) => setSerialDialogItemId(open ? serialDialogItemId : '')}
            productId={dialogItem.productId}
            batchId={dialogItem.batchId}
            batchIds={dialogItem.batchAllocations?.map((a) => a.batchId)}
            itemName={dialogItem.name}
            quantity={dialogItem.quantity}
            selected={dialogItem.imeis || []}
            isSerial={!!dialogProduct?.trackSerial}
            onChange={(next, records) => updateItemImeis(dialogItem.id, next, records)}
            onComplete={addNewRowAndOpenProduct}
          />
        )
      })()}

    </div>
  )
}
