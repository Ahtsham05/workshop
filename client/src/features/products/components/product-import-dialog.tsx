import { useState, useCallback } from 'react'
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
import { Upload, Download, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import * as XLSX from 'xlsx'

interface BulkImportResult {
  insertedCount?: number
  errors?: Array<{ index: number; error?: string; name?: string; barcode?: string | null }>
  warnings?: Array<{ index: number; name?: string; message: string }>
  createdCategories?: string[]
  createdSubCategories?: string[]
}

interface ProductImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (products: any[]) => Promise<BulkImportResult | void>
}

interface ImportProduct {
  // Original row number in the uploaded file — for local display only, stripped
  // before the product objects are sent to the API.
  _row: number
  name: string
  nameUrdu?: string
  barcode?: string | null
  price: number
  cost: number
  stockQuantity: number
  // Free-text names — the server resolves these to real Category/SubCategory records,
  // auto-creating whichever ones don't already exist, rather than requiring the file to
  // reference an existing category by id.
  category?: string
  subCategory?: string
  categories?: any[]
  unit?: string
  sku?: string
  // Free-text supplier name, matched case-insensitively against existing suppliers on
  // the server. Unlike categories, an unmatched supplier is never auto-created (a
  // supplier needs contact/payment details a spreadsheet row can't supply) — the
  // product still imports, just without a supplier link.
  supplier?: string | null
  lowStockThreshold?: number
  description?: string
}

interface ValidationError {
  row: number
  field: string
  message: string
}

interface ImportRowError {
  row: number
  name: string
  message: string
}

// Sent in batches rather than one giant request: production runs the API behind a
// serverless platform that hard-caps request body size well below what a multi-thousand
// row spreadsheet produces as a single JSON payload — that request gets rejected outright
// (shows up in the browser as a cancelled request) before ever reaching the server code.
// 500 matches the server's own internal insertMany() chunk size (see
// BULK_IMPORT_CHUNK_SIZE in product.service.js), so each request maps to exactly one
// database batch there too.
const IMPORT_BATCH_SIZE = 500

export function ProductImportDialog({ open, onOpenChange, onImport }: ProductImportDialogProps) {
  const { t } = useLanguage()
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [parsedData, setParsedData] = useState<ImportProduct[]>([])
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [parseSuccess, setParseSuccess] = useState(false)
  const [importErrors, setImportErrors] = useState<ImportRowError[]>([])
  const [importedCount, setImportedCount] = useState(0)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)

  const downloadTemplate = useCallback(() => {
    const template = [
      {
        name: 'Sample Product 1',
        nameUrdu: 'سیمپل پروڈکٹ 1',
        barcode: '1234567890',
        price: 100,
        cost: 80,
        stockQuantity: 50,
        category: 'Electronics',
        subCategory: 'Mobile Accessories',
        supplier: 'Acme Distributors',
        unit: 'pcs',
        sku: 'SKU001',
        lowStockThreshold: 10,
        description: 'Sample product description'
      },
      {
        name: 'Sample Product 2',
        nameUrdu: 'سیمپل پروڈکٹ 2',
        barcode: '0987654321',
        price: 250,
        cost: 200,
        stockQuantity: 30,
        category: 'Accessories',
        subCategory: '',
        supplier: '',
        unit: 'pcs',
        sku: 'SKU002',
        lowStockThreshold: 5,
        description: 'Another sample product'
      }
    ]

    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')

    // Auto-size columns
    const colWidths = [
      { wch: 30 }, // name
      { wch: 25 }, // nameUrdu
      { wch: 20 }, // barcode
      { wch: 15 }, // price
      { wch: 15 }, // cost
      { wch: 18 }, // stockQuantity
      { wch: 20 }, // category
      { wch: 22 }, // subCategory
      { wch: 22 }, // supplier
      { wch: 12 }, // unit
      { wch: 15 }, // sku
      { wch: 20 }, // lowStockThreshold
      { wch: 35 }  // description
    ]
    ws['!cols'] = colWidths

    XLSX.writeFile(wb, 'products-import-template.xlsx')
    toast.success(t('template_downloaded'))
  }, [t])

  // Strips currency symbols, thousands separators, and stray whitespace from a
  // spreadsheet cell (e.g. "Rs 62,000", "1,250.50") before it's treated as a number —
  // real-world exports routinely carry this kind of formatting.
  const cleanNumber = (raw: unknown): number => {
    if (raw === undefined || raw === null || raw === '') return NaN
    if (typeof raw === 'number') return raw
    const cleaned = String(raw).replace(/[^0-9.-]/g, '')
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN
    return Number(cleaned)
  }

  const validateProduct = (product: any, rowIndex: number): ValidationError[] => {
    const errors: ValidationError[] = []

    // Required fields
    if (!product.name || product.name.toString().trim() === '') {
      errors.push({ row: rowIndex, field: 'name', message: t('product_name_required') })
    }

    if (product.price === undefined || product.price === null || product.price === '') {
      errors.push({ row: rowIndex, field: 'price', message: t('price_required') })
    } else if (isNaN(cleanNumber(product.price)) || cleanNumber(product.price) < 0) {
      errors.push({ row: rowIndex, field: 'price', message: t('price_must_be_positive') })
    }

    if (product.cost === undefined || product.cost === null || product.cost === '') {
      errors.push({ row: rowIndex, field: 'cost', message: t('cost_required') })
    } else if (isNaN(cleanNumber(product.cost)) || cleanNumber(product.cost) < 0) {
      errors.push({ row: rowIndex, field: 'cost', message: t('cost_must_be_positive') })
    }

    if (product.stockQuantity === undefined || product.stockQuantity === null || product.stockQuantity === '') {
      errors.push({ row: rowIndex, field: 'stockQuantity', message: t('stock_quantity_required') })
    } else if (isNaN(cleanNumber(product.stockQuantity)) || cleanNumber(product.stockQuantity) < 0) {
      errors.push({ row: rowIndex, field: 'stockQuantity', message: t('stock_must_be_positive') })
    }

    // Optional field validation
    if (product.lowStockThreshold !== undefined && product.lowStockThreshold !== null && product.lowStockThreshold !== '') {
      if (isNaN(cleanNumber(product.lowStockThreshold)) || cleanNumber(product.lowStockThreshold) < 0) {
        errors.push({ row: rowIndex, field: 'lowStockThreshold', message: t('low_stock_must_be_positive') })
      }
    }

    return errors
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    // Check file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ]
    
    if (!validTypes.includes(selectedFile.type) && 
        !selectedFile.name.endsWith('.xlsx') && 
        !selectedFile.name.endsWith('.xls') && 
        !selectedFile.name.endsWith('.csv')) {
      toast.error(t('invalid_file_type'))
      return
    }

    setFile(selectedFile)
    setParseSuccess(false)
    setParsedData([])
    setErrors([])
    setImportErrors([])
    setImportedCount(0)
  }

  const parseFile = useCallback(async () => {
    if (!file) {
      toast.error(t('please_select_file'))
      return
    }

    try {
      setImporting(true)
      setImportErrors([])
      setImportedCount(0)
      const data = await file.arrayBuffer()
      // codepage 65001 (UTF-8) is required so non-Latin text (e.g. Urdu) in
      // CSV files isn't misread as a legacy codepage and turned into "?"/mojibake
      const workbook = XLSX.read(data, { type: 'array', codepage: 65001 })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

      if (jsonData.length === 0) {
        toast.error(t('file_is_empty'))
        setImporting(false)
        return
      }

      // Skip header rows - detect if first row is a header by checking if price/cost/stockQuantity are non-numeric
      let dataToProcess = jsonData
      let rowOffset = 1 // Excel rows start at 1
      
      if (jsonData[0]) {
        const firstRow = jsonData[0] as any
        const firstRowName = firstRow.name?.toString().toLowerCase() || ''
        const priceValue = firstRow.price?.toString().toLowerCase() || ''
        const costValue = firstRow.cost?.toString().toLowerCase() || ''
        const stockValue = firstRow.stockQuantity?.toString().toLowerCase() || ''
        
        // Skip header if name field matches header patterns OR numeric fields contain text
        const isHeaderByName = firstRowName === 'name' || 
                               firstRowName.includes('product name') || 
                               firstRowName.includes('required')
        const isHeaderByValues = priceValue === 'price' ||
                                 costValue === 'cost' ||
                                 stockValue === 'stockquantity' ||
                                 (isNaN(cleanNumber(firstRow.price)) && firstRow.price !== '' && firstRow.price !== null)
        
        if (isHeaderByName || isHeaderByValues) {
          dataToProcess = jsonData.slice(1)
          rowOffset = 2 // We skipped header, so data starts at row 2
        }
      }

      // Validate and parse products
      const products: ImportProduct[] = []
      const allErrors: ValidationError[] = []

      dataToProcess.forEach((row: any, index: number) => {
        // Skip completely empty rows
        const hasAnyData = Object.values(row).some(val => val !== '' && val !== null && val !== undefined)
        if (!hasAnyData) {
          return
        }

        const rowErrors = validateProduct(row, index + rowOffset)

        if (rowErrors.length > 0) {
          allErrors.push(...rowErrors)
        } else {
          const product: ImportProduct = {
            _row: index + rowOffset,
            name: row.name.toString().trim(),
            barcode: row.barcode?.toString().trim() || null,
            price: cleanNumber(row.price),
            cost: cleanNumber(row.cost),
            stockQuantity: cleanNumber(row.stockQuantity),
            unit: row.unit?.toString().trim() || 'pcs',
          }

          // Add optional fields only if they have values
          if (row.nameUrdu?.toString().trim()) {
            product.nameUrdu = row.nameUrdu.toString().trim()
          }
          if (row.category?.toString().trim()) {
            product.category = row.category.toString().trim()
          }
          if (row.subCategory?.toString().trim()) {
            product.subCategory = row.subCategory.toString().trim()
          }
          if (row.supplier?.toString().trim()) {
            product.supplier = row.supplier.toString().trim()
          }
          if (row.sku?.toString().trim()) {
            product.sku = row.sku.toString().trim()
          }
          if (row.description?.toString().trim()) {
            product.description = row.description.toString().trim()
          }
          if (row.lowStockThreshold !== undefined && row.lowStockThreshold !== null && row.lowStockThreshold !== '' && !isNaN(cleanNumber(row.lowStockThreshold))) {
            product.lowStockThreshold = cleanNumber(row.lowStockThreshold)
          }

          products.push(product)
        }
      })

      // Duplicate barcodes within the file itself would otherwise only surface as an
      // opaque "already used by another product" failure at import time — catch them
      // here instead, while we still know which two rows collided.
      const firstRowForBarcode = new Map<string, number>()
      products.forEach((product) => {
        if (!product.barcode) return
        const seenAtRow = firstRowForBarcode.get(product.barcode)
        if (seenAtRow === undefined) {
          firstRowForBarcode.set(product.barcode, product._row)
        } else {
          allErrors.push({
            row: product._row,
            field: 'barcode',
            message: t('duplicate_barcode_in_file_message', { barcode: product.barcode, row: seenAtRow })
          })
        }
      })

      if (allErrors.length > 0) {
        setErrors(allErrors)
        toast.error(`${t('validation_errors')}: ${allErrors.length} errors found`)
      } else {
        setParsedData(products)
        setParseSuccess(true)
        toast.success(`${t('file_parsed_successfully')}: ${products.length} products ready to import`)
      }

      setImporting(false)
    } catch (error) {
      console.error('Error parsing file:', error)
      toast.error(t('error_parsing_file'))
      setImporting(false)
    }
  }, [file, t])

  const handleImport = useCallback(async () => {
    if (parsedData.length === 0) {
      toast.error(t('no_products_to_import'))
      return
    }

    setImporting(true)
    const totalSubmitted = parsedData.length
    // _row only exists for local display — the API doesn't know about it.
    const productsToSend = parsedData.map(({ _row, ...rest }) => rest)

    const batches: any[][] = []
    for (let i = 0; i < productsToSend.length; i += IMPORT_BATCH_SIZE) {
      batches.push(productsToSend.slice(i, i + IMPORT_BATCH_SIZE))
    }

    let inserted = 0
    let warningsCount = 0
    const rowErrors: ImportRowError[] = []
    const createdCategories = new Set<string>()
    const createdSubCategories = new Set<string>()
    let stoppedEarly = false

    setImportProgress({ done: 0, total: totalSubmitted })

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]
      const indexOffset = b * IMPORT_BATCH_SIZE
      try {
        const result = await onImport(batch)
        inserted += result?.insertedCount ?? 0

        const failed = result?.errors || []
        failed.forEach((err) => {
          const source = parsedData[indexOffset + err.index]
          rowErrors.push({
            row: source?._row ?? indexOffset + err.index + 1,
            name: source?.name || err.name || '',
            message: err.error || t('unknown_error')
          })
        })

        const batchCreatedCategories = result?.createdCategories || []
        const batchCreatedSubCategories = result?.createdSubCategories || []
        batchCreatedCategories.forEach((c) => createdCategories.add(c))
        batchCreatedSubCategories.forEach((c) => createdSubCategories.add(c))
        warningsCount += result?.warnings?.length || 0

        setImportProgress({ done: Math.min(indexOffset + batch.length, totalSubmitted), total: totalSubmitted })
      } catch (error) {
        // Stop sending further batches, but keep whatever already succeeded — those
        // rows are really saved, and must not be silently dropped from the summary.
        console.error('Error importing product batch:', error)
        stoppedEarly = true
        batch.forEach((product, i) => {
          const source = parsedData[indexOffset + i]
          rowErrors.push({
            row: source?._row ?? indexOffset + i + 1,
            name: source?.name || product.name || '',
            message: error instanceof Error ? error.message : t('error_importing_products')
          })
        })
        break
      }
    }

    setImportProgress(null)
    setImportErrors(rowErrors)
    setImportedCount(inserted)

    if (inserted === 0) {
      toast.error(t('import_failed_all_products'))
    } else if (stoppedEarly) {
      toast.error(t('import_stopped_early_message', { inserted, total: totalSubmitted }))
    } else if (rowErrors.length > 0) {
      toast.warning(t('products_imported_with_errors_message', {
        inserted,
        total: totalSubmitted,
        failed: rowErrors.length
      }))
    } else {
      toast.success(`${t('import_successful')}: ${inserted} ${t('products_imported')}`)
    }

    // Categories/sub-categories referenced by name in the file are auto-created on
    // the server when they don't already exist — surface that so it isn't a silent
    // side effect the user only discovers later on the Categories page.
    if (createdCategories.size || createdSubCategories.size) {
      const parts = []
      if (createdCategories.size) parts.push(`${createdCategories.size} ${t('categories')}`)
      if (createdSubCategories.size) parts.push(`${createdSubCategories.size} ${t('subcategories')}`)
      toast.info(`${t('created')}: ${parts.join(', ')}`)
    }

    // Non-fatal per-row notes (an unrecognized unit that was defaulted, a supplier
    // name that didn't match any existing supplier) — the row still imported, this is
    // just visibility into what the server had to guess or skip.
    if (warningsCount > 0) {
      toast.info(t('products_imported_with_notes', { count: String(warningsCount) }))
    }

    // Clear the file and parsed preview either way — the rows that succeeded are
    // already saved, so re-parsing and re-clicking Import must not be possible, or
    // it would silently re-insert them as duplicates. Only a fully successful run
    // closes the dialog; a partial run stays open (file cleared) showing what failed,
    // so the user has to explicitly pick a (corrected) file to try again.
    setFile(null)
    setParsedData([])
    setParseSuccess(false)
    setErrors([])
    if (rowErrors.length === 0) {
      onOpenChange(false)
    }

    setImporting(false)
  }, [parsedData, onImport, onOpenChange, t])

  const resetDialog = () => {
    setFile(null)
    setParsedData([])
    setErrors([])
    setParseSuccess(false)
    setImportErrors([])
    setImportedCount(0)
    setImportProgress(null)
  }

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetDialog()
      onOpenChange(open)
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t('import_products_from_excel')}</DialogTitle>
          <DialogDescription>
            {t('upload_excel_file_to_import_products')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          <Alert>
            <Download className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{t('download_template_first')}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
              >
                <Download className="h-4 w-4 mr-2" />
                {t('download_template')}
              </Button>
            </AlertDescription>
          </Alert>

          {/* File Upload */}
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="excel-file">{t('select_excel_file')}</Label>
            <Input
              id="excel-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              disabled={importing}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                {t('selected_file')}: {file.name}
              </p>
            )}
          </div>

          {/* Parse Button */}
          {file && !parseSuccess && errors.length === 0 && (
            <Button
              onClick={parseFile}
              disabled={importing}
              className="w-full"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('parsing')}...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {t('parse_and_validate')}
                </>
              )}
            </Button>
          )}

          {/* Validation Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">{t('validation_errors')} ({errors.length} {t('found_in_excel_file')})</div>
                <ScrollArea className="h-40">
                  <div className="space-y-1">
                    {errors.map((error, index) => (
                      <div key={index} className="text-xs">
                        {t('row')} {error.row}, {t('field')}: {error.field} - {error.message}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {/* Success Preview */}
          {parseSuccess && parsedData.length > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <div className="font-semibold mb-2 text-green-600">
                  {t('ready_to_import')}: {parsedData.length} products
                </div>
                <ScrollArea className="h-40">
                  <div className="space-y-2">
                    {parsedData.slice(0, 10).map((product, index) => (
                      <div key={index} className="text-xs border-b pb-1">
                        <div className="font-medium">{product.name}{product.nameUrdu && <span className="text-muted-foreground mr-2 font-normal"> · <span dir="rtl">{product.nameUrdu}</span></span>}</div>
                        <div className="text-muted-foreground">
                          Price: Rs{product.price} | Cost: Rs{product.cost} | Stock: {product.stockQuantity}
                          {product.barcode && ` | Barcode: ${product.barcode}`}
                        </div>
                      </div>
                    ))}
                    {parsedData.length > 10 && (
                      <div className="text-xs text-muted-foreground">
                        ... and {parsedData.length - 10} more products
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {/* Warning */}
          {parseSuccess && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('warning_existing_products')}
              </AlertDescription>
            </Alert>
          )}

          {/* Import Result */}
          {(importedCount > 0 || importErrors.length > 0) && !parseSuccess && (
            <Alert variant={importErrors.length > 0 ? 'destructive' : undefined}>
              {importErrors.length > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />}
              <AlertDescription>
                <div className={`font-semibold mb-2 ${importErrors.length === 0 ? 'text-green-600' : ''}`}>
                  {importErrors.length > 0
                    ? t('import_completed_with_errors')
                    : `${t('import_successful')}: ${importedCount} ${t('products_imported')}`}
                </div>
                {importErrors.length > 0 && (
                  <>
                    <div className="text-xs text-muted-foreground mb-2">
                      {t('products_imported_with_errors_message', {
                        inserted: importedCount,
                        total: importedCount + importErrors.length,
                        failed: importErrors.length
                      })}
                    </div>
                    <ScrollArea className="h-40">
                      <div className="space-y-1">
                        {importErrors.slice(0, 50).map((err, index) => (
                          <div key={index} className="text-xs">
                            {t('row')} {err.row}{err.name ? ` (${err.name})` : ''}: {err.message}
                          </div>
                        ))}
                        {importErrors.length > 50 && (
                          <div className="text-xs text-muted-foreground">
                            ... and {importErrors.length - 50} more
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            {importErrors.length > 0 || importedCount > 0 ? t('close') : t('cancel')}
          </Button>
          {parseSuccess && (
            <Button
              onClick={handleImport}
              disabled={importing || parsedData.length === 0}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {importProgress
                    ? t('importing_progress', { done: importProgress.done, total: importProgress.total })
                    : `${t('importing')}...`}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {t('import')} ({parsedData.length})
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
