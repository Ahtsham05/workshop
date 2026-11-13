import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Minus,
  Plus,
  Trash2,
  Search,
  ChevronDown,
  Check,
  X,
  Loader2,
  Save,
  Printer,
  Package,
  Receipt,
  Banknote,
  Landmark,
  Scale,
  Truck,
  PackageSearch,
  FileText,
  RotateCcw,
  TriangleAlert,
  ScanLine,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import { DockedFooter } from '@/components/docked-footer'
import { WarehouseField, useWarehousePicker } from '@/components/warehouse-field'
import { useGetPurchasesQuery } from '@/stores/purchase.api'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import {
  useCreatePurchaseReturnMutation,
  useGetPurchaseReturnsQuery,
  useGetSalesReturnsQuery,
  type PurchaseReturnPayload,
  type SalesReturn,
} from '@/stores/returns.api'
import { fetchAllSuppliers } from '@/stores/supplier.slice'
import type { AppDispatch, RootState } from '@/stores/store'
import { useFormatMoney } from '@/lib/format-money'
import { getBusinessToday, formatBusinessDate } from '@/lib/business-timezone'
import { useInvoiceSaveShortcuts } from '@/lib/invoice-form-keyboard'
import { useIsPhone } from '@/hooks/use-mobile'
import { filterAndRankBySearch } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
import { usePurchaseReturnPrinter } from '../lib/use-purchase-return-printer'

// ─── Types ──────────────────────────────────────────────────────────────────────

type Source = 'direct' | 'customerReturn'
type RefundMethod = 'adjustment' | 'cash' | 'bank'

interface SupplierLite {
  id: string
  name: string
  phone?: string
  nameUrdu?: string
  picture?: { url?: string } | null
}

/** One row of the return. Quantities are in the line's own unit (the purchase line's
 *  unit when it came from an invoice, else the product's default unit). */
interface ReturnLine {
  key: string
  productId: string
  variantId?: string
  name: string
  barcode?: string
  unit?: string
  conversionFactor?: number
  quantity: number
  costPrice: number
  /** Most that may go back: invoice remaining / customer-return qty. null = no cap. */
  max: number | null
  /** Invoice lines only — what was bought and what earlier returns already sent back. */
  purchased?: number
  returned?: number
}

interface PurchaseReturnFormProps {
  onBack: () => void
  onSuccess: () => void
  prefillSalesReturn?: SalesReturn | null
}

const QUICK_REASONS = ['Damaged', 'Expired', 'Wrong item', 'Excess quantity', 'Quality issue', 'Short expiry']

const REFUND_OPTIONS: Array<{ value: RefundMethod; label: string; hint: string; icon: typeof Scale }> = [
  { value: 'adjustment', label: 'Adjust Balance', hint: 'Reduces what you owe this supplier.', icon: Scale },
  { value: 'cash', label: 'Cash Refund', hint: 'Supplier pays the amount back in cash.', icon: Banknote },
  { value: 'bank', label: 'Bank Refund', hint: 'Supplier pays the amount back to your bank.', icon: Landmark },
]

const MAX_SEARCH_RESULTS = 50
const EMPTY_CATALOG: PurchaseCatalogItem[] = []

const idOf = (value: unknown): string => {
  if (!value) return ''
  if (typeof value === 'string') return value
  const v = value as { id?: string; _id?: string }
  return String(v.id || v._id || '')
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const toSupplierLite = (s: any): SupplierLite | null => {
  const id = idOf(s)
  if (!id) return null
  return { id, name: s.name || 'Supplier', phone: s.phone, nameUrdu: s.nameUrdu, picture: s.picture }
}

/**
 * Turns a saved purchase into return rows: one row per product (+variant), the price being
 * what was actually paid per unit on that line (net of its line discount), and the
 * returnable quantity being what was bought minus what earlier returns already sent back.
 */
function buildInvoiceLines(purchase: any, previousReturns: any[]): ReturnLine[] {
  const returnedStock = new Map<string, number>()
  for (const ret of previousReturns) {
    if (ret.status === 'rejected') continue
    for (const item of ret.items || []) {
      const key = `${idOf(item.productId)}:${idOf(item.variantId)}`
      returnedStock.set(key, (returnedStock.get(key) || 0) + Number(item.stockQuantity ?? item.quantity ?? 0))
    }
  }
  // Earlier returns may predate variant tracking — fall back to a product-only match.
  const returnedByProduct = new Map<string, number>()
  returnedStock.forEach((qty, key) => {
    const pid = key.split(':')[0]
    returnedByProduct.set(pid, (returnedByProduct.get(pid) || 0) + qty)
  })

  const merged = new Map<string, ReturnLine & { stockBought: number; spent: number }>()
  for (const line of purchase?.items || []) {
    const productId = idOf(line.product)
    if (!productId) continue
    const variantId = idOf(line.variantId) || undefined
    const key = `${productId}:${variantId || ''}`
    const qty = Number(line.quantity || 0)
    const cf = Number(line.conversionFactor || 1) || 1
    const stockQty = Number(line.stockQuantity ?? qty * cf)
    const lineTotal = Number(line.total ?? qty * Number(line.priceAtPurchase || 0))
    const existing = merged.get(key)
    if (existing) {
      existing.purchased = (existing.purchased || 0) + qty
      existing.stockBought += stockQty
      existing.spent += lineTotal
    } else {
      merged.set(key, {
        key,
        productId,
        variantId,
        name: line.product?.name || line.name || 'Product',
        barcode: line.product?.barcode,
        unit: line.unit,
        conversionFactor: cf,
        quantity: 0,
        costPrice: 0,
        max: 0,
        purchased: qty,
        returned: 0,
        stockBought: stockQty,
        spent: lineTotal,
      })
    }
  }

  const hasVariantKeys = (pid: string) => [...merged.keys()].filter((k) => k.startsWith(`${pid}:`)).length > 1
  return [...merged.values()].map(({ stockBought, spent, ...row }) => {
    const cf = row.conversionFactor || 1
    const returnedQty =
      returnedStock.get(row.key) ?? (hasVariantKeys(row.productId) ? 0 : returnedByProduct.get(row.productId) || 0)
    const returnedInLineUnits = returnedQty / cf
    const remaining = Math.max(0, Math.floor((stockBought - returnedQty) / cf + 1e-9))
    return {
      ...row,
      returned: Math.round(returnedInLineUnits * 1000) / 1000,
      max: remaining,
      costPrice: row.purchased ? round2(spent / row.purchased) : 0,
    }
  })
}

// ─── Small building blocks ─────────────────────────────────────────────────────

function SectionLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Label className='mb-1.5 block text-xs font-medium text-muted-foreground'>
      {children} {required && <span className='text-destructive'>*</span>}
    </Label>
  )
}

/** A supplier balance: amount, with Payable (you owe them) / Advance (they owe you) under it. */
function BalanceAmount({ value }: { value: number }) {
  const formatMoney = useFormatMoney()
  const tag = value > 0 ? 'Payable' : value < 0 ? 'Advance' : ''
  return (
    <span className='text-right tabular-nums'>
      {formatMoney(Math.abs(value))}
      {tag && <span className='ml-1 text-[10px] font-normal text-muted-foreground'>{tag}</span>}
    </span>
  )
}

function SupplierPicker({
  suppliers,
  value,
  onChange,
  open,
  onOpenChange,
  triggerRef,
}: {
  suppliers: any[]
  value: SupplierLite | null
  onChange: (s: SupplierLite) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerRef?: React.Ref<HTMLButtonElement>
}) {
  const [query, setQuery] = useState('')
  const list = useMemo(
    () => filterAndRankBySearch(suppliers, query, (s: any) => [s.name, s.phone, s.nameUrdu]).slice(0, 100),
    [suppliers, query]
  )
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className={cn(
            'h-auto min-h-10 w-full justify-between py-1.5',
            !value && 'border-destructive/50 bg-destructive/5'
          )}
        >
          <div className='flex min-w-0 flex-1 items-center gap-2'>
            {value ? (
              <>
                <ContactPhotoCell picture={value.picture as any} name={value.name} className='h-7 w-7 shrink-0' />
                <div className='min-w-0 text-left'>
                  <p className='truncate text-sm font-medium'>{value.name}</p>
                  {value.phone && <p className='truncate text-[11px] text-muted-foreground'>{value.phone}</p>}
                </div>
              </>
            ) : (
              <>
                <Search className='h-4 w-4 shrink-0 text-muted-foreground' />
                <span className='truncate text-muted-foreground'>Select supplier…</span>
              </>
            )}
          </div>
          <ChevronDown className='h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[calc(100vw-2rem)] max-w-[400px] p-0' align='start'>
        <Command shouldFilter={false}>
          <CommandInput placeholder='Search suppliers by name or phone…' value={query} onValueChange={setQuery} />
          <CommandList className='max-h-[300px]'>
            <CommandEmpty>No suppliers found.</CommandEmpty>
            <CommandGroup>
              {list.map((s: any) => {
                const lite = toSupplierLite(s)
                if (!lite) return null
                return (
                  <CommandItem
                    key={lite.id}
                    value={lite.id}
                    onSelect={() => {
                      onChange(lite)
                      onOpenChange(false)
                      setQuery('')
                    }}
                    className='flex cursor-pointer items-center gap-3 p-2.5'
                  >
                    <ContactPhotoCell picture={s.picture} name={s.name || ''} className='h-8 w-8 shrink-0' />
                    <div className='min-w-0 flex-1'>
                      <p className='truncate font-medium'>{s.name}</p>
                      {s.phone && <p className='truncate text-xs text-muted-foreground'>{s.phone}</p>}
                    </div>
                    {value?.id === lite.id && <Check className='h-4 w-4 shrink-0 text-primary' />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─── Form ───────────────────────────────────────────────────────────────────────

export default function PurchaseReturnForm({ onBack, onSuccess, prefillSalesReturn }: PurchaseReturnFormProps) {
  const formatMoney = useFormatMoney()
  const dispatch = useDispatch<AppDispatch>()
  const isPhone = useIsPhone()
  const printReturn = usePurchaseReturnPrinter()

  // ── Core state ────────────────────────────────────────────────────────────────
  const [source, setSource] = useState<Source>(prefillSalesReturn ? 'customerReturn' : 'direct')
  const [supplier, setSupplier] = useState<SupplierLite | null>(null)
  const [purchase, setPurchase] = useState<any>(null)
  const [salesReturn, setSalesReturn] = useState<SalesReturn | null>(prefillSalesReturn ?? null)
  const [lines, setLines] = useState<ReturnLine[]>([])
  const [returnDate, setReturnDate] = useState(getBusinessToday())
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('adjustment')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const warehousePicker = useWarehousePicker('any')

  // ── Data ──────────────────────────────────────────────────────────────────────
  const suppliersRedux = useSelector((state: RootState) => state.supplier.data)
  const suppliers: any[] = useMemo(() => (Array.isArray(suppliersRedux) ? suppliersRedux : []), [suppliersRedux])
  useEffect(() => {
    if (!suppliers.length) dispatch(fetchAllSuppliers({}))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Same cached catalog New Purchase searches — usually already in memory, no extra download.
  const { data: catalog = EMPTY_CATALOG, isLoading: catalogLoading } = useGetPurchasableCatalogQuery()
  const catalogByKey = useMemo(() => {
    const map = new Map<string, PurchaseCatalogItem>()
    for (const row of catalog) {
      map.set(`${row.productId}:${row.variantId || ''}`, row)
      if (!map.has(`${row.productId}:`)) map.set(`${row.productId}:`, row)
    }
    return map
  }, [catalog])
  const catalogRowFor = useCallback(
    (line: Pick<ReturnLine, 'productId' | 'variantId'>) =>
      catalogByKey.get(`${line.productId}:${line.variantId || ''}`) || catalogByKey.get(`${line.productId}:`),
    [catalogByKey]
  )

  // Supplier balance (positive = you owe them) — same endpoint New Purchase reads.
  const [supplierBalance, setSupplierBalance] = useState<number | null>(null)
  useEffect(() => {
    if (!supplier) {
      setSupplierBalance(null)
      return
    }
    let cancelled = false
    setSupplierBalance(null)
    Axios.get(`${summery.fetchSupplierBalance.url}/${supplier.id}${summery.fetchSupplierBalance.urlSuffix || ''}`)
      .then((res) => !cancelled && setSupplierBalance(Number(res.data?.balance || 0)))
      .catch(() => !cancelled && setSupplierBalance(0))
    return () => {
      cancelled = true
    }
  }, [supplier])

  // ── Pickers' open state + focus targets ──────────────────────────────────────
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [srOpen, setSrOpen] = useState(false)
  const supplierTriggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Start where the work starts: the supplier (or customer return) picker.
  useEffect(() => {
    const t = setTimeout(() => {
      if (source === 'customerReturn' && !salesReturn) setSrOpen(true)
      else if (!supplier) setSupplierOpen(true)
    }, 150)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const focusSearch = () => setTimeout(() => searchInputRef.current?.focus(), 60)
  const focusQty = (key: string) =>
    setTimeout(() => {
      const el = qtyRefs.current[key]
      el?.focus()
      el?.select()
    }, 60)

  // ── Purchase invoice link ─────────────────────────────────────────────────────
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [debouncedInvoiceQuery, setDebouncedInvoiceQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInvoiceQuery(invoiceQuery.trim()), 300)
    return () => clearTimeout(t)
  }, [invoiceQuery])
  const { data: purchasesData, isFetching: purchasesFetching } = useGetPurchasesQuery(
    {
      limit: 20,
      ...(supplier ? { supplier: supplier.id } : {}),
      ...(debouncedInvoiceQuery ? { search: debouncedInvoiceQuery } : {}),
    },
    { skip: source !== 'direct' || !invoiceOpen }
  )
  const purchaseOptions: any[] = purchasesData?.results || []

  const purchaseId = purchase ? idOf(purchase) : ''
  const { data: previousReturnsData, isFetching: previousReturnsLoading } = useGetPurchaseReturnsQuery(
    { purchaseId, limit: 100 },
    { skip: !purchaseId, refetchOnMountOrArgChange: true }
  )

  // Rebuild the invoice rows once the earlier returns for it are known (keeps typed qty).
  useEffect(() => {
    if (!purchase || previousReturnsLoading) return
    const fresh = buildInvoiceLines(purchase, previousReturnsData?.results || [])
    setLines((prev) => {
      const typed = new Map(prev.map((l) => [l.key, l]))
      return fresh.map((row) => {
        const old = typed.get(row.key)
        return old
          ? { ...row, quantity: Math.min(old.quantity, row.max ?? old.quantity), costPrice: old.costPrice }
          : row
      })
    })
  }, [purchase, previousReturnsData, previousReturnsLoading])

  const selectPurchase = (p: any) => {
    setPurchase(p)
    setLines([])
    setInvoiceOpen(false)
    setInvoiceQuery('')
    const s = toSupplierLite(p.supplier) || (p.supplierId ? toSupplierLite({ id: p.supplierId, name: p.supplierName }) : null)
    if (s && s.id !== supplier?.id) setSupplier(s)
  }

  const unlinkPurchase = () => {
    setPurchase(null)
    setLines([])
    focusSearch()
  }

  // ── Customer return link ─────────────────────────────────────────────────────
  const [srQuery, setSrQuery] = useState('')
  const [debouncedSrQuery, setDebouncedSrQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSrQuery(srQuery.trim()), 300)
    return () => clearTimeout(t)
  }, [srQuery])
  const { data: salesReturnsData, isFetching: srFetching } = useGetSalesReturnsQuery(
    { status: 'approved', convertedToPurchaseReturn: false, search: debouncedSrQuery, limit: 20 },
    { skip: source !== 'customerReturn' || !srOpen }
  )

  const selectSalesReturn = useCallback((sr: SalesReturn) => {
    setSalesReturn(sr)
    setSrOpen(false)
    setSrQuery('')
    setLines(
      sr.items.map((item, i) => ({
        key: `${item.productId}:sr${i}`,
        productId: idOf(item.productId),
        name: item.name,
        quantity: item.quantity,
        max: item.quantity,
        costPrice: 0, // filled from the product's cost below — the sale price is not what the supplier refunds
      }))
    )
  }, [])

  useEffect(() => {
    if (prefillSalesReturn) selectSalesReturn(prefillSalesReturn)
  }, [prefillSalesReturn, selectSalesReturn])

  // Customer-return rows only carry the SALE price; the supplier credits the cost.
  useEffect(() => {
    if (source !== 'customerReturn' || !catalog.length) return
    setLines((prev) =>
      prev.map((line) => {
        if (line.costPrice > 0) return line
        const cost = catalogRowFor(line)?.cost
        return cost ? { ...line, costPrice: cost } : line
      })
    )
  }, [catalog, source, catalogRowFor, salesReturn])

  // ── Source switch ─────────────────────────────────────────────────────────────
  const switchSource = (next: Source) => {
    if (next === source) return
    setSource(next)
    setLines([])
    setPurchase(null)
    setSalesReturn(null)
    if (next === 'customerReturn') setTimeout(() => setSrOpen(true), 80)
    else if (!supplier) setTimeout(() => setSupplierOpen(true), 80)
  }

  const handleSupplierChange = (s: SupplierLite) => {
    const changed = s.id !== supplier?.id
    setSupplier(s)
    if (changed && purchase) {
      setPurchase(null)
      setLines([])
    }
    if (source === 'direct') focusSearch()
  }

  // ── Product search (free lines) ──────────────────────────────────────────────
  const [productQuery, setProductQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const searchResults = useMemo(() => {
    const q = productQuery.trim()
    if (!q) return []
    return filterAndRankBySearch(catalog, q, (p) => [p.name, p.barcode, p.nameUrdu]).slice(0, MAX_SEARCH_RESULTS)
  }, [catalog, productQuery])
  useEffect(() => setActiveIndex(0), [productQuery])

  const addCatalogItem = (row: PurchaseCatalogItem) => {
    const key = `${row.productId}:${row.variantId || ''}`
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key)
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l))
      return [
        ...prev,
        {
          key,
          productId: row.productId,
          variantId: row.variantId,
          name: row.name,
          barcode: row.barcode,
          unit: undefined,
          quantity: 1,
          costPrice: row.cost ?? 0,
          max: null,
        },
      ]
    })
    setProductQuery('')
    setSearchOpen(false)
    focusQty(key)
  }

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSearchOpen(true)
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, searchResults.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const q = productQuery.trim()
      if (!q) return
      // A scanned barcode adds straight away, even before the list has rendered.
      const exact = catalog.find((p) => p.barcode && p.barcode === q)
      const pick = exact || searchResults[activeIndex]
      if (pick) addCatalogItem(pick)
      else toast.error(`No product matches "${q}"`)
    } else if (e.key === 'Escape') {
      setSearchOpen(false)
    }
  }

  // ── Line edits ────────────────────────────────────────────────────────────────
  const setLineQty = (key: string, qty: number) =>
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        const floor = purchase ? 0 : 1
        const capped = l.max != null ? Math.min(qty, l.max) : qty
        return { ...l, quantity: Math.max(floor, Math.round(capped)) }
      })
    )
  const setLineCost = (key: string, cost: number) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, costPrice: Math.max(0, cost) } : l)))
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key))
  const returnAll = () => setLines((prev) => prev.map((l) => ({ ...l, quantity: l.max ?? l.quantity })))
  const clearQuantities = () => setLines((prev) => prev.map((l) => ({ ...l, quantity: 0 })))

  // ── Totals + checks ───────────────────────────────────────────────────────────
  const activeLines = lines.filter((l) => l.quantity > 0)
  const totalQty = activeLines.reduce((s, l) => s + l.quantity, 0)
  const totalAmount = round2(activeLines.reduce((s, l) => s + round2(l.quantity * l.costPrice), 0))

  /** Stock on hand for a row (in the row's unit), when the catalog knows it. */
  const stockFor = (line: ReturnLine): number | null => {
    const row = catalogRowFor(line)
    if (!row) return null
    return Math.floor((row.stockQuantity || 0) / (line.conversionFactor || 1) + 1e-9)
  }
  const stockProblems = activeLines.filter((l) => {
    const stock = stockFor(l)
    return stock != null && l.quantity > stock
  })

  const blockers: string[] = []
  if (!supplier) blockers.push('Select the supplier')
  if (source === 'customerReturn' && !salesReturn) blockers.push('Select the customer return')
  if (!activeLines.length) blockers.push(purchase ? 'Enter a return quantity on at least one item' : 'Add at least one item')
  if (stockProblems.length) blockers.push(`Not enough stock for ${stockProblems.map((l) => l.name).join(', ')}`)

  // ── Save ──────────────────────────────────────────────────────────────────────
  const [createPurchaseReturn, { isLoading: saving }] = useCreatePurchaseReturnMutation()

  const save = async (withPrint: boolean) => {
    if (saving) return
    if (blockers.length) {
      toast.error(blockers[0])
      if (!supplier) setSupplierOpen(true)
      return
    }
    const payloadItems = activeLines.map((l) => ({
      productId: l.productId,
      ...(l.variantId ? { variantId: l.variantId } : {}),
      name: l.name,
      quantity: l.quantity,
      ...(l.unit ? { unit: l.unit } : {}),
      ...(l.conversionFactor && purchase ? { conversionFactor: l.conversionFactor } : {}),
      costPrice: l.costPrice,
      total: round2(l.quantity * l.costPrice),
    }))
    const payload: PurchaseReturnPayload = {
      ...(purchaseId ? { purchaseId } : {}),
      ...(salesReturn ? { salesReturnId: idOf(salesReturn) } : {}),
      supplierId: supplier!.id,
      items: payloadItems,
      totalAmount,
      refundMethod,
      reason: reason.trim(),
      damageDescription: notes.trim(),
      // Today keeps the real time of day (server default); a back-dated return lands at
      // midday Pakistan time so no timezone shift can push it onto the neighbouring day.
      ...(returnDate && returnDate !== getBusinessToday() ? { date: `${returnDate}T12:00:00+05:00` } : {}),
      ...(warehousePicker.visible && warehouseId ? { warehouseId } : {}),
    }

    try {
      const saved = await createPurchaseReturn(payload).unwrap()
      toast.success(`Purchase return ${saved?.returnNumber || ''} saved`.replace('  ', ' '))
      if (withPrint) {
        printReturn({
          returnNumber: saved?.returnNumber,
          date: saved?.date || returnDate,
          supplierName: supplier!.name,
          supplierPhone: supplier!.phone,
          purchaseNumber: purchase?.invoiceNumber,
          vendorBillNumber: purchase?.vendorBillNumber,
          refundMethod,
          reason: reason.trim(),
          notes: notes.trim(),
          items: activeLines.map((l) => ({
            name: l.name,
            quantity: l.quantity,
            unit: l.unit,
            costPrice: l.costPrice,
            total: round2(l.quantity * l.costPrice),
          })),
          totalAmount,
        })
      }
      onSuccess()
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to save the return')
    }
  }

  useInvoiceSaveShortcuts(
    () => save(false),
    () => save(true),
    () => save(true),
    saving
  )

  const showSearch = source === 'direct' && !purchase
  const canEditLines = !(source === 'customerReturn' && !salesReturn)

  // ── Pieces of a row (shared by the desktop table and the phone cards) ────────
  const renderQty = (line: ReturnLine) => (
    <div className='flex items-center gap-1'>
      <Button
        type='button'
        variant='outline'
        size='icon'
        className='h-8 w-8 shrink-0'
        onClick={() => setLineQty(line.key, line.quantity - 1)}
        disabled={line.quantity <= (purchase ? 0 : 1)}
        aria-label='Decrease quantity'
      >
        <Minus className='h-3.5 w-3.5' />
      </Button>
      <NumericInput
        ref={(el) => {
          qtyRefs.current[line.key] = el
        }}
        value={line.quantity}
        onValueChange={(v) => setLineQty(line.key, v)}
        decimals={false}
        emptyValue={null}
        min={0}
        max={line.max ?? undefined}
        selectOnFocus
        className={cn('h-8 w-16 text-center font-semibold tabular-nums', line.quantity === 0 && 'text-muted-foreground')}
        aria-label={`Return quantity for ${line.name}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (showSearch) focusSearch()
            else {
              const idx = lines.findIndex((l) => l.key === line.key)
              const next = lines[idx + 1]
              if (next) focusQty(next.key)
            }
          }
        }}
      />
      <Button
        type='button'
        variant='outline'
        size='icon'
        className='h-8 w-8 shrink-0'
        onClick={() => setLineQty(line.key, line.quantity + 1)}
        disabled={line.max != null && line.quantity >= line.max}
        aria-label='Increase quantity'
      >
        <Plus className='h-3.5 w-3.5' />
      </Button>
    </div>
  )

  const renderCost = (line: ReturnLine) => (
    <NumericInput
      value={line.costPrice}
      onValueChange={(v) => setLineCost(line.key, v)}
      decimals
      emptyValue={null}
      min={0}
      selectOnFocus
      className='h-8 w-28 text-right tabular-nums'
      aria-label={`Cost price for ${line.name}`}
    />
  )

  const renderProductInfo = (line: ReturnLine) => {
    const stock = stockFor(line)
    const short = stock != null && line.quantity > stock
    return (
      <div className='min-w-0'>
        <p className='font-medium leading-snug break-words'>{line.name}</p>
        <div className='mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground'>
          {line.barcode && <span className='font-mono'>{line.barcode}</span>}
          {line.unit && <Badge variant='outline' className='h-5 px-1.5 text-[10px] font-normal'>{line.unit}</Badge>}
          {line.purchased != null && (
            <span>
              Bought {line.purchased}
              {line.returned ? ` · Returned ${line.returned}` : ''} · <b className='text-foreground'>Can return {line.max}</b>
            </span>
          )}
          {source === 'customerReturn' && line.max != null && <span>Customer returned {line.max}</span>}
          {stock != null && (
            <span className={cn(short && 'font-semibold text-destructive')}>
              {short ? <TriangleAlert className='mr-0.5 inline h-3 w-3' /> : null}
              In stock {stock}
            </span>
          )}
        </div>
      </div>
    )
  }

  const renderDelete = (line: ReturnLine) =>
    purchase ? null : (
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-8 w-8 text-muted-foreground hover:text-destructive'
        onClick={() => removeLine(line.key)}
        aria-label={`Remove ${line.name}`}
      >
        <Trash2 className='h-4 w-4' />
      </Button>
    )

  // ── Render ────────────────────────────────────────────────────────────────────
  const saveDisabled = saving || blockers.length > 0

  const actionButtons = (size: 'sm' | 'default') => (
    <>
      <Button
        type='button'
        variant='outline'
        size={size}
        onClick={() => save(false)}
        disabled={saveDisabled}
        title={blockers[0] || 'Save (Ctrl+D)'}
        className='gap-1.5'
      >
        {saving ? <Loader2 className='h-4 w-4 animate-spin' /> : <Save className='h-4 w-4' />}
        Save Return
      </Button>
      <Button
        type='button'
        size={size}
        onClick={() => save(true)}
        disabled={saveDisabled}
        title={blockers[0] || 'Save & Print (Ctrl+Enter)'}
        className='gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700'
      >
        {saving ? <Loader2 className='h-4 w-4 animate-spin' /> : <Printer className='h-4 w-4' />}
        Save &amp; Print
      </Button>
    </>
  )

  return (
    <div className='space-y-4'>
      {/* Header — title + the primary actions, always reachable without scrolling */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <Button variant='ghost' size='icon' onClick={onBack} aria-label='Back to purchase returns'>
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <div className='min-w-0'>
            <h2 className='truncate text-xl font-bold sm:text-2xl'>New Purchase Return</h2>
            <p className='hidden text-xs text-muted-foreground sm:block'>
              Send goods back to a supplier · <kbd className='rounded border px-1 font-mono text-[10px]'>Ctrl+D</kbd> save ·{' '}
              <kbd className='rounded border px-1 font-mono text-[10px]'>Ctrl+Enter</kbd> save &amp; print
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2 max-sm:hidden'>{actionButtons('sm')}</div>
      </div>

      <div className='grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-[320px_minmax(0,1fr)_300px]'>
        {/* ── Column 1: Return details ───────────────────────────────────── */}
        <div className='min-w-0 space-y-4 md:col-start-1 md:row-start-1'>
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <RotateCcw className='h-4 w-4 text-muted-foreground' />
                Return Details
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4 pt-0'>
              {!prefillSalesReturn && (
                <div className='grid grid-cols-2 gap-1.5'>
                  {(
                    [
                      { value: 'direct', label: 'To Supplier', icon: Truck },
                      { value: 'customerReturn', label: 'Customer Return', icon: PackageSearch },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type='button'
                      onClick={() => switchSource(value)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                        source === value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <Icon className='h-4 w-4' />
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Customer return to forward */}
              {source === 'customerReturn' && (
                <div>
                  <SectionLabel required>Customer Return</SectionLabel>
                  <Popover open={srOpen} onOpenChange={(o) => { setSrOpen(o); if (!o) setSrQuery('') }}>
                    <PopoverTrigger asChild>
                      <Button
                        variant='outline'
                        className={cn('h-auto min-h-10 w-full justify-between py-1.5', !salesReturn && 'border-destructive/50 bg-destructive/5')}
                      >
                        {salesReturn ? (
                          <div className='min-w-0 text-left'>
                            <p className='truncate font-mono text-sm font-medium'>{salesReturn.returnNumber}</p>
                            <p className='truncate text-[11px] text-muted-foreground'>
                              {salesReturn.customerName || (salesReturn.customerId as any)?.name || 'Customer'} ·{' '}
                              {formatMoney(salesReturn.totalAmount)}
                            </p>
                          </div>
                        ) : (
                          <span className='flex items-center gap-2 text-muted-foreground'>
                            <Search className='h-4 w-4' /> Select approved customer return…
                          </span>
                        )}
                        <ChevronDown className='h-4 w-4 shrink-0 opacity-50' />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className='w-[calc(100vw-2rem)] max-w-[420px] p-0' align='start'>
                      <Command shouldFilter={false}>
                        <CommandInput placeholder='Return number or customer…' value={srQuery} onValueChange={setSrQuery} />
                        <CommandList className='max-h-[300px]'>
                          {srFetching && !salesReturnsData ? (
                            <div className='py-6 text-center text-sm text-muted-foreground'>
                              <Loader2 className='mx-auto mb-2 h-4 w-4 animate-spin' /> Loading…
                            </div>
                          ) : (
                            <CommandEmpty>No approved customer returns waiting.</CommandEmpty>
                          )}
                          <CommandGroup>
                            {(salesReturnsData?.results || []).map((sr) => (
                              <CommandItem
                                key={idOf(sr)}
                                value={idOf(sr)}
                                onSelect={() => selectSalesReturn(sr)}
                                className='flex cursor-pointer flex-col items-start gap-0.5 p-2.5'
                              >
                                <div className='flex w-full items-center justify-between gap-2'>
                                  <span className='font-mono text-sm font-medium'>{sr.returnNumber}</span>
                                  <span className='text-sm tabular-nums'>{formatMoney(sr.totalAmount)}</span>
                                </div>
                                <span className='text-xs text-muted-foreground'>
                                  {sr.customerName || (sr.customerId as any)?.name || 'Customer'} · {sr.items.length} item(s)
                                  {sr.reason ? ` · ${sr.reason}` : ''}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              <div>
                <SectionLabel required>{source === 'customerReturn' ? 'Return To Supplier' : 'Supplier'}</SectionLabel>
                <SupplierPicker
                  suppliers={suppliers}
                  value={supplier}
                  onChange={handleSupplierChange}
                  open={supplierOpen}
                  onOpenChange={setSupplierOpen}
                  triggerRef={supplierTriggerRef}
                />
              </div>

              {/* Optional purchase invoice — locks the rows to what that bill delivered */}
              {source === 'direct' && (
                <div>
                  <SectionLabel>Against Purchase Invoice (optional)</SectionLabel>
                  {purchase ? (
                    <div className='flex items-start justify-between gap-2 rounded-lg border bg-muted/40 p-2.5'>
                      <div className='min-w-0'>
                        <p className='flex items-center gap-1.5 font-mono text-sm font-medium'>
                          <FileText className='h-3.5 w-3.5 text-muted-foreground' />
                          {purchase.invoiceNumber}
                        </p>
                        <p className='text-[11px] text-muted-foreground'>
                          {purchase.purchaseDate ? formatBusinessDate(purchase.purchaseDate) : ''}
                          {purchase.vendorBillNumber ? ` · Bill #${purchase.vendorBillNumber}` : ''} ·{' '}
                          {formatMoney(purchase.totalAmount ?? 0)}
                        </p>
                      </div>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 shrink-0'
                        onClick={unlinkPurchase}
                        aria-label='Remove invoice link'
                        title='Remove invoice link'
                      >
                        <X className='h-4 w-4' />
                      </Button>
                    </div>
                  ) : (
                    <Popover open={invoiceOpen} onOpenChange={(o) => { setInvoiceOpen(o); if (!o) setInvoiceQuery('') }}>
                      <PopoverTrigger asChild>
                        <Button variant='outline' className='w-full justify-between font-normal'>
                          <span className='flex items-center gap-2 truncate text-muted-foreground'>
                            <FileText className='h-4 w-4' />
                            {supplier ? `Pick from ${supplier.name}'s invoices…` : 'Pick a purchase invoice…'}
                          </span>
                          <ChevronDown className='h-4 w-4 shrink-0 opacity-50' />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className='w-[calc(100vw-2rem)] max-w-[420px] p-0' align='start'>
                        <Command shouldFilter={false}>
                          <CommandInput placeholder='Purchase no, vendor bill or product…' value={invoiceQuery} onValueChange={setInvoiceQuery} />
                          <CommandList className='max-h-[320px]'>
                            {purchasesFetching && !purchaseOptions.length ? (
                              <div className='py-6 text-center text-sm text-muted-foreground'>
                                <Loader2 className='mx-auto mb-2 h-4 w-4 animate-spin' /> Loading invoices…
                              </div>
                            ) : (
                              <CommandEmpty>No purchase invoices found.</CommandEmpty>
                            )}
                            <CommandGroup heading={supplier ? `Recent invoices — ${supplier.name}` : 'Recent invoices'}>
                              {purchaseOptions.map((p) => (
                                <CommandItem
                                  key={idOf(p)}
                                  value={idOf(p)}
                                  onSelect={() => selectPurchase(p)}
                                  className='flex cursor-pointer flex-col items-start gap-0.5 p-2.5'
                                >
                                  <div className='flex w-full items-center justify-between gap-2'>
                                    <span className='font-mono text-sm font-medium'>{p.invoiceNumber}</span>
                                    <span className='text-sm tabular-nums'>{formatMoney(p.totalAmount ?? 0)}</span>
                                  </div>
                                  <span className='text-xs text-muted-foreground'>
                                    {p.purchaseDate ? formatBusinessDate(p.purchaseDate) : ''}
                                    {!supplier && p.supplier?.name ? ` · ${p.supplier.name}` : ''}
                                    {p.vendorBillNumber ? ` · Bill #${p.vendorBillNumber}` : ''}
                                    {` · ${p.itemsCount ?? p.items?.length ?? 0} item(s)`}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )}

              <div>
                <SectionLabel required>Return Date</SectionLabel>
                <DatePicker value={returnDate} max={getBusinessToday()} onChange={(d) => d && setReturnDate(d)} />
              </div>

              <WarehouseField
                kind='any'
                id='purchase-return-warehouse'
                label='Send back from warehouse'
                value={warehouseId}
                onValueChange={setWarehouseId}
                preferredId={purchase?.warehouseId || null}
              />

              <div>
                <SectionLabel>Reason</SectionLabel>
                <Input
                  placeholder='e.g. Damaged in transit'
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className='mt-2 flex flex-wrap gap-1.5'>
                  {QUICK_REASONS.map((r) => (
                    <button
                      key={r}
                      type='button'
                      onClick={() => setReason(reason === r ? '' : r)}
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                        reason === r
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <SectionLabel>Notes / Condition</SectionLabel>
                <Textarea
                  placeholder='Describe damage, packing condition, who collected it…'
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Column 2: stats strip + items ──────────────────────────────── */}
        <div className='min-w-0 space-y-4 md:col-span-2 md:col-start-1 md:row-start-2 xl:col-span-1 xl:col-start-2 xl:row-start-1'>
          <div className='hidden grid-cols-3 gap-2 sm:grid'>
            {[
              { label: 'Items', value: String(activeLines.length) },
              { label: 'Quantity', value: String(totalQty) },
              { label: 'Return Total', value: formatMoney(totalAmount), highlight: true },
            ].map((stat) => (
              <div
                key={stat.label}
                className={cn(
                  'min-w-0 rounded-lg border px-3 py-1.5',
                  stat.highlight ? 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/20' : 'bg-card'
                )}
              >
                <p className='truncate text-[10px] text-muted-foreground'>{stat.label}</p>
                <p className={cn('truncate text-sm font-bold tabular-nums', stat.highlight && 'text-orange-700 dark:text-orange-400')}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <Card className='min-w-0'>
            <CardHeader className='py-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <CardTitle className='text-base'>
                  Return Items ({purchase ? `${activeLines.length} of ${lines.length}` : lines.length})
                </CardTitle>
                {purchase && lines.length > 0 && (
                  <div className='flex gap-2'>
                    <Button type='button' size='sm' variant='outline' onClick={returnAll}>
                      Return All
                    </Button>
                    <Button type='button' size='sm' variant='ghost' onClick={clearQuantities} disabled={!activeLines.length}>
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              {/* Inline product search — type or scan, ↑/↓ to move, Enter to add */}
              {showSearch && (
                <div className='relative mt-2'>
                  <ScanLine className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    ref={searchInputRef}
                    value={productQuery}
                    onChange={(e) => {
                      setProductQuery(e.target.value)
                      setSearchOpen(true)
                    }}
                    onFocus={() => productQuery && setSearchOpen(true)}
                    onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                    onKeyDown={onSearchKeyDown}
                    placeholder={catalogLoading ? 'Loading products…' : 'Search product by name or scan barcode, then Enter'}
                    className='h-10 pl-9'
                    showVoiceInput={false}
                    aria-label='Search product to return'
                  />
                  {searchOpen && productQuery.trim() && (
                    <div className='absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg'>
                      {searchResults.length === 0 ? (
                        <p className='py-6 text-center text-sm text-muted-foreground'>No products found.</p>
                      ) : (
                        searchResults.map((p, i) => (
                          <button
                            key={p.id}
                            type='button'
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setActiveIndex(i)}
                            onClick={() => addCatalogItem(p)}
                            className={cn(
                              'flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-0',
                              i === activeIndex ? 'bg-accent' : 'hover:bg-muted/60'
                            )}
                          >
                            {p.image?.url ? (
                              <img src={p.image.url} alt='' className='h-9 w-9 shrink-0 rounded object-cover' />
                            ) : (
                              <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted'>
                                <Package className='h-4 w-4 text-muted-foreground' />
                              </div>
                            )}
                            <div className='min-w-0 flex-1'>
                              <p className='truncate text-sm font-medium'>{p.name}</p>
                              <p className='truncate text-[11px] text-muted-foreground'>
                                {p.barcode ? `${p.barcode} · ` : ''}Stock {p.stockQuantity ?? 0}
                              </p>
                            </div>
                            {p.cost != null && (
                              <span className='shrink-0 text-sm tabular-nums text-muted-foreground'>{formatMoney(p.cost)}</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardHeader>

            <CardContent className='p-0'>
              {lines.length === 0 ? (
                <div className='flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground'>
                  <Package className='h-8 w-8 opacity-40' />
                  {!canEditLines
                    ? 'Select the customer return to load its items.'
                    : purchase
                      ? previousReturnsLoading
                        ? 'Loading invoice items…'
                        : 'Everything on this invoice has already been returned.'
                      : 'Search a product above or scan its barcode to add it. Or pick a purchase invoice to return from it.'}
                </div>
              ) : isPhone ? (
                <div className='space-y-2 p-3'>
                  {lines.map((line, index) => (
                    <div
                      key={line.key}
                      className={cn('rounded-lg border p-3', purchase && line.quantity === 0 && 'opacity-60')}
                    >
                      <div className='flex items-start gap-2'>
                        <span className='pt-0.5 text-xs tabular-nums text-muted-foreground'>{index + 1}.</span>
                        <div className='min-w-0 flex-1'>{renderProductInfo(line)}</div>
                        {renderDelete(line)}
                      </div>
                      <div className='mt-2 flex flex-wrap items-center justify-between gap-2'>
                        {renderQty(line)}
                        {renderCost(line)}
                      </div>
                      <div className='mt-2 flex justify-between border-t pt-2 text-sm'>
                        <span className='text-muted-foreground'>Amount</span>
                        <span className='font-semibold tabular-nums'>{formatMoney(round2(line.quantity * line.costPrice))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='max-h-[520px] overflow-auto'>
                  <Table className='min-w-[620px] table-fixed' containerClassName='max-h-none overflow-visible'>
                    <colgroup>
                      <col className='w-10' />
                      <col />
                      <col className='w-[150px]' />
                      <col className='w-[130px]' />
                      <col className='w-[120px]' />
                      <col className='w-10' />
                    </colgroup>
                    <TableHeader className='sticky top-0 z-10 bg-muted'>
                      <TableRow className='hover:bg-transparent'>
                        <TableHead className='pl-3 pr-1'>#</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Return Qty</TableHead>
                        <TableHead className='text-right'>Cost Price</TableHead>
                        <TableHead className='text-right'>Amount</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, index) => (
                        <TableRow
                          key={line.key}
                          className={cn(purchase && line.quantity === 0 && 'text-muted-foreground [&_p]:opacity-70')}
                        >
                          <TableCell className='py-2.5 pl-3 pr-1 align-top text-xs tabular-nums text-muted-foreground'>
                            {index + 1}
                          </TableCell>
                          <TableCell className='whitespace-normal py-2.5 align-top'>{renderProductInfo(line)}</TableCell>
                          <TableCell className='py-2.5 align-middle'>{renderQty(line)}</TableCell>
                          <TableCell className='py-2.5 align-middle'>
                            <div className='flex justify-end'>{renderCost(line)}</div>
                          </TableCell>
                          <TableCell className='py-2.5 text-right align-middle font-semibold tabular-nums'>
                            {formatMoney(round2(line.quantity * line.costPrice))}
                          </TableCell>
                          <TableCell className='px-1 py-2.5 align-middle'>{renderDelete(line)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {lines.length > 0 && (
                <div className='flex items-center justify-between border-t px-4 py-3'>
                  <span className='text-sm text-muted-foreground'>
                    {activeLines.length} item(s) · Qty {totalQty}
                  </span>
                  <span className='text-lg font-bold tabular-nums'>{formatMoney(totalAmount)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Column 3: summary + settlement ─────────────────────────────── */}
        <div className='min-w-0 space-y-4 md:col-start-2 md:row-start-1 xl:col-start-3'>
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Receipt className='h-4 w-4 text-muted-foreground' />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2 pt-0 text-sm'>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Items</span>
                <span className='tabular-nums'>{activeLines.length}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Total Quantity</span>
                <span className='tabular-nums'>{totalQty}</span>
              </div>
              {purchase && (
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Invoice</span>
                  <span className='font-mono text-xs'>{purchase.invoiceNumber}</span>
                </div>
              )}
              <Separator />
              <div className='flex justify-between text-lg font-bold'>
                <span>Total Return</span>
                <span className='tabular-nums text-orange-700 dark:text-orange-400'>{formatMoney(totalAmount)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Banknote className='h-4 w-4 text-muted-foreground' />
                Settlement
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3 pt-0'>
              <div className='grid grid-cols-3 gap-1.5'>
                {REFUND_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type='button'
                    onClick={() => setRefundMethod(value)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium leading-tight transition-colors',
                      refundMethod === value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className='h-4 w-4' />
                    <span className='text-center'>{label}</span>
                  </button>
                ))}
              </div>
              <p className='text-xs text-muted-foreground'>
                {REFUND_OPTIONS.find((o) => o.value === refundMethod)?.hint}
              </p>

              {supplier && refundMethod === 'adjustment' && (
                <div className='space-y-1.5 rounded-lg bg-orange-50 p-3 text-sm dark:bg-orange-950/30'>
                  <div className='flex items-baseline justify-between gap-2'>
                    <span className='whitespace-nowrap text-muted-foreground'>Current balance</span>
                    {supplierBalance == null ? (
                      <Loader2 className='h-3 w-3 animate-spin' />
                    ) : (
                      <BalanceAmount value={supplierBalance} />
                    )}
                  </div>
                  <div className='flex items-baseline justify-between gap-2'>
                    <span className='whitespace-nowrap text-muted-foreground'>This return</span>
                    <span className='font-medium tabular-nums text-emerald-600'>-{formatMoney(totalAmount)}</span>
                  </div>
                  <Separator />
                  {supplierBalance != null && (
                    <div className='flex items-baseline justify-between gap-2 font-semibold'>
                      <span className='whitespace-nowrap'>Balance after</span>
                      <BalanceAmount value={supplierBalance - totalAmount} />
                    </div>
                  )}
                </div>
              )}
              {supplier && refundMethod !== 'adjustment' && totalAmount > 0 && (
                <div className='rounded-lg bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30'>
                  <span className='text-muted-foreground'>{refundMethod === 'cash' ? 'Cash' : 'Bank'} to receive: </span>
                  <span className='font-semibold tabular-nums text-emerald-700 dark:text-emerald-400'>{formatMoney(totalAmount)}</span>
                </div>
              )}

              {blockers.length > 0 && (lines.length > 0 || supplier) && (
                <ul className='space-y-1 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground'>
                  {blockers.map((b) => (
                    <li key={b} className='flex gap-1.5'>
                      <TriangleAlert className='mt-0.5 h-3 w-3 shrink-0 text-amber-500' />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Phones: Save / Save & Print always within thumb reach, with the total for context */}
      {isPhone && (
        <DockedFooter label='Purchase return actions'>
          <div className='mb-2 flex items-baseline justify-between'>
            <span className='text-xs text-muted-foreground'>
              {activeLines.length} item(s) · Qty {totalQty}
            </span>
            <span className='text-lg font-bold tabular-nums'>{formatMoney(totalAmount)}</span>
          </div>
          <div className='grid grid-cols-2 gap-2'>{actionButtons('default')}</div>
        </DockedFooter>
      )}
    </div>
  )
}
