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
import { toast } from 'sonner'
import { Upload, Download, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { bulkAddCategories } from '@/stores/category.slice'
import { useCategories } from '../context/categories-context'
import * as XLSX from 'xlsx'

interface ImportCategory {
  _row: number
  name: string
  nameUrdu?: string
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

interface CategoryImportDialogProps {
  setFetch: (updater: (prev: boolean) => boolean) => void
}

// Sent in batches rather than one giant request: production runs the API behind a
// serverless platform with a hard request-body-size ceiling — see the identical
// safeguard in product-import-dialog.tsx, which is where this pattern was first added
// after a large product import was silently rejected in production.
const IMPORT_BATCH_SIZE = 500

export function CategoryImportDialog({ setFetch }: CategoryImportDialogProps) {
  const { state, dispatch: contextDispatch } = useCategories()
  const reduxDispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()

  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [parsedData, setParsedData] = useState<ImportCategory[]>([])
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
      { name: 'Mobile Accessories', nameUrdu: 'موبائل لوازمات' },
      { name: 'Electronics', nameUrdu: '' },
    ]

    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Categories')
    ws['!cols'] = [{ wch: 30 }, { wch: 25 }]

    XLSX.writeFile(wb, 'categories-import-template.xlsx')
    toast.success(t('template_downloaded'))
  }, [t])

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
      toast.error(t('invalid_file_type'))
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
      toast.error(t('please_select_file'))
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
        toast.error(t('file_is_empty'))
        setImporting(false)
        return
      }

      let dataToProcess = jsonData
      let rowOffset = 1

      if (jsonData[0]) {
        const firstRow = jsonData[0] as any
        const firstRowName = firstRow.name?.toString().toLowerCase() || ''
        const isHeaderByName = firstRowName === 'name' || firstRowName.includes('category name') || firstRowName.includes('required')
        if (isHeaderByName) {
          dataToProcess = jsonData.slice(1)
          rowOffset = 2
        }
      }

      const categories: ImportCategory[] = []
      const allErrors: ValidationError[] = []

      dataToProcess.forEach((row: any, index: number) => {
        const hasAnyData = Object.values(row).some((val) => val !== '' && val !== null && val !== undefined)
        if (!hasAnyData) return

        const rowIndex = index + rowOffset
        const name = row.name?.toString().trim()
        if (!name) {
          allErrors.push({ row: rowIndex, field: 'name', message: t('import_category_name_required') })
          return
        }

        const category: ImportCategory = { _row: rowIndex, name }
        if (row.nameUrdu?.toString().trim()) {
          category.nameUrdu = row.nameUrdu.toString().trim()
        }
        categories.push(category)
      })

      if (allErrors.length > 0) {
        setErrors(allErrors)
        toast.error(`${t('validation_errors')}: ${allErrors.length} errors found`)
      } else {
        setParsedData(categories)
        setParseSuccess(true)
        toast.success(`${t('file_parsed_successfully')}: ${categories.length} ${t('categories')}`)
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
      toast.error(t('no_categories_to_import'))
      return
    }

    setImporting(true)
    const totalSubmitted = parsedData.length
    const categoriesToSend = parsedData.map(({ _row, ...rest }) => rest)

    const batches: any[][] = []
    for (let i = 0; i < categoriesToSend.length; i += IMPORT_BATCH_SIZE) {
      batches.push(categoriesToSend.slice(i, i + IMPORT_BATCH_SIZE))
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
        const result = await reduxDispatch(bulkAddCategories({ categories: batch })).unwrap()
        inserted += result?.insertedCount ?? 0

        const failed = result?.errors || []
        failed.forEach((err: any) => {
          const source = parsedData[indexOffset + err.index]
          rowErrors.push({
            row: source?._row ?? indexOffset + err.index + 1,
            name: source?.name || err.name || '',
            message: err.error || t('unknown_error'),
          })
        })

        const skipped = result?.warnings || []
        skipped.forEach((warn: any) => {
          const source = parsedData[indexOffset + warn.index]
          rowNotes.push({
            row: source?._row ?? indexOffset + warn.index + 1,
            name: source?.name || warn.name || '',
            message: warn.message || '',
          })
        })

        setImportProgress({ done: Math.min(indexOffset + batch.length, totalSubmitted), total: totalSubmitted })
      } catch (error) {
        console.error('Error importing category batch:', error)
        stoppedEarly = true
        batch.forEach((category, i) => {
          const source = parsedData[indexOffset + i]
          rowErrors.push({
            row: source?._row ?? indexOffset + i + 1,
            name: source?.name || category.name || '',
            message: error instanceof Error ? error.message : t('error_importing_categories'),
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
      toast.error(t('import_failed_all_categories'))
    } else if (stoppedEarly) {
      toast.error(t('import_stopped_early_message', { inserted, total: totalSubmitted }))
    } else if (rowErrors.length > 0) {
      toast.warning(t('categories_imported_with_errors_message', {
        inserted,
        total: totalSubmitted,
        failed: rowErrors.length,
      }))
    } else {
      toast.success(`${t('import_successful')}: ${inserted} ${t('categories_imported')}`)
    }

    if (rowNotes.length > 0) {
      toast.info(t('categories_skipped_existing', { count: rowNotes.length }))
    }

    setFile(null)
    setParsedData([])
    setParseSuccess(false)
    setErrors([])
    if (rowErrors.length === 0) {
      setFetch((prev) => !prev)
      if (rowNotes.length === 0) {
        onOpenChange(false)
      }
    } else {
      setFetch((prev) => !prev)
    }

    setImporting(false)
  }, [parsedData, reduxDispatch, setFetch, t])

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
          <DialogTitle>{t('import_categories_from_excel')}</DialogTitle>
          <DialogDescription>{t('upload_excel_file_to_import_categories')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Download className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{t('download_template_first')}</span>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                {t('download_template')}
              </Button>
            </AlertDescription>
          </Alert>

          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="category-excel-file">{t('select_excel_file')}</Label>
            <Input
              id="category-excel-file"
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

          {file && !parseSuccess && errors.length === 0 && (
            <Button onClick={parseFile} disabled={importing} className="w-full">
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

          {parseSuccess && parsedData.length > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <div className="font-semibold mb-2 text-green-600">
                  {t('ready_to_import')}: {parsedData.length} {t('categories')}
                </div>
                <ScrollArea className="h-40">
                  <div className="space-y-2">
                    {parsedData.slice(0, 10).map((category, index) => (
                      <div key={index} className="text-xs border-b pb-1">
                        <div className="font-medium">
                          {category.name}
                          {category.nameUrdu && <span className="text-muted-foreground ml-2 font-normal"> · <span dir="rtl">{category.nameUrdu}</span></span>}
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
              <AlertDescription>{t('warning_importing_categories')}</AlertDescription>
            </Alert>
          )}

          {(importedCount > 0 || importErrors.length > 0 || importNotes.length > 0) && !parseSuccess && (
            <Alert variant={importErrors.length > 0 ? 'destructive' : undefined}>
              {importErrors.length > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />}
              <AlertDescription>
                <div className={`font-semibold mb-2 ${importErrors.length === 0 ? 'text-green-600' : ''}`}>
                  {importErrors.length > 0
                    ? t('import_completed_with_errors')
                    : `${t('import_successful')}: ${importedCount} ${t('categories_imported')}`}
                </div>
                {(importErrors.length > 0 || importNotes.length > 0) && (
                  <ScrollArea className="h-40">
                    <div className="space-y-1">
                      {importErrors.map((err, index) => (
                        <div key={`err-${index}`} className="text-xs">
                          {t('row')} {err.row}{err.name ? ` (${err.name})` : ''}: {err.message}
                        </div>
                      ))}
                      {importNotes.map((note, index) => (
                        <div key={`note-${index}`} className="text-xs text-muted-foreground">
                          {t('row')} {note.row}{note.name ? ` (${note.name})` : ''}: {note.message}
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
            {importErrors.length > 0 || importedCount > 0 ? t('close') : t('cancel')}
          </Button>
          {parseSuccess && (
            <Button onClick={handleImport} disabled={importing || parsedData.length === 0}>
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
