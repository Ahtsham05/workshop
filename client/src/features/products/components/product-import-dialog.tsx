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

interface ProductImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (products: any[]) => Promise<void>
}

interface ImportProduct {
  name: string
  barcode?: string | null
  price: number
  cost: number
  stockQuantity: number
  category?: string
  categories?: any[]
  unit?: string
  sku?: string
  supplier?: string | null
  lowStockThreshold?: number
  description?: string
}

interface ValidationError {
  row: number
  field: string
  message: string
}

export function ProductImportDialog({ open, onOpenChange, onImport }: ProductImportDialogProps) {
  const { t } = useLanguage()
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [parsedData, setParsedData] = useState<ImportProduct[]>([])
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [parseSuccess, setParseSuccess] = useState(false)

  const downloadTemplate = useCallback(() => {
    const template = [
      {
        name: 'Sample Product 1',
        barcode: '1234567890',
        price: 100,
        cost: 80,
        stockQuantity: 50,
        category: 'Electronics',
        unit: 'pcs',
        sku: 'SKU001',
        lowStockThreshold: 10,
        description: 'Sample product description'
      },
      {
        name: 'Sample Product 2',
        barcode: '0987654321',
        price: 250,
        cost: 200,
        stockQuantity: 30,
        category: 'Accessories',
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
      { wch: 20 }, // barcode
      { wch: 15 }, // price
      { wch: 15 }, // cost
      { wch: 18 }, // stockQuantity
      { wch: 20 }, // category
      { wch: 12 }, // unit
      { wch: 15 }, // sku
      { wch: 20 }, // lowStockThreshold
      { wch: 35 }  // description
    ]
    ws['!cols'] = colWidths

    XLSX.writeFile(wb, 'products-import-template.xlsx')
    toast.success(t('template_downloaded'))
  }, [t])

  const validateProduct = (product: any, rowIndex: number): ValidationError[] => {
    const errors: ValidationError[] = []

    // Required fields
    if (!product.name || product.name.toString().trim() === '') {
      errors.push({ row: rowIndex, field: 'name', message: t('product_name_required') })
    }

    if (product.price === undefined || product.price === null || product.price === '') {
      errors.push({ row: rowIndex, field: 'price', message: t('price_required') })
    } else if (isNaN(Number(product.price)) || Number(product.price) < 0) {
      errors.push({ row: rowIndex, field: 'price', message: t('price_must_be_positive') })
    }

    if (product.cost === undefined || product.cost === null || product.cost === '') {
      errors.push({ row: rowIndex, field: 'cost', message: t('cost_required') })
    } else if (isNaN(Number(product.cost)) || Number(product.cost) < 0) {
      errors.push({ row: rowIndex, field: 'cost', message: t('cost_must_be_positive') })
    }

    if (product.stockQuantity === undefined || product.stockQuantity === null || product.stockQuantity === '') {
      errors.push({ row: rowIndex, field: 'stockQuantity', message: t('stock_quantity_required') })
    } else if (isNaN(Number(product.stockQuantity)) || Number(product.stockQuantity) < 0) {
      errors.push({ row: rowIndex, field: 'stockQuantity', message: t('stock_must_be_positive') })
    }

    // Optional field validation
    if (product.lowStockThreshold !== undefined && product.lowStockThreshold !== null && product.lowStockThreshold !== '') {
      if (isNaN(Number(product.lowStockThreshold)) || Number(product.lowStockThreshold) < 0) {
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
  }

  const parseFile = useCallback(async () => {
    if (!file) {
      toast.error(t('please_select_file'))
      return
    }

    try {
      setImporting(true)
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
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
                                 (isNaN(Number(firstRow.price)) && firstRow.price !== '' && firstRow.price !== null)
        
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
        
        // Skip rows that don't have at least a name
        if (!row.name || row.name.toString().trim() === '') {
          return
        }
        
        const rowErrors = validateProduct(row, index + rowOffset)
        
        if (rowErrors.length > 0) {
          allErrors.push(...rowErrors)
        } else {
          const product: ImportProduct = {
            name: row.name.toString().trim(),
            barcode: row.barcode?.toString().trim() || null,
            price: Number(row.price),
            cost: Number(row.cost),
            stockQuantity: Number(row.stockQuantity),
            unit: row.unit?.toString().trim() || 'pcs',
          }
          
          // Add optional fields only if they have values
          if (row.category?.toString().trim()) {
            product.category = row.category.toString().trim()
          }
          if (row.sku?.toString().trim()) {
            product.sku = row.sku.toString().trim()
          }
          if (row.description?.toString().trim()) {
            product.description = row.description.toString().trim()
          }
          if (row.lowStockThreshold && !isNaN(Number(row.lowStockThreshold))) {
            product.lowStockThreshold = Number(row.lowStockThreshold)
          }
          
          products.push(product)
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

    try {
      setImporting(true)
      await onImport(parsedData)
      toast.success(`${t('import_successful')}: ${parsedData.length} products imported`)
      
      // Reset state
      setFile(null)
      setParsedData([])
      setErrors([])
      setParseSuccess(false)
      onOpenChange(false)
    } catch (error) {
      console.error('Error importing products:', error)
      toast.error(t('error_importing_products'))
    } finally {
      setImporting(false)
    }
  }, [parsedData, onImport, onOpenChange, t])

  const resetDialog = () => {
    setFile(null)
    setParsedData([])
    setErrors([])
    setParseSuccess(false)
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
                        <div className="font-medium">{product.name}</div>
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
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            {t('cancel')}
          </Button>
          {parseSuccess && (
            <Button
              onClick={handleImport}
              disabled={importing || parsedData.length === 0}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('importing')}...
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
