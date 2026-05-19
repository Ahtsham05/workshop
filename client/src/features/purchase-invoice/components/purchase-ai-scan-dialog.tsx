import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '@/stores/store'
import { fetchSuppliers } from '@/stores/supplier.slice'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Loader2,
  Sparkles,
  Camera,
  Upload,
  Trash2,
  AlertCircle,
  Check,
  ChevronDown,
} from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Alert, AlertDescription } from '@/components/ui/alert'
import CameraCapture from '@/components/camera-capture'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type { Product } from '@/features/invoice'
import type { Purchase, PurchaseItem, Supplier } from '../index'
import {
  buildPurchaseItemFromMatch,
  getProductId,
  getSupplierId,
  matchProductFromScan,
  matchSupplierFromScan,
} from '../utils/scan-matching'
import {
  extractFirstPhone,
  normalizeSuppliersList,
} from '../utils/catalog-helpers'
import type { ScannedSupplierHint } from '../utils/scan-matching'
import { getUrduSecondaryNameClasses, matchesBilingualSearch } from '@/utils/urdu-text-utils'

export interface PurchaseScanApplyPayload {
  supplier: Supplier
  items: PurchaseItem[]
  date?: string
  notes?: string
  paymentType?: Purchase['paymentType']
}

interface PurchaseAiScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers: Supplier[]
  products: Product[]
  onApply: (payload: PurchaseScanApplyPayload) => void
}

interface ReviewLineItem {
  id: string
  scannedName: string
  scannedNameUrdu: string
  scannedBarcode: string
  quantity: number
  purchasePrice: number
  sellingPrice: number
  matchedProductId: string
}

const URDU_SCRIPT = /[\u0600-\u06FF\u0750-\u077F]/

const FULLSCREEN_DIALOG_CLASS = cn(
  '!fixed !inset-0 !top-0 !left-0 z-[100] flex h-[100dvh] w-[100vw] !max-w-none flex-col gap-0',
  '!translate-x-0 !translate-y-0 rounded-none border-0 p-0 shadow-lg overflow-hidden',
  'sm:!max-w-none data-[state=open]:!zoom-in-100 data-[state=closed]:!zoom-out-100',
)

/** Popovers must sit above the fullscreen dialog (z-[100]); default popover is z-50. */
const SCAN_POPOVER_CLASS = 'z-[200] w-72 p-0'

function splitScannedNames(rawName: string, rawNameUrdu: string) {
  let name = rawName.trim()
  let nameUrdu = rawNameUrdu.trim()
  if (!nameUrdu && name && URDU_SCRIPT.test(name)) {
    nameUrdu = name
    name = ''
  }
  return { name, nameUrdu }
}

function parseScanDate(raw: string): string | undefined {
  const s = String(raw || '').trim()
  if (!s) return undefined
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

function mapPaymentType(raw: string): Purchase['paymentType'] | undefined {
  const v = raw.trim().toLowerCase()
  if (!v) return undefined
  if (v.includes('cash')) return 'Cash'
  if (v.includes('card')) return 'Card'
  if (v.includes('credit')) return 'Credit'
  if (v.includes('cheque') || v.includes('check')) return 'Cheque'
  if (v.includes('bank') || v.includes('transfer')) return 'Bank Transfer'
  if (v.includes('wallet')) return 'Wallet'
  return undefined
}

function ProductReviewRow({
  line,
  products,
  onUpdate,
  onProductPick,
  onRemove,
  t,
}: {
  line: ReviewLineItem
  products: Product[]
  onUpdate: (id: string, patch: Partial<ReviewLineItem>) => void
  onProductPick: (lineId: string, product: Product) => void
  onRemove: (id: string) => void
  t: (key: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const matched = products.find((p) => getProductId(p) === line.matchedProductId)
  const filtered = products.filter((p) =>
    matchesBilingualSearch(search, p.name, p.nameUrdu, p.barcode),
  )

  return (
    <TableRow className={!line.matchedProductId ? 'bg-destructive/5' : undefined}>
      <TableCell className="align-top">
        <p className="text-sm font-medium">{line.scannedName || '—'}</p>
        {line.scannedNameUrdu ? (
          <p className={getUrduSecondaryNameClasses(line.scannedNameUrdu)}>
            {line.scannedNameUrdu}
          </p>
        ) : null}
        {line.scannedBarcode ? (
          <p className="text-xs text-muted-foreground">{line.scannedBarcode}</p>
        ) : null}
      </TableCell>
      <TableCell className="align-top">
        <Popover open={open} onOpenChange={setOpen} modal>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full max-w-[220px] justify-between"
            >
              <span className="truncate text-left">
                {matched
                  ? [matched.name, matched.nameUrdu].filter(Boolean).join(' · ')
                  : t('select_product')}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className={SCAN_POPOVER_CLASS} align="start" side="bottom">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={t('search_products')}
                value={search}
                onValueChange={setSearch}
              />
              <CommandList className="max-h-56">
                <CommandGroup>
                  {filtered.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {products.length === 0 ? t('loading') : t('no_results')}
                    </p>
                  ) : null}
                  {filtered.slice(0, 50).map((p) => {
                    const pid = getProductId(p)
                    return (
                    <CommandItem
                      key={pid || p.name}
                      value={`${pid}-${p.name}`}
                      onSelect={() => {
                        onProductPick(line.id, p)
                        setSearch('')
                        setOpen(false)
                      }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{p.name}</p>
                        {p.nameUrdu ? (
                          <p className={getUrduSecondaryNameClasses(p.nameUrdu)}>
                            {p.nameUrdu}
                          </p>
                        ) : null}
                      </div>
                    </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={1}
          className="h-8"
          value={line.quantity}
          onChange={(e) =>
            onUpdate(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })
          }
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          step="0.01"
          className="h-8"
          value={line.purchasePrice}
          onChange={(e) =>
            onUpdate(line.id, {
              purchasePrice: Math.max(0, Number(e.target.value) || 0),
            })
          }
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          step="0.01"
          className="h-8"
          value={line.sellingPrice}
          onChange={(e) =>
            onUpdate(line.id, {
              sellingPrice: Math.max(0, Number(e.target.value) || 0),
            })
          }
        />
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          onClick={() => onRemove(line.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function PurchaseAiScanDialog({
  open,
  onOpenChange,
  suppliers: suppliersProp,
  products,
  onApply,
}: PurchaseAiScanDialogProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const suppliersFromRedux = useSelector((state: RootState) => state.supplier.data)
  const suppliers = useMemo(() => {
    const fromProp = normalizeSuppliersList(suppliersProp)
    if (fromProp.length > 0) return fromProp
    return normalizeSuppliersList(suppliersFromRedux)
  }, [suppliersProp, suppliersFromRedux])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [step, setStep] = useState<'upload' | 'review'>('upload')
  const [lines, setLines] = useState<ReviewLineItem[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [supplierPopoverOpen, setSupplierPopoverOpen] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [scannedSupplierLabel, setScannedSupplierLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [paymentType, setPaymentType] = useState<Purchase['paymentType'] | ''>('')
  const [lastScannedSupplier, setLastScannedSupplier] = useState<ScannedSupplierHint | null>(
    null,
  )

  useEffect(() => {
    if (!open) return
    if (suppliers.length > 0) return
    dispatch(fetchSuppliers({ page: 1, limit: 2000 }))
  }, [open, suppliers.length, dispatch])

  useEffect(() => {
    if (step !== 'review' || selectedSupplierId || !lastScannedSupplier) return
    const matched = matchSupplierFromScan(lastScannedSupplier, suppliers)
    if (matched) {
      setSelectedSupplierId(getSupplierId(matched))
    }
  }, [step, selectedSupplierId, lastScannedSupplier, suppliers])

  useEffect(() => {
    if (step !== 'review' || products.length === 0 || lines.length === 0) return
    setLines((prev) =>
      prev.map((line) => {
        if (line.matchedProductId) return line
        const matched = matchProductFromScan(
          {
            name: line.scannedName,
            nameUrdu: line.scannedNameUrdu,
            barcode: line.scannedBarcode,
          },
          products,
        )
        if (!matched) return line
        return {
          ...line,
          matchedProductId: getProductId(matched),
          sellingPrice:
            line.sellingPrice > 0 ? line.sellingPrice : matched.price || matched.cost || 0,
          purchasePrice:
            line.purchasePrice > 0 ? line.purchasePrice : matched.cost || 0,
        }
      }),
    )
  }, [step, products, lines.length])

  const setImage = useCallback((file: File) => {
    setImageFile(file)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setLines([])
    setStep('upload')
  }, [])

  const resetDialog = useCallback(() => {
    setImageFile(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setLines([])
    setStep('upload')
    setScanning(false)
    setSelectedSupplierId('')
    setScannedSupplierLabel('')
    setNotes('')
    setPurchaseDate('')
    setPaymentType('')
    setSupplierSearch('')
    setLastScannedSupplier(null)
  }, [])

  const handleScan = useCallback(async () => {
    if (!imageFile) {
      toast.error(t('please_select_image'))
      return
    }

    try {
      setScanning(true)
      const formData = new FormData()
      formData.append('image', imageFile)

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/purchases/scan-image`,
        {
          method: 'POST',
          body: formData,
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
        },
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const msg =
          typeof data.message === 'string' && data.message.trim()
            ? data.message
            : t('ai_scan_failed')
        throw new Error(msg)
      }

      const items = Array.isArray(data.items) ? data.items : []
      if (items.length === 0) {
        toast.error(t('no_purchase_lines_found'))
        return
      }

      const supplierRaw = data.supplier || {}
      const { name, nameUrdu } = splitScannedNames(
        String(supplierRaw.name || ''),
        String(supplierRaw.nameUrdu || ''),
      )
      const scannedSupplierHint: ScannedSupplierHint = {
        name,
        nameUrdu,
        phone: extractFirstPhone(String(supplierRaw.phone || '')),
        matchedSupplierId: supplierRaw.matchedSupplierId as string | undefined,
      }
      setLastScannedSupplier(scannedSupplierHint)

      const matchedSupplier = matchSupplierFromScan(scannedSupplierHint, suppliers)
      setSelectedSupplierId(matchedSupplier ? getSupplierId(matchedSupplier) : '')
      setScannedSupplierLabel(
        [name, nameUrdu].filter(Boolean).join(' · ') ||
          [name, nameUrdu, scannedSupplierHint.phone].filter(Boolean).join(' · '),
      )

      const mappedLines: ReviewLineItem[] = items.map(
        (raw: Record<string, unknown>, index: number) => {
          const names = splitScannedNames(
            String(raw.name || ''),
            String(raw.nameUrdu || ''),
          )
          const barcode = String(raw.barcode || '').trim()
          const qty = Number(raw.quantity)
          const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1
          let purchasePrice = Number(
            String(raw.purchasePrice ?? '').replace(/,/g, ''),
          )
          if (!Number.isFinite(purchasePrice)) purchasePrice = 0
          let sellingPrice = Number(
            String(raw.sellingPrice ?? '').replace(/,/g, ''),
          )
          if (!Number.isFinite(sellingPrice)) sellingPrice = 0

          const matched = matchProductFromScan(
            {
              name: names.name,
              nameUrdu: names.nameUrdu,
              barcode,
              matchedProductId: raw.matchedProductId as string | undefined,
            },
            products,
          )

          const saleFromProduct =
            matched && sellingPrice <= 0
              ? matched.price || matched.cost || 0
              : sellingPrice

          return {
            id: `line-${index}-${Date.now()}`,
            scannedName: names.name,
            scannedNameUrdu: names.nameUrdu,
            scannedBarcode: barcode,
            quantity,
            purchasePrice,
            sellingPrice: saleFromProduct,
            matchedProductId: matched ? getProductId(matched) : '',
          }
        },
      )

      setLines(mappedLines)
      setNotes(String(data.notes || '').trim())
      const parsedDate = parseScanDate(String(data.date || ''))
      if (parsedDate) {
        setPurchaseDate(parsedDate.slice(0, 10))
      }
      const pt = mapPaymentType(String(data.paymentType || ''))
      if (pt) setPaymentType(pt)

      setStep('review')
      const matchedProducts = mappedLines.filter((l) => l.matchedProductId).length
      const matchNote =
        matchedSupplier || matchedProducts > 0
          ? ` (${matchedSupplier ? matchedSupplier.name : ''}${matchedSupplier && matchedProducts > 0 ? ' · ' : ''}${matchedProducts > 0 ? `${matchedProducts}/${items.length} products auto-matched` : ''})`
          : ''
      toast.success(
        `${t('ai_scan_success')}: ${items.length} ${t('purchase_lines_found')}${matchNote}`,
      )
    } catch (error) {
      console.error('Purchase AI scan error:', error)
      toast.error(error instanceof Error ? error.message : t('ai_scan_failed'))
    } finally {
      setScanning(false)
    }
  }, [imageFile, products, suppliers, t])

  const updateLine = (id: string, patch: Partial<ReviewLineItem>) => {
    setLines((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  const handleProductPick = (lineId: string, product: Product) => {
    setLines((prev) =>
      prev.map((row) => {
        if (row.id !== lineId) return row
        return {
          ...row,
          matchedProductId: getProductId(product),
          sellingPrice:
            row.sellingPrice > 0 ? row.sellingPrice : product.price || 0,
          purchasePrice:
            row.purchasePrice > 0 ? row.purchasePrice : product.cost || 0,
        }
      }),
    )
  }

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((row) => row.id !== id))
  }

  const unmatchedCount = lines.filter((l) => !l.matchedProductId).length

  const handleApply = () => {
    const supplier = suppliers.find((s) => getSupplierId(s) === selectedSupplierId)
    if (!supplier || !getSupplierId(supplier)) {
      toast.error(t('select_supplier_required'))
      return
    }

    const built: PurchaseItem[] = []
    for (const line of lines) {
      const product = products.find((p) => getProductId(p) === line.matchedProductId)
      if (!product) {
        toast.error(t('match_all_products_before_apply'))
        return
      }
      built.push(
        buildPurchaseItemFromMatch(
          product,
          line.quantity,
          line.purchasePrice,
          line.sellingPrice,
        ),
      )
    }

    if (built.length === 0) {
      toast.error(t('no_purchase_lines_found'))
      return
    }

    onApply({
      supplier,
      items: built,
      date: purchaseDate ? new Date(purchaseDate).toISOString() : undefined,
      notes: notes || undefined,
      paymentType: paymentType || undefined,
    })
    resetDialog()
    onOpenChange(false)
    toast.success(t('purchase_scan_applied'))
  }

  const filteredSuppliers = suppliers.filter((s) =>
    matchesBilingualSearch(supplierSearch, s.name, s.nameUrdu, s.phone),
  )

  const selectedSupplier = suppliers.find((s) => getSupplierId(s) === selectedSupplierId)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetDialog()
        onOpenChange(next)
      }}
    >
      <DialogContent
        className={step === 'review' ? FULLSCREEN_DIALOG_CLASS : 'max-w-lg'}
      >
        <div className={step === 'review' ? 'flex h-full min-h-0 flex-col' : undefined}>
          <DialogHeader className={step === 'review' ? 'shrink-0 border-b px-4 py-3' : ''}>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-600" />
              {t('ai_scan_purchase_invoice')}
            </DialogTitle>
            <DialogDescription>
              {step === 'upload'
                ? t('ai_scan_purchase_description')
                : t('ai_scan_purchase_review_hint')}
            </DialogDescription>
          </DialogHeader>

          <div className={step === 'review' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'space-y-4 py-2'}>
            {step === 'upload' && (
              <>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{t('ai_scan_purchase_tip')}</AlertDescription>
                </Alert>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={scanning}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {t('upload_image')}
                  </Button>
                  <CameraCapture
                    onCapture={setImage}
                    trigger={
                      <Button type="button" variant="outline" disabled={scanning}>
                        <Camera className="mr-2 h-4 w-4" />
                        {t('take_photo')}
                      </Button>
                    }
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setImage(file)
                      if (e.target) e.target.value = ''
                    }}
                  />
                </div>

                {previewUrl && (
                  <div className="overflow-hidden rounded-lg border max-h-64">
                    <img
                      src={previewUrl}
                      alt=""
                      className="max-h-64 w-full bg-muted object-contain"
                    />
                  </div>
                )}

                {imageFile && (
                  <Button onClick={handleScan} disabled={scanning} className="w-full">
                    {scanning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('ai_scanning')}...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {t('scan_with_ai')}
                      </>
                    )}
                  </Button>
                )}
              </>
            )}

            {step === 'review' && (
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
                {scannedSupplierLabel ? (
                  <p className="text-sm text-muted-foreground">
                    {t('scanned_from_invoice')}:{' '}
                    <span className="font-medium text-foreground">{scannedSupplierLabel}</span>
                  </p>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('supplier')}</Label>
                    <Popover open={supplierPopoverOpen} onOpenChange={setSupplierPopoverOpen} modal>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                        >
                          <span className="truncate">
                            {selectedSupplier
                              ? [selectedSupplier.name, selectedSupplier.nameUrdu]
                                  .filter(Boolean)
                                  .join(' · ')
                              : scannedSupplierLabel || t('select_supplier')}
                          </span>
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className={cn(SCAN_POPOVER_CLASS, 'w-[min(100vw-2rem,28rem)]')}
                        align="start"
                        side="bottom"
                      >
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder={t('search_supplier')}
                            value={supplierSearch}
                            onValueChange={setSupplierSearch}
                          />
                          <CommandList>
                            <CommandGroup>
                              {filteredSuppliers.length === 0 ? (
                                <p className="py-4 text-center text-sm text-muted-foreground">
                                  {suppliers.length === 0
                                    ? t('loading')
                                    : t('no_results')}
                                </p>
                              ) : null}
                              {filteredSuppliers.map((s) => {
                                const sid = getSupplierId(s)
                                return (
                                <CommandItem
                                  key={sid || s.name}
                                  value={`${sid}-${s.name}`}
                                  onSelect={() => {
                                    setSelectedSupplierId(sid)
                                    setSupplierSearch('')
                                    setSupplierPopoverOpen(false)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      selectedSupplierId === sid ? 'opacity-100' : 'opacity-0',
                                    )}
                                  />
                                  <div className="min-w-0">
                                    <p className="truncate">{s.name}</p>
                                    {s.nameUrdu ? (
                                      <p className={getUrduSecondaryNameClasses(s.nameUrdu)}>
                                        {s.nameUrdu}
                                      </p>
                                    ) : null}
                                    {s.phone ? (
                                      <p className="text-xs text-muted-foreground">{s.phone}</p>
                                    ) : null}
                                  </div>
                                </CommandItem>
                                )
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('purchase_date')}</Label>
                    <Input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                    />
                  </div>
                </div>

                {unmatchedCount > 0 ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {unmatchedCount} {t('products_need_matching')}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                  <Table className="min-w-[720px]">
                    <TableHeader className="sticky top-0 z-10 bg-muted">
                      <TableRow>
                        <TableHead>{t('scanned_name')}</TableHead>
                        <TableHead>{t('product')}</TableHead>
                        <TableHead className="w-20">{t('qty')}</TableHead>
                        <TableHead className="w-28">{t('purchase_price')}</TableHead>
                        <TableHead className="w-28">{t('sale_price')}</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <ProductReviewRow
                          key={line.id}
                          line={line}
                          products={products}
                          onUpdate={updateLine}
                          onProductPick={handleProductPick}
                          onRemove={removeLine}
                          t={t}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-2">
                  <Label>{t('notes')}</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <DialogFooter
            className={cn(
              step === 'review' && 'shrink-0 border-t px-4 py-3',
              'gap-2',
            )}
          >
            {step === 'review' ? (
              <>
                <Button variant="outline" onClick={() => setStep('upload')} disabled={scanning}>
                  {t('back')}
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={
                    !selectedSupplierId || lines.length === 0 || unmatchedCount > 0
                  }
                  title={
                    unmatchedCount > 0
                      ? t('match_all_products_before_apply')
                      : !selectedSupplierId
                        ? t('select_supplier_required')
                        : undefined
                  }
                >
                  {t('apply_to_purchase_form')}
                </Button>
              </>
            ) : null}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={scanning}>
              {t('cancel')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
