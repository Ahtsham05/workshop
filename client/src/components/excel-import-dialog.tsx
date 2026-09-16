/**
 * Shared "Import from Excel" dialog.
 *
 * Every entity that can be imported (products, customers, suppliers, brands,
 * categories, sub-categories) used to ship its own copy of this dialog. They drifted:
 * some batched their requests and some sent one giant one that the serverless platform
 * rejected outright, some showed which rows failed and some just said "import failed",
 * and one of them silently dropped rows it didn't like without telling anyone. A fix
 * landed in one copy and not the others, which is why imports kept "working, except…".
 *
 * This is the one implementation. A feature supplies its field list, a row builder and
 * a batch importer; everything else — reading the file, finding the header row wherever
 * it is, mapping columns (and letting the user re-map them), validating, batching,
 * progress, partial success, and the report of what didn't make it — happens here.
 *
 * The rule the flow is built around: a bad row is skipped and explained, never a reason
 * to refuse the whole file. The only hard stop is a file with nothing importable in it.
 */

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import {
  downloadIssueReport,
  downloadTemplate,
  IMPORT_FILE_ACCEPT,
  isSupportedSpreadsheet,
  parseSheet,
  pickBestSheet,
  readWorkbook,
  SpreadsheetError,
  summarizeSheets,
  type CellValue,
  type ImportFieldSpec,
  type ParsedSheet,
  type SheetSummary,
} from '@/lib/excel-import'
import type * as XLSX from 'xlsx'

/** Result of turning one spreadsheet row into the object the API expects. */
export interface BuiltRow<T> {
  /** Omitted when the row can't be imported; `error` then says why, in plain words. */
  value?: T
  error?: string
  /** Row imports anyway, but something was assumed or dropped and the user should know. */
  warning?: string
}

/** What a batch import call reports back. Indexes are positions within the batch. */
export interface ImportBatchOutcome {
  insertedCount: number
  errors?: Array<{ index?: number; error?: string; message?: string }>
  warnings?: Array<{ index?: number; message: string }>
  skipped?: Array<{ index?: number; reason?: string; message?: string }>
  /** Free-form notes for the summary, e.g. "Created 3 new categories". */
  notes?: string[]
}

export interface DuplicateKeySpec<T> {
  label: string
  get: (item: T) => string | undefined | null
}

export interface ExcelImportDialogProps<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Lowercase plural used in sentences: "products", "customers". */
  entityPlural: string
  fields: ImportFieldSpec[]
  sampleRows: Record<string, string | number>[]
  templateFileName: string
  templateSheetName: string
  /**
   * Turns one row's cells into the object the API expects. `has(field)` tells it whether
   * the file has that column at all — "the Purchase Price column is missing" and "this
   * row's Purchase Price cell is empty" call for different answers, and treating the
   * first as a per-row error is what turned a price list with no cost column into
   * thousands of identical failures.
   */
  buildRow: (
    values: Record<string, CellValue>,
    context: { excelRow: number; has: (field: string) => boolean }
  ) => BuiltRow<T>
  importBatch: (items: T[]) => Promise<ImportBatchOutcome>
  /** Rows per request. Large files are split so no single request outgrows the API's
   *  body-size limit — a rejection that reaches the browser as a cancelled request. */
  batchSize?: number
  /** In-file duplicate detection, e.g. two rows with the same barcode. */
  duplicateKeys?: DuplicateKeySpec<T>[]
  /** Extra controls (e.g. what to do about rows that already exist) shown above Import. */
  options?: ReactNode
  /** One-line preview of a row, shown for the first few ready rows. */
  renderPreview?: (item: T) => ReactNode
  /** Called after an import that inserted at least one record. */
  onImported?: () => void
}

interface RowIssue {
  excelRow: number
  reason: string
  values: Record<string, CellValue>
}

interface ReadyRow<T> {
  excelRow: number
  item: T
  values: Record<string, CellValue>
  warning?: string
}

const IGNORE_COLUMN = '__ignore__'
const MAX_LISTED_ISSUES = 100

export function ExcelImportDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  entityPlural,
  fields,
  sampleRows,
  templateFileName,
  templateSheetName,
  buildRow,
  importBatch,
  batchSize = 500,
  duplicateKeys,
  options,
  renderPreview,
  onImported,
}: ExcelImportDialogProps<T>) {
  const { t } = useLanguage()

  const [file, setFile] = useState<File | null>(null)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheets, setSheets] = useState<SheetSummary[]>([])
  const [activeSheet, setActiveSheet] = useState<string>('')
  const [overrides, setOverrides] = useState<Record<number, string | null>>({})
  const [parsed, setParsed] = useState<ParsedSheet | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [showMapping, setShowMapping] = useState(false)

  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const cancelRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [summary, setSummary] = useState<{
    inserted: number
    /** Rows the server refused — something went wrong and the user may want to retry. */
    failed: RowIssue[]
    /** Rows the server deliberately left alone (already saved). Not failures. */
    skipped: RowIssue[]
    /** Rows that imported, with something the user should know about. */
    noted: RowIssue[]
    /** Rows never sent because they needed fixing first. */
    notSent: number
    notes: string[]
    stoppedEarly: boolean
  } | null>(null)

  const resetFileState = useCallback(() => {
    setFile(null)
    setWorkbook(null)
    setSheets([])
    setActiveSheet('')
    setOverrides({})
    setParsed(null)
    setFileError(null)
    setShowMapping(false)
    setProgress(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const resetAll = useCallback(() => {
    resetFileState()
    setSummary(null)
    setImporting(false)
    cancelRef.current = false
  }, [resetFileState])

  // ─── Reading the file ──────────────────────────────────────────────────────

  const loadFile = useCallback(
    async (selected: File) => {
      setReading(true)
      setFileError(null)
      setSummary(null)
      setParsed(null)
      setOverrides({})
      try {
        const book = await readWorkbook(selected)
        const sheetSummaries = summarizeSheets(book, fields)
        const best = pickBestSheet(sheetSummaries)
        if (!best) {
          throw new SpreadsheetError(
            t('This file has no sheets with any data in them. Open it in Excel to check, then upload it again.')
          )
        }
        setFile(selected)
        setWorkbook(book)
        setSheets(sheetSummaries)
        setActiveSheet(best)
        setParsed(parseSheet(book, best, fields))
      } catch (error) {
        resetFileState()
        const message =
          error instanceof SpreadsheetError
            ? error.message
            : t('This file could not be read. Save it as .xlsx or .csv in Excel and try again.')
        setFileError(message)
      } finally {
        setReading(false)
      }
    },
    [fields, resetFileState, t]
  )

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (!selected) return
    if (!isSupportedSpreadsheet(selected)) {
      setFileError(
        t('"{{name}}" is not a spreadsheet. Choose an Excel file (.xlsx, .xls) or a .csv file.', {
          name: selected.name,
        })
      )
      resetFileState()
      return
    }
    void loadFile(selected)
  }

  const changeSheet = (name: string) => {
    if (!workbook) return
    setActiveSheet(name)
    setOverrides({})
    setSummary(null)
    setParsed(parseSheet(workbook, name, fields))
  }

  const remapColumn = (column: number, field: string | null) => {
    if (!workbook || !activeSheet) return
    const next = { ...overrides, [column]: field }
    setOverrides(next)
    setParsed(parseSheet(workbook, activeSheet, fields, next))
  }

  // ─── Validating rows ───────────────────────────────────────────────────────

  const { readyRows, issues } = useMemo(() => {
    const ready: ReadyRow<T>[] = []
    const problems: RowIssue[] = []
    if (!parsed) return { readyRows: ready, issues: problems }

    // Per key-spec: normalized value → the row that claimed it first. A collision inside
    // the file is caught here, where both row numbers are still known, instead of coming
    // back from the server as an "already exists" the user can't place.
    const seen = (duplicateKeys || []).map(() => new Map<string, number>())

    const mappedFieldKeys = new Set(
      parsed.columns.filter((column) => column.field).map((column) => column.field as string)
    )
    const has = (field: string) => mappedFieldKeys.has(field)

    parsed.rows.forEach((row) => {
      let built: BuiltRow<T>
      try {
        built = buildRow(row.values, { excelRow: row.excelRow, has })
      } catch (error) {
        built = { error: error instanceof Error ? error.message : t('This row could not be read') }
      }

      if (!built.value) {
        problems.push({
          excelRow: row.excelRow,
          reason: built.error || t('This row is missing required information'),
          values: row.values,
        })
        return
      }

      let duplicateOf: { label: string; row: number; value: string } | null = null
      ;(duplicateKeys || []).forEach((spec, specIndex) => {
        if (duplicateOf) return
        const raw = spec.get(built.value as T)
        const key = raw ? String(raw).trim().toLowerCase() : ''
        if (!key) return
        const firstRow = seen[specIndex].get(key)
        if (firstRow !== undefined) {
          duplicateOf = { label: spec.label, row: firstRow, value: String(raw) }
          return
        }
        seen[specIndex].set(key, row.excelRow)
      })

      if (duplicateOf) {
        const clash = duplicateOf as { label: string; row: number; value: string }
        problems.push({
          excelRow: row.excelRow,
          reason: t('Same {{label}} "{{value}}" as row {{row}} in this file — only the first one is imported', {
            label: clash.label,
            value: clash.value,
            row: clash.row,
          }),
          values: row.values,
        })
        return
      }

      ready.push({ excelRow: row.excelRow, item: built.value, values: row.values, warning: built.warning })
    })

    return { readyRows: ready, issues: problems }
  }, [parsed, buildRow, duplicateKeys, t])

  const rowWarnings = useMemo(
    () => readyRows.filter((row) => row.warning).map((row) => ({ excelRow: row.excelRow, warning: row.warning as string })),
    [readyRows]
  )

  // ─── Importing ─────────────────────────────────────────────────────────────

  const runImport = useCallback(async () => {
    if (!readyRows.length) return

    setImporting(true)
    cancelRef.current = false
    const total = readyRows.length
    setProgress({ done: 0, total })

    let inserted = 0
    const failed: RowIssue[] = []
    const skippedRows: RowIssue[] = []
    const notedRows: RowIssue[] = []
    const notes: string[] = []
    let stoppedEarly = false

    for (let start = 0; start < readyRows.length; start += batchSize) {
      if (cancelRef.current) {
        stoppedEarly = true
        break
      }
      const slice = readyRows.slice(start, start + batchSize)
      try {
        const outcome = await importBatch(slice.map((row) => row.item))
        inserted += outcome.insertedCount || 0
        ;(outcome.errors || []).forEach((error, position) => {
          const source = slice[error.index ?? position]
          failed.push({
            excelRow: source?.excelRow ?? start + position + 1,
            reason: error.error || error.message || t('This row could not be saved'),
            values: source?.values || {},
          })
        })
        ;(outcome.skipped || []).forEach((skip, position) => {
          const source = slice[skip.index ?? position]
          skippedRows.push({
            excelRow: source?.excelRow ?? start + position + 1,
            reason: skip.reason || skip.message || t('Left unchanged'),
            values: source?.values || {},
          })
        })
        ;(outcome.warnings || []).forEach((warning) => {
          // A note the server couldn't tie to a row (an account that couldn't be set up
          // afterwards, say) is shown as a general note. Guessing a row for it would put
          // the message next to an unrelated record.
          if (warning.index === undefined) {
            if (!notes.includes(warning.message)) notes.push(warning.message)
            return
          }
          const source = slice[warning.index]
          notedRows.push({
            excelRow: source?.excelRow ?? warning.index + start + 1,
            reason: warning.message,
            values: source?.values || {},
          })
        })
        ;(outcome.notes || []).forEach((note) => {
          if (!notes.includes(note)) notes.push(note)
        })
        setProgress({ done: Math.min(start + slice.length, total), total })
      } catch (error) {
        // Whatever already went through is genuinely saved — record it, stop sending,
        // and report the rest as not attempted rather than pretending the whole file failed.
        stoppedEarly = true
        const message = error instanceof Error ? error.message : t('The server could not be reached')
        slice.forEach((row) => failed.push({ excelRow: row.excelRow, reason: message, values: row.values }))
        break
      }
    }

    const notAttempted = stoppedEarly
      ? total - Math.min(inserted + failed.length + skippedRows.length, total)
      : 0
    setProgress(null)
    setImporting(false)
    setSummary({
      inserted,
      failed,
      skipped: skippedRows,
      noted: notedRows,
      notSent: issues.length + Math.max(notAttempted, 0),
      notes,
      stoppedEarly,
    })

    if (inserted > 0) onImported?.()

    if (inserted === 0 && failed.length === 0 && skippedRows.length > 0) {
      // Everything in the file was already saved. That's a no-op, not a failure.
      toast.info(
        t('Nothing new to import — all {{count}} rows are already saved', { count: skippedRows.length })
      )
    } else if (inserted === 0) {
      toast.error(t('Nothing was imported — see the list of problems below'))
    } else if (failed.length > 0) {
      toast.warning(
        t('Imported {{inserted}} of {{total}} {{entity}} — {{failed}} could not be saved', {
          inserted,
          total,
          entity: entityPlural,
          failed: failed.length,
        })
      )
    } else {
      toast.success(t('Imported {{inserted}} {{entity}}', { inserted, entity: entityPlural }))
    }

    // The rows that succeeded are saved. Clearing the parsed file makes it impossible to
    // press Import a second time and insert them all over again.
    resetFileState()
  }, [readyRows, batchSize, importBatch, issues.length, entityPlural, onImported, resetFileState, t])

  // ─── Rendering ─────────────────────────────────────────────────────────────

  const handleTemplate = () => {
    downloadTemplate(fields, sampleRows, templateFileName, templateSheetName)
    toast.success(t('Template downloaded'))
  }

  const issueReport = (rows: RowIssue[], suffix: string) => {
    downloadIssueReport(
      fields,
      rows.map((row) => ({ excelRow: row.excelRow, reason: row.reason, values: row.values })),
      `${templateFileName.replace(/\.[^.]+$/, '')}-${suffix}.xlsx`
    )
  }

  const sheetsWithData = sheets.filter((sheet) => sheet.rowCount > 0)
  const mappedFields = parsed?.columns.filter((column) => column.field) || []
  const progressValue = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (importing) return // never lose an in-flight import to a stray click
        if (!next) resetAll()
        onOpenChange(next)
      }}
    >
      {/* Width scales with how many columns the entity has, and is set on the `sm:`
          variant as well: the base DialogContent ships `sm:max-w-lg`, which otherwise
          wins from 640px up and squeezes the column mapping into a narrow strip. Header
          and footer stay put while the middle scrolls, so Import is always reachable on
          a long file. */}
      <DialogContent
        className={`flex max-h-[92vh] w-[96vw] flex-col gap-4 overflow-hidden ${
          fields.length > 4 ? 'sm:max-w-5xl' : 'sm:max-w-2xl'
        }`}
      >
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <FileSpreadsheet className='h-5 w-5' />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto pe-1'>
          {/* Step 1 — pick a file. Stays visible so a different file is always one click away. */}
          {!summary && (
            <>
              <Alert>
                <Download className='h-4 w-4' />
                <AlertDescription className='flex flex-wrap items-center justify-between gap-2'>
                  <span>
                    {t('Not sure about the columns? Start from the template — or just upload your own file, the columns are matched automatically.')}
                  </span>
                  <Button variant='outline' size='sm' onClick={handleTemplate}>
                    <Download className='mr-2 h-4 w-4' />
                    {t('Download Template')}
                  </Button>
                </AlertDescription>
              </Alert>

              <div className='grid w-full items-center gap-1.5'>
                <Label htmlFor='import-file'>{t('Select file')}</Label>
                <Input
                  id='import-file'
                  ref={fileInputRef}
                  type='file'
                  accept={IMPORT_FILE_ACCEPT}
                  onChange={handleFileChange}
                  disabled={importing || reading}
                />
                <p className='text-xs text-muted-foreground'>
                  {t('Excel (.xlsx, .xlsm, .xls) or CSV. The header row can be anywhere near the top — a title above it is fine.')}
                </p>
              </div>
            </>
          )}

          {reading && (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' />
              {t('Reading {{name}}…', { name: file?.name || '' })}
            </div>
          )}

          {fileError && (
            <Alert variant='destructive'>
              <XCircle className='h-4 w-4' />
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          )}

          {/* Step 2 — what was found, and how the columns were understood. */}
          {parsed && !summary && (
            <>
              {sheetsWithData.length > 1 && (
                <div className='flex flex-wrap items-center gap-2'>
                  <Label className='text-sm'>{t('Sheet')}</Label>
                  <Select value={activeSheet} onValueChange={changeSheet}>
                    <SelectTrigger className='h-8 w-[220px]'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sheets.map((sheet) => (
                        <SelectItem key={sheet.name} value={sheet.name}>
                          {sheet.name} ({sheet.rowCount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className='text-xs text-muted-foreground'>
                    {t('This file has more than one sheet — pick the one with your data.')}
                  </span>
                </div>
              )}

              <div className='rounded-lg border p-3 space-y-2'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='flex flex-wrap items-center gap-2 text-sm'>
                    <Badge variant='outline'>
                      {t('{{count}} ready', { count: readyRows.length })}
                    </Badge>
                    {issues.length > 0 && (
                      <Badge variant='destructive'>{t('{{count}} to fix', { count: issues.length })}</Badge>
                    )}
                    {parsed.skippedRowCount > 0 && (
                      <span className='text-xs text-muted-foreground'>
                        {t('{{count}} blank/total rows ignored', { count: parsed.skippedRowCount })}
                      </span>
                    )}
                  </div>
                  <Button variant='ghost' size='sm' onClick={() => setShowMapping((value) => !value)}>
                    {showMapping ? t('Hide columns') : t('Check columns')}
                  </Button>
                </div>

                <p className='text-xs text-muted-foreground'>
                  {parsed.headerRow
                    ? t('Header row found on row {{row}}. {{count}} columns matched.', {
                        row: parsed.headerRow,
                        count: mappedFields.length,
                      })
                    : t('No header row was recognised, so columns were matched in template order — please check them.')}
                </p>

                {parsed.missingFields.length > 0 && (
                  <Alert>
                    <AlertCircle className='h-4 w-4' />
                    <AlertDescription className='text-xs'>
                      {t('These columns were not found in your file: {{fields}}. Use "Check columns" to point them at the right ones — otherwise they are imported empty (amounts as 0).', {
                        fields: parsed.missingFields.map((field) => field.label).join(', '),
                      })}
                    </AlertDescription>
                  </Alert>
                )}

                {showMapping && (
                  // Every column in the file, laid out across the dialog's width. This
                  // used to be a table in a 224px scroll box: with a dozen columns only
                  // four were visible and the rest looked like they hadn't been read at
                  // all — the one screen that exists to prove otherwise.
                  <div className='space-y-2'>
                    <p className='text-xs text-muted-foreground'>
                      {t('Every column in your file is listed here. Dashed ones are ignored — point any of them at the right field if the match is wrong.')}
                    </p>
                    <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
                        {parsed.columns.map((column) => (
                        <div
                          key={column.column}
                          className={`flex items-center gap-2 rounded-md border p-2 ${
                            column.field ? '' : 'border-dashed bg-muted/30'
                          }`}
                        >
                          <div className='min-w-0 flex-1'>
                            <div className='truncate text-xs font-medium' title={column.header}>
                              {column.header || (
                                <span className='italic text-muted-foreground'>{t('(no header)')}</span>
                              )}
                            </div>
                            <div className='text-[10px] uppercase tracking-wide text-muted-foreground'>
                              {t('Column')} {column.letter}
                            </div>
                          </div>
                          <Select
                            value={column.field ?? IGNORE_COLUMN}
                            onValueChange={(value) =>
                              remapColumn(column.column, value === IGNORE_COLUMN ? null : value)
                            }
                          >
                            <SelectTrigger className='h-7 w-[150px] shrink-0 text-xs'>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={IGNORE_COLUMN}>{t('Ignore this column')}</SelectItem>
                              {fields.map((field) => (
                                <SelectItem key={field.key} value={field.key}>
                                  {field.label}
                                  {field.required ? ' *' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Preview of what will actually be created. */}
              {renderPreview && readyRows.length > 0 && (
                <div className='rounded-lg border p-3'>
                  <div className='mb-2 flex items-center gap-2 text-sm font-medium text-green-600'>
                    <CheckCircle2 className='h-4 w-4' />
                    {t('Ready to import')}
                  </div>
                  <ScrollArea className='max-h-40'>
                    <div className='space-y-1'>
                      {readyRows.slice(0, 10).map((row) => (
                        <div key={row.excelRow} className='border-b pb-1 text-xs'>
                          {renderPreview(row.item)}
                        </div>
                      ))}
                      {readyRows.length > 10 && (
                        <div className='text-xs text-muted-foreground'>
                          {t('…and {{count}} more', { count: readyRows.length - 10 })}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {rowWarnings.length > 0 && (
                <Alert>
                  <AlertCircle className='h-4 w-4' />
                  <AlertDescription className='text-xs'>
                    <div className='mb-1 font-medium'>
                      {t('{{count}} rows import with a small change', { count: rowWarnings.length })}
                    </div>
                    <ScrollArea className='max-h-24'>
                      {rowWarnings.slice(0, 20).map((warning) => (
                        <div key={warning.excelRow}>
                          {t('Row')} {warning.excelRow}: {warning.warning}
                        </div>
                      ))}
                    </ScrollArea>
                  </AlertDescription>
                </Alert>
              )}

              {issues.length > 0 && (
                <Alert variant='destructive'>
                  <XCircle className='h-4 w-4' />
                  <AlertDescription>
                    <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                      <span className='font-semibold'>
                        {t('{{count}} rows need fixing — the rest can still be imported now', { count: issues.length })}
                      </span>
                      <Button variant='outline' size='sm' onClick={() => issueReport(issues, 'rows-to-fix')}>
                        <Download className='mr-2 h-4 w-4' />
                        {t('Download these rows')}
                      </Button>
                    </div>
                    <ScrollArea className='max-h-40'>
                      <div className='space-y-1'>
                        {issues.slice(0, MAX_LISTED_ISSUES).map((issue) => (
                          <div key={issue.excelRow} className='text-xs'>
                            {t('Row')} {issue.excelRow}: {issue.reason}
                          </div>
                        ))}
                        {issues.length > MAX_LISTED_ISSUES && (
                          <div className='text-xs'>
                            {t('…and {{count}} more', { count: issues.length - MAX_LISTED_ISSUES })}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </AlertDescription>
                </Alert>
              )}

              {readyRows.length === 0 && (
                <Alert variant='destructive'>
                  <XCircle className='h-4 w-4' />
                  <AlertDescription>
                    {t('No row in this sheet can be imported yet. Use "Check columns" to match your columns to the right fields, or fix the rows listed above.')}
                  </AlertDescription>
                </Alert>
              )}

              {options && readyRows.length > 0 && <div className='rounded-lg border p-3'>{options}</div>}
            </>
          )}

          {/* Step 3 — progress. */}
          {importing && progress && (
            <div className='space-y-2'>
              <Progress value={progressValue} />
              <p className='text-xs text-muted-foreground'>
                {t('Importing {{done}} of {{total}}… you can keep this window open.', {
                  done: progress.done,
                  total: progress.total,
                })}
              </p>
            </div>
          )}

          {/* Step 4 — what happened, with each row in the right bucket: saved, left
              alone on purpose, saved with a note, or genuinely failed. */}
          {summary && (
            <Alert variant={summary.inserted === 0 && summary.failed.length > 0 ? 'destructive' : undefined}>
              {summary.failed.length > 0 ? (
                <AlertCircle className='h-4 w-4' />
              ) : (
                <CheckCircle2 className='h-4 w-4 text-green-600' />
              )}
              <AlertDescription className='space-y-2'>
                <div className={`font-semibold ${summary.inserted > 0 ? 'text-green-600' : ''}`}>
                  {t('{{count}} {{entity}} imported', { count: summary.inserted, entity: entityPlural })}
                </div>
                {summary.notSent > 0 && (
                  <div className='text-xs'>
                    {t('{{count}} rows were not sent because they need fixing first.', { count: summary.notSent })}
                  </div>
                )}
                {summary.stoppedEarly && (
                  <div className='text-xs'>
                    {t('The import stopped early. Everything listed as imported is saved — re-upload the remaining rows to finish.')}
                  </div>
                )}
                {summary.notes.map((note) => (
                  <div key={note} className='text-xs'>
                    {note}
                  </div>
                ))}

                {summary.skipped.length > 0 && (
                  <details className='text-xs'>
                    <summary className='cursor-pointer font-medium'>
                      {t('{{count}} rows were already saved and left unchanged', { count: summary.skipped.length })}
                    </summary>
                    <ScrollArea className='mt-1 max-h-32'>
                      <div className='space-y-1'>
                        {summary.skipped.slice(0, MAX_LISTED_ISSUES).map((issue) => (
                          <div key={`skip-${issue.excelRow}`}>
                            {t('Row')} {issue.excelRow}: {issue.reason}
                          </div>
                        ))}
                        {summary.skipped.length > MAX_LISTED_ISSUES && (
                          <div>{t('…and {{count}} more', { count: summary.skipped.length - MAX_LISTED_ISSUES })}</div>
                        )}
                      </div>
                    </ScrollArea>
                  </details>
                )}

                {summary.noted.length > 0 && (
                  <details className='text-xs'>
                    <summary className='cursor-pointer font-medium'>
                      {t('{{count}} rows imported with a note', { count: summary.noted.length })}
                    </summary>
                    <ScrollArea className='mt-1 max-h-32'>
                      <div className='space-y-1'>
                        {summary.noted.slice(0, MAX_LISTED_ISSUES).map((issue) => (
                          <div key={`note-${issue.excelRow}-${issue.reason}`}>
                            {t('Row')} {issue.excelRow}: {issue.reason}
                          </div>
                        ))}
                        {summary.noted.length > MAX_LISTED_ISSUES && (
                          <div>{t('…and {{count}} more', { count: summary.noted.length - MAX_LISTED_ISSUES })}</div>
                        )}
                      </div>
                    </ScrollArea>
                  </details>
                )}

                {summary.failed.length > 0 && (
                  <>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='text-xs font-medium'>
                        {t('{{count}} rows could not be saved', { count: summary.failed.length })}
                      </span>
                      <Button variant='outline' size='sm' onClick={() => issueReport(summary.failed, 'not-imported')}>
                        <Download className='mr-2 h-4 w-4' />
                        {t('Download these rows')}
                      </Button>
                    </div>
                    <ScrollArea className='max-h-40'>
                      <div className='space-y-1'>
                        {summary.failed.slice(0, MAX_LISTED_ISSUES).map((issue) => (
                          <div key={`${issue.excelRow}-${issue.reason}`} className='text-xs'>
                            {t('Row')} {issue.excelRow}: {issue.reason}
                          </div>
                        ))}
                        {summary.failed.length > MAX_LISTED_ISSUES && (
                          <div className='text-xs'>
                            {t('…and {{count}} more', { count: summary.failed.length - MAX_LISTED_ISSUES })}
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

        <DialogFooter className='gap-2'>
          {summary ? (
            <>
              <Button variant='outline' onClick={resetAll}>
                <RefreshCw className='mr-2 h-4 w-4' />
                {t('Import another file')}
              </Button>
              <Button
                onClick={() => {
                  resetAll()
                  onOpenChange(false)
                }}
              >
                {t('Done')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant='outline'
                onClick={() => {
                  if (importing) {
                    cancelRef.current = true
                    return
                  }
                  resetAll()
                  onOpenChange(false)
                }}
              >
                {importing ? t('Stop after this batch') : t('Cancel')}
              </Button>
              <Button onClick={runImport} disabled={importing || reading || readyRows.length === 0}>
                {importing ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    {t('Importing…')}
                  </>
                ) : (
                  <>
                    <Upload className='mr-2 h-4 w-4' />
                    {issues.length > 0
                      ? t('Import {{count}} rows, skip {{skipped}}', {
                          count: readyRows.length,
                          skipped: issues.length,
                        })
                      : t('Import {{count}}', { count: readyRows.length })}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
