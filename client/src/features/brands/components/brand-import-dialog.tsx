import { useCallback, useState } from 'react'
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
import toast from 'react-hot-toast'
import { Upload, Download, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useBrands } from '../context/brands-context'
import { useBulkAddBrandsMutation } from '@/stores/brand.api'
import * as XLSX from 'xlsx'

interface ImportBrand {
  _row: number
  name: string
  country?: string
  website?: string
  contactPerson?: string
  email?: string
  phone?: string
  description?: string
}

interface ValidationError {
  row: number
  field: string
  message: string
}

interface ImportRowNote {
  row: number
  name: string
  message: string
}

// Same production-safety batching as the products/categories/sub-categories import
// dialogs — a single request carrying the whole file gets rejected outright on the
// serverless platform once the payload grows past its body-size cap.
const IMPORT_BATCH_SIZE = 500

export function BrandImportDialog() {
  const { state, dispatch: contextDispatch } = useBrands()
  const [bulkAddBrands] = useBulkAddBrandsMutation()

  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [parsedData, setParsedData] = useState<ImportBrand[]>([])
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [parseSuccess, setParseSuccess] = useState(false)
  const [importErrors, setImportErrors] = useState<ImportRowNote[]>([])
  const [importNotes, setImportNotes] = useState<ImportRowNote[]>([])
  const [importedCount, setImportedCount] = useState(0)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)

  const open = state.importOpen
  const onOpenChange = (next: boolean) => contextDispatch({ type: 'SET_IMPORT_OPEN', payload: next })

  const downloadTemplate = useCallback(() => {
    const template = [
      { name: 'Samsung', country: 'South Korea', website: 'https://samsung.com', contactPerson: '', email: '', phone: '', description: '' },
      { name: 'Nike', country: 'United States', website: '', contactPerson: '', email: '', phone: '', description: '' },
    ]

    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Brands')
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 30 }, { wch: 25 }, { wch: 30 }, { wch: 18 }, { wch: 35 }]

    XLSX.writeFile(wb, 'brands-import-template.xlsx')
    toast.success('Template downloaded')
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ]

    if (!validTypes.includes(selectedFile.type) &&
        !selectedFile.name.endsWith('.xlsx') &&
        !selectedFile.name.endsWith('.xls') &&
        !selectedFile.name.endsWith('.csv')) {
      toast.error('Invalid file type. Please select .xlsx, .xls, or .csv file')
      return
    }

    setFile(selectedFile)
    setParseSuccess(false)
    setParsedData([])
    setErrors([])
    setImportErrors([])
    setImportNotes([])
    setImportedCount(0)
  }

  const parseFile = useCallback(async () => {
    if (!file) {
      toast.error('Please select a file')
      return
    }

    try {
      setImporting(true)
      setImportErrors([])
      setImportNotes([])
      setImportedCount(0)
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array', codepage: 65001 })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

      if (jsonData.length === 0) {
        toast.error('The file is empty')
        setImporting(false)
        return
      }

      let dataToProcess = jsonData
      let rowOffset = 1

      if (jsonData[0]) {
        const firstRow = jsonData[0] as any
        const firstRowName = firstRow.name?.toString().toLowerCase() || ''
        const isHeaderByName = firstRowName === 'name' || firstRowName.includes('brand name') || firstRowName.includes('required')
        if (isHeaderByName) {
          dataToProcess = jsonData.slice(1)
          rowOffset = 2
        }
      }

      const brands: ImportBrand[] = []
      const allErrors: ValidationError[] = []

      dataToProcess.forEach((row: any, index: number) => {
        const hasAnyData = Object.values(row).some((val) => val !== '' && val !== null && val !== undefined)
        if (!hasAnyData) return

        const rowIndex = index + rowOffset
        const name = row.name?.toString().trim()
        if (!name) {
          allErrors.push({ row: rowIndex, field: 'name', message: 'Brand name is required' })
          return
        }

        const brand: ImportBrand = { _row: rowIndex, name }
        if (row.country?.toString().trim()) brand.country = row.country.toString().trim()
        if (row.website?.toString().trim()) brand.website = row.website.toString().trim()
        if (row.contactPerson?.toString().trim()) brand.contactPerson = row.contactPerson.toString().trim()
        if (row.email?.toString().trim()) brand.email = row.email.toString().trim()
        if (row.phone?.toString().trim()) brand.phone = row.phone.toString().trim()
        if (row.description?.toString().trim()) brand.description = row.description.toString().trim()

        brands.push(brand)
      })

      if (allErrors.length > 0) {
        setErrors(allErrors)
        toast.error(`Validation errors: ${allErrors.length} errors found`)
      } else {
        setParsedData(brands)
        setParseSuccess(true)
        toast.success(`File parsed successfully: ${brands.length} brands ready to import`)
      }

      setImporting(false)
    } catch (error) {
      console.error('Error parsing file:', error)
      toast.error('Error parsing file')
      setImporting(false)
    }
  }, [file])

  const handleImport = useCallback(async () => {
    if (parsedData.length === 0) {
      toast.error('No brands to import')
      return
    }

    setImporting(true)
    const totalSubmitted = parsedData.length
    const brandsToSend = parsedData.map(({ _row, ...rest }) => rest)

    const batches: any[][] = []
    for (let i = 0; i < brandsToSend.length; i += IMPORT_BATCH_SIZE) {
      batches.push(brandsToSend.slice(i, i + IMPORT_BATCH_SIZE))
    }

    let inserted = 0
    const rowErrors: ImportRowNote[] = []
    const rowNotes: ImportRowNote[] = []
    let stoppedEarly = false

    setImportProgress({ done: 0, total: totalSubmitted })

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]
      const indexOffset = b * IMPORT_BATCH_SIZE
      try {
        const result = await bulkAddBrands({ brands: batch }).unwrap()
        inserted += result?.insertedCount ?? 0

        const failed = result?.errors || []
        failed.forEach((err) => {
          const source = parsedData[indexOffset + err.index]
          rowErrors.push({
            row: source?._row ?? indexOffset + err.index + 1,
            name: source?.name || err.name || '',
            message: err.error || 'Unknown error',
          })
        })

        const skipped = result?.warnings || []
        skipped.forEach((warn) => {
          const source = parsedData[indexOffset + warn.index]
          rowNotes.push({
            row: source?._row ?? indexOffset + warn.index + 1,
            name: source?.name || warn.name || '',
            message: warn.message || '',
          })
        })

        setImportProgress({ done: Math.min(indexOffset + batch.length, totalSubmitted), total: totalSubmitted })
      } catch (error) {
        console.error('Error importing brand batch:', error)
        stoppedEarly = true
        batch.forEach((brand, i) => {
          const source = parsedData[indexOffset + i]
          rowErrors.push({
            row: source?._row ?? indexOffset + i + 1,
            name: source?.name || brand.name || '',
            message: 'Error importing brands',
          })
        })
        break
      }
    }

    setImportProgress(null)
    setImportErrors(rowErrors)
    setImportNotes(rowNotes)
    setImportedCount(inserted)

    if (inserted === 0 && rowNotes.length === 0) {
      toast.error('Import failed — no brands were imported')
    } else if (stoppedEarly) {
      toast.error(`Import stopped after a batch failed — ${inserted} of ${totalSubmitted} were saved before the error. Re-select the file to retry the rest.`)
    } else if (rowErrors.length > 0) {
      toast.error(`${inserted} of ${totalSubmitted} brands imported — ${rowErrors.length} failed`)
    } else {
      toast.success(`Import successful: ${inserted} brands imported`)
    }

    if (rowNotes.length > 0) {
      toast(`${rowNotes.length} row(s) skipped — brand already existed`)
    }

    setFile(null)
    setParsedData([])
    setParseSuccess(false)
    setErrors([])
    if (rowErrors.length === 0 && rowNotes.length === 0) {
      onOpenChange(false)
    }

    setImporting(false)
  }, [parsedData, bulkAddBrands])

  const resetDialog = () => {
    setFile(null)
    setParsedData([])
    setErrors([])
    setParseSuccess(false)
    setImportErrors([])
    setImportNotes([])
    setImportedCount(0)
    setImportProgress(null)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next) resetDialog()
      onOpenChange(next)
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Import Brands from Excel</DialogTitle>
          <DialogDescription>Upload an Excel file to bulk import brands</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Download className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Download the template first to see the required format</span>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </AlertDescription>
          </Alert>

          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="brand-excel-file">Select Excel File</Label>
            <Input
              id="brand-excel-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              disabled={importing}
            />
            {file && (
              <p className="text-sm text-muted-foreground">Selected file: {file.name}</p>
            )}
          </div>

          {file && !parseSuccess && errors.length === 0 && (
            <Button onClick={parseFile} disabled={importing} className="w-full">
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Parse & Validate
                </>
              )}
            </Button>
          )}

          {errors.length > 0 && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">Validation errors ({errors.length} found in Excel file)</div>
                <ScrollArea className="h-40">
                  <div className="space-y-1">
                    {errors.map((error, index) => (
                      <div key={index} className="text-xs">
                        Row {error.row}, Field: {error.field} - {error.message}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {parseSuccess && parsedData.length > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <div className="font-semibold mb-2 text-green-600">
                  Ready to import: {parsedData.length} brands
                </div>
                <ScrollArea className="h-40">
                  <div className="space-y-2">
                    {parsedData.slice(0, 10).map((brand, index) => (
                      <div key={index} className="text-xs border-b pb-1">
                        <div className="font-medium">{brand.name}</div>
                        <div className="text-muted-foreground">
                          {brand.country && `Country: ${brand.country}`}
                          {brand.website && ` | Website: ${brand.website}`}
                        </div>
                      </div>
                    ))}
                    {parsedData.length > 10 && (
                      <div className="text-xs text-muted-foreground">
                        ... and {parsedData.length - 10} more
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {parseSuccess && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Warning: Importing will add new brands. A brand name that already exists will be skipped rather than duplicated.
              </AlertDescription>
            </Alert>
          )}

          {(importedCount > 0 || importErrors.length > 0 || importNotes.length > 0) && !parseSuccess && (
            <Alert variant={importErrors.length > 0 ? 'destructive' : undefined}>
              {importErrors.length > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />}
              <AlertDescription>
                <div className={`font-semibold mb-2 ${importErrors.length === 0 ? 'text-green-600' : ''}`}>
                  {importErrors.length > 0
                    ? 'Import completed with errors'
                    : `Import successful: ${importedCount} brands imported`}
                </div>
                {(importErrors.length > 0 || importNotes.length > 0) && (
                  <ScrollArea className="h-40">
                    <div className="space-y-1">
                      {importErrors.map((err, index) => (
                        <div key={`err-${index}`} className="text-xs">
                          Row {err.row}{err.name ? ` (${err.name})` : ''}: {err.message}
                        </div>
                      ))}
                      {importNotes.map((note, index) => (
                        <div key={`note-${index}`} className="text-xs text-muted-foreground">
                          Row {note.row}{note.name ? ` (${note.name})` : ''}: {note.message}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            {importErrors.length > 0 || importedCount > 0 ? 'Close' : 'Cancel'}
          </Button>
          {parseSuccess && (
            <Button onClick={handleImport} disabled={importing || parsedData.length === 0}>
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {importProgress ? `Importing ${importProgress.done} / ${importProgress.total}...` : 'Importing...'}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import ({parsedData.length})
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
