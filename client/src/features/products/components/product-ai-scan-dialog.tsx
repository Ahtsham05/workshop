import { useState, useCallback, useRef, useEffect } from 'react'
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
import { toast } from 'sonner'
import {
  Loader2,
  Sparkles,
  Camera,
  Upload,
  Plus,
  Trash2,
  AlertCircle,
  PenLine,
} from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Alert, AlertDescription } from '@/components/ui/alert'
import CameraCapture from '@/components/camera-capture'
import {
  fetchEnglishNameSuggestion,
  fetchUrduNameSuggestion,
} from '@/hooks/use-auto-urdu-name-from-english'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface ProductAiScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (products: Record<string, string | number>[]) => Promise<void>
}

interface ScannedProduct {
  id: string
  name: string
  nameUrdu: string
  barcode: string
  price: string
  cost: string
  stockQuantity: string
  unit: string
  category: string
  description: string
}

const URDU_SCRIPT = /[\u0600-\u06FF\u0750-\u077F]/

const FULLSCREEN_DIALOG_CLASS = cn(
  '!fixed !inset-0 !top-0 !left-0 z-[100] flex h-[100dvh] w-[100vw] !max-w-none flex-col gap-0',
  '!translate-x-0 !translate-y-0 rounded-none border-0 p-0 shadow-lg overflow-hidden',
  'sm:!max-w-none data-[state=open]:!zoom-in-100 data-[state=closed]:!zoom-out-100',
)

const ROW_NAV_FIELDS: (keyof ScannedProduct)[] = [
  'name',
  'nameUrdu',
  'price',
  'cost',
  'stockQuantity',
  'barcode',
  'unit',
  'category',
  'description',
]

const MANUAL_START_ROW_COUNT = 5

function generateBarcode(): string {
  const timestamp = Date.now().toString()
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')
  return `${timestamp.slice(-10)}${random}`
}

function createEmptyRow(): ScannedProduct {
  return {
    id: crypto.randomUUID(),
    name: '',
    nameUrdu: '',
    barcode: '',
    price: '',
    cost: '',
    stockQuantity: '',
    unit: 'pcs',
    category: '',
    description: '',
  }
}

function splitScannedNames(rawName: string, rawNameUrdu: string) {
  let name = rawName.trim()
  let nameUrdu = rawNameUrdu.trim()
  if (!nameUrdu && name && URDU_SCRIPT.test(name)) {
    nameUrdu = name
    name = ''
  }
  return { name, nameUrdu }
}

function mapApiProduct(p: Record<string, unknown>, index: number): ScannedProduct {
  const { name, nameUrdu } = splitScannedNames(
    String(p.name || ''),
    String(p.nameUrdu || ''),
  )
  const numStr = (v: unknown) =>
    v !== undefined && v !== null && v !== '' ? String(v) : ''

  return {
    id: `scan-${index}-${Date.now()}`,
    name,
    nameUrdu,
    barcode: String(p.barcode || '').trim(),
    price: numStr(p.price),
    cost: numStr(p.cost),
    stockQuantity: numStr(p.stockQuantity),
    unit: String(p.unit || 'pcs').trim() || 'pcs',
    category: String(p.category || '').trim(),
    description: String(p.description || '').trim(),
  }
}

function rowHasName(row: ScannedProduct) {
  return Boolean(row.name.trim() || row.nameUrdu.trim())
}

async function enrichRowsWithEnglish(rows: ScannedProduct[]): Promise<ScannedProduct[]> {
  const next = rows.map((row) => ({ ...row }))
  await Promise.all(
    next.map(async (row, index) => {
      if (row.name.trim() || !row.nameUrdu.trim()) return
      const english = await fetchEnglishNameSuggestion(row.nameUrdu)
      if (english) {
        next[index] = { ...row, name: english }
      }
    }),
  )
  return next
}

export function ProductAiScanDialog({
  open,
  onOpenChange,
  onImport,
}: ProductAiScanDialogProps) {
  const { t } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const translateTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingFocusRef = useRef<{ rowId: string; field: keyof ScannedProduct } | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [translatingRowId, setTranslatingRowId] = useState<string | null>(null)
  const [rows, setRows] = useState<ScannedProduct[]>([])
  const [step, setStep] = useState<'upload' | 'review'>('upload')

  const setImage = useCallback((file: File) => {
    setImageFile(file)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setRows([])
    setStep('upload')
  }, [])

  const resetDialog = useCallback(() => {
    Object.values(translateTimersRef.current).forEach(clearTimeout)
    translateTimersRef.current = {}
    setImageFile(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setRows([])
    setStep('upload')
    setScanning(false)
    setImporting(false)
    setTranslatingRowId(null)
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
        `${import.meta.env.VITE_BACKEND_URL}/products/scan-image`,
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

      const products = Array.isArray(data.products) ? data.products : []
      if (products.length === 0) {
        toast.error(t('no_products_found_in_image'))
        return
      }

      const mapped = products.map(mapApiProduct)
      setRows(await enrichRowsWithEnglish(mapped))
      setStep('review')
      toast.success(
        `${t('ai_scan_success')}: ${products.length} ${t('products_found')}`,
      )
    } catch (error) {
      console.error('AI scan error:', error)
      toast.error(error instanceof Error ? error.message : t('ai_scan_failed'))
    } finally {
      setScanning(false)
    }
  }, [imageFile, t])

  const updateRow = (id: string, field: keyof ScannedProduct, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    )
  }

  const handleEnglishNameChange = (id: string, value: string) => {
    updateRow(id, 'name', value)

    if (translateTimersRef.current[id]) {
      clearTimeout(translateTimersRef.current[id])
    }

    translateTimersRef.current[id] = setTimeout(async () => {
      const trimmed = value.trim()
      if (trimmed.length < 2 || !/[A-Za-z]/.test(trimmed)) {
        setTranslatingRowId(null)
        return
      }
      setTranslatingRowId(id)
      const translated = await fetchUrduNameSuggestion(trimmed)
      if (translated) {
        updateRow(id, 'nameUrdu', translated)
      }
      setTranslatingRowId((current) => (current === id ? null : current))
    }, 450)
  }

  const removeRow = (id: string) => {
    if (translateTimersRef.current[id]) {
      clearTimeout(translateTimersRef.current[id])
      delete translateTimersRef.current[id]
    }
    setRows((prev) => prev.filter((row) => row.id !== id))
  }

  const focusRowField = useCallback((rowId: string, field: keyof ScannedProduct) => {
    const el = document.querySelector(
      `[data-scan-row="${rowId}"][data-scan-field="${field}"]`,
    ) as HTMLInputElement | null
    el?.focus()
    el?.select()
  }, [])

  useEffect(() => {
    if (!pendingFocusRef.current) return
    const target = pendingFocusRef.current
    pendingFocusRef.current = null
    requestAnimationFrame(() => focusRowField(target.rowId, target.field))
  }, [rows, focusRowField])

  const addRow = useCallback((focusName = false) => {
    const newRow = createEmptyRow()
    setRows((prev) => [...prev, newRow])
    if (focusName) {
      pendingFocusRef.current = { rowId: newRow.id, field: 'name' }
    }
    return newRow
  }, [])

  const startManualEntry = useCallback(() => {
    const initial = Array.from({ length: MANUAL_START_ROW_COUNT }, () => createEmptyRow())
    setRows(initial)
    setStep('review')
    pendingFocusRef.current = { rowId: initial[0].id, field: 'name' }
  }, [])

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: keyof ScannedProduct,
  ) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()

    const fieldIndex = ROW_NAV_FIELDS.indexOf(field)
    const isLastRow = rowIndex === rows.length - 1

    if (isLastRow) {
      addRow(true)
      return
    }

    if (fieldIndex < ROW_NAV_FIELDS.length - 1) {
      focusRowField(rows[rowIndex].id, ROW_NAV_FIELDS[fieldIndex + 1])
      return
    }

    focusRowField(rows[rowIndex + 1].id, 'name')
  }

  const parseRowNumber = (value: string, fieldLabel: string, rowNum: number): number | null => {
    const trimmed = value.trim()
    if (!trimmed) return 0
    const parsed = Number(trimmed.replace(/,/g, ''))
    if (Number.isNaN(parsed)) {
      toast.error(`${t('row')} ${rowNum}: ${fieldLabel} — ${t('price_must_be_positive')}`)
      return null
    }
    if (parsed < 0) {
      toast.error(`${t('row')} ${rowNum}: ${fieldLabel} — ${t('price_must_be_positive')}`)
      return null
    }
    return parsed
  }

  const buildImportPayload = (): Record<string, string | number>[] | null => {
    const valid: Record<string, string | number>[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!rowHasName(row)) continue

      const rowNum = i + 1
      const name = row.name.trim() || row.nameUrdu.trim()
      const price = parseRowNumber(row.price, t('sale_price'), rowNum)
      if (price === null) return null
      const cost = parseRowNumber(row.cost, t('purchase_price'), rowNum)
      if (cost === null) return null
      const stockQuantity = parseRowNumber(row.stockQuantity, t('stock_quantity'), rowNum)
      if (stockQuantity === null) return null

      const payload: Record<string, string | number> = {
        name,
        price,
        cost,
        stockQuantity,
        barcode: row.barcode.trim() || generateBarcode(),
        unit: row.unit.trim() || 'pcs',
      }

      if (row.nameUrdu.trim()) payload.nameUrdu = row.nameUrdu.trim()
      if (row.category.trim()) payload.category = row.category.trim()
      if (row.description.trim()) payload.description = row.description.trim()

      valid.push(payload)
    }

    if (valid.length === 0) {
      toast.error(t('no_products_to_import'))
      return null
    }

    return valid
  }

  const handleImport = useCallback(async () => {
    const products = buildImportPayload()
    if (!products) return

    try {
      setImporting(true)
      await onImport(products)
      toast.success(
        `${t('import_successful')}: ${products.length} ${t('products_imported')}`,
      )
      resetDialog()
      onOpenChange(false)
    } catch (error) {
      console.error('Import error:', error)
      toast.error(t('error_importing_products'))
    } finally {
      setImporting(false)
    }
  }, [rows, onImport, onOpenChange, resetDialog, t])

  const importCount = rows.filter(rowHasName).length

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetDialog()
        onOpenChange(isOpen)
      }}
    >
      <DialogContent className={FULLSCREEN_DIALOG_CLASS}>
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 sm:py-4">
          <DialogHeader className="shrink-0 space-y-1 text-left pb-2">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              {t('ai_scan_products')}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {t('ai_scan_products_description')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            {step === 'upload' && (
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 overflow-y-auto">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{t('ai_scan_products_tip')}</AlertDescription>
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
                  <div className="max-h-64 overflow-hidden rounded-lg border">
                    <img
                      src={previewUrl}
                      alt={t('product_list_preview')}
                      className="max-h-64 w-full bg-muted object-contain"
                    />
                  </div>
                )}

                {imageFile && (
                  <p className="text-sm text-muted-foreground">
                    {t('selected_file')}: {imageFile.name}
                  </p>
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

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={scanning}
                  onClick={startManualEntry}
                >
                  <PenLine className="mr-2 h-4 w-4" />
                  {t('add_products_manually')}
                </Button>
              </div>
            )}

            {step === 'review' && (
              <>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {t('review_and_edit_products')}: {rows.length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('name_in_urdu_hint')} · {t('bulk_entry_enter_hint')}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => addRow(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    {t('add_row')}
                  </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
                  <Table className="w-full min-w-[1100px] text-sm">
                    <TableHeader className="sticky top-0 z-10 bg-muted">
                      <TableRow>
                        <TableHead className="min-w-[140px] whitespace-nowrap px-2 py-2">
                          {t('product_name')} (English) *
                        </TableHead>
                        <TableHead className="min-w-[130px] whitespace-nowrap px-2 py-2">
                          {t('name_in_urdu')}
                        </TableHead>
                        <TableHead className="min-w-[80px] whitespace-nowrap px-2 py-2">
                          {t('sale_price')}
                        </TableHead>
                        <TableHead className="min-w-[80px] whitespace-nowrap px-2 py-2">
                          {t('purchase_price')}
                        </TableHead>
                        <TableHead className="min-w-[72px] whitespace-nowrap px-2 py-2">
                          {t('stock')}
                        </TableHead>
                        <TableHead className="min-w-[100px] whitespace-nowrap px-2 py-2">
                          {t('barcode')}
                        </TableHead>
                        <TableHead className="min-w-[64px] whitespace-nowrap px-2 py-2">
                          {t('unit')}
                        </TableHead>
                        <TableHead className="min-w-[90px] whitespace-nowrap px-2 py-2">
                          {t('category')}
                        </TableHead>
                        <TableHead className="min-w-[100px] whitespace-nowrap px-2 py-2">
                          {t('description')}
                        </TableHead>
                        <TableHead className="w-10 px-1 py-2" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, rowIndex) => (
                        <TableRow key={row.id} className="hover:bg-muted/30">
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              value={row.name}
                              data-scan-row={row.id}
                              data-scan-field="name"
                              onChange={(e) => handleEnglishNameChange(row.id, e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'name')}
                              placeholder={t('product_name')}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <div className="relative">
                              <Input
                                value={row.nameUrdu}
                                data-scan-row={row.id}
                                data-scan-field="nameUrdu"
                                onChange={(e) => updateRow(row.id, 'nameUrdu', e.target.value)}
                                onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'nameUrdu')}
                                placeholder={t('name_in_urdu_placeholder')}
                                dir="rtl"
                                className="h-8 text-right text-sm font-medium"
                              />
                              {translatingRowId === row.id && (
                                <Loader2 className="absolute left-1.5 top-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              type="number"
                              value={row.price}
                              data-scan-row={row.id}
                              data-scan-field="price"
                              onChange={(e) => updateRow(row.id, 'price', e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'price')}
                              placeholder="0"
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              type="number"
                              value={row.cost}
                              data-scan-row={row.id}
                              data-scan-field="cost"
                              onChange={(e) => updateRow(row.id, 'cost', e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'cost')}
                              placeholder="0"
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              type="number"
                              value={row.stockQuantity}
                              data-scan-row={row.id}
                              data-scan-field="stockQuantity"
                              onChange={(e) =>
                                updateRow(row.id, 'stockQuantity', e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'stockQuantity')}
                              placeholder="0"
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              value={row.barcode}
                              data-scan-row={row.id}
                              data-scan-field="barcode"
                              onChange={(e) => updateRow(row.id, 'barcode', e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'barcode')}
                              placeholder={t('barcode')}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              value={row.unit}
                              data-scan-row={row.id}
                              data-scan-field="unit"
                              onChange={(e) => updateRow(row.id, 'unit', e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'unit')}
                              placeholder="pcs"
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              value={row.category}
                              data-scan-row={row.id}
                              data-scan-field="category"
                              onChange={(e) => updateRow(row.id, 'category', e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'category')}
                              placeholder={t('category')}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1 align-middle">
                            <Input
                              value={row.description}
                              data-scan-row={row.id}
                              data-scan-field="description"
                              onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'description')}
                              placeholder={t('description')}
                              className="h-8 text-sm"
                            />
                          </TableCell>
                          <TableCell className="px-1 py-1 align-middle">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removeRow(row.id)}
                              aria-label={t('delete')}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <p className="shrink-0 text-[11px] text-muted-foreground">
                  {t('ai_scan_products_barcode_note')}
                </p>
              </>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t pt-3 sm:justify-end">
            {step === 'review' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('upload')}
                disabled={importing}
              >
                {t('back')}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={importing || scanning}
            >
              {t('cancel')}
            </Button>
            {step === 'review' && (
              <Button onClick={handleImport} disabled={importing || importCount === 0}>
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('importing')}...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {t('import')} ({importCount})
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
