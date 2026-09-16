import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Upload, FileSpreadsheet } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { StatementLineInput } from '@/stores/bankReconciliation.api'
import {
  IMPORT_FILE_ACCEPT,
  isSupportedSpreadsheet,
  normalizeHeader,
  parseDate,
  parseNumeric,
  parseText,
  readWorkbook,
  SpreadsheetError,
  type CellValue,
} from '@/lib/excel-import'
import * as XLSX from 'xlsx'

type AmountMode = 'single' | 'split'

/** Column selects carry the column INDEX, never the header text: bank exports routinely
 *  repeat a header or leave one blank, and an empty value is not a legal Select item. */
const NONE = '__none__'

/** Header spellings banks use, per column we care about. */
const COLUMN_HINTS: Record<string, string[]> = {
  date: ['date', 'txndate', 'transactiondate', 'valuedate', 'postingdate', 'trndate'],
  description: ['description', 'narration', 'details', 'particulars', 'particular', 'memo', 'remarks', 'transactiondetails'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'paidout', 'dr', 'moneyout'],
  credit: ['credit', 'deposit', 'deposits', 'paidin', 'cr', 'moneyin'],
  amount: ['amount', 'transactionamount', 'value'],
}

/** Best-effort auto-pick of the column whose header matches one of the hints. */
function guessColumn(headers: string[], hints: string[]): string {
  const normalized = headers.map(normalizeHeader)
  for (const hint of hints) {
    const index = normalized.findIndex((header) => header === hint)
    if (index >= 0) return String(index)
  }
  for (const hint of hints) {
    const index = normalized.findIndex((header) => header.includes(hint))
    if (index >= 0) return String(index)
  }
  return NONE
}

/**
 * Finds the row that holds the column headers. Bank exports open with the account
 * number, the branch, the statement period and a blank line or two — taking row 1 as the
 * header (as this dialog used to) left every column named after a piece of that preamble
 * and nothing could be mapped.
 */
function findHeaderRow(matrix: CellValue[][]): number {
  const allHints = Object.values(COLUMN_HINTS).flat()
  let bestRow = 0
  let bestScore = 0
  const depth = Math.min(matrix.length, 25)
  for (let i = 0; i < depth; i += 1) {
    const row = matrix[i] || []
    let score = 0
    row.forEach((cell) => {
      if (typeof cell === 'number' || cell instanceof Date) return
      const header = normalizeHeader(cell)
      if (!header) return
      if (allHints.some((hint) => header === hint || header.includes(hint))) score += 1
    })
    if (score > bestScore) {
      bestScore = score
      bestRow = i
    }
  }
  return bestRow
}

/**
 * Date-only value as UTC midnight. Building it from the local-time Date would shift the
 * day backwards for every timezone east of UTC — a statement line dated the 16th would
 * reconcile against the 15th.
 */
function toIsoDate(value: Date): string {
  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())).toISOString()
}

interface StatementUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onParsed: (lines: StatementLineInput[]) => void
}

export function StatementUploadDialog({ open, onOpenChange, onParsed }: StatementUploadDialogProps) {
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<unknown[][]>([])
  const [amountMode, setAmountMode] = useState<AmountMode>('split')
  // Which row the headers were found on, shown so the user can tell at a glance that the
  // preamble above their data was skipped rather than misread.
  const [headerRowNumber, setHeaderRowNumber] = useState(0)
  const [dateCol, setDateCol] = useState(NONE)
  const [descCol, setDescCol] = useState(NONE)
  const [debitCol, setDebitCol] = useState(NONE)
  const [creditCol, setCreditCol] = useState(NONE)
  const [amountCol, setAmountCol] = useState(NONE)

  const reset = () => {
    setFileName('')
    setHeaders([])
    setRows([])
    setHeaderRowNumber(0)
    setDateCol(NONE)
    setDescCol(NONE)
    setDebitCol(NONE)
    setCreditCol(NONE)
    setAmountCol(NONE)
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!isSupportedSpreadsheet(file)) {
      toast.error(`"${file.name}" is not a spreadsheet — upload the CSV or Excel export from your bank`)
      return
    }

    try {
      const workbook = await readWorkbook(file)
      const sheetName = workbook.SheetNames[0]
      const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined
      if (!worksheet) {
        toast.error('This file has no sheets in it')
        return
      }

      const matrix = XLSX.utils.sheet_to_json<CellValue[]>(worksheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: false,
      })
      if (matrix.length < 2) {
        toast.error('No transaction rows found in this file')
        return
      }

      const headerIndex = findHeaderRow(matrix)
      const headerRow = (matrix[headerIndex] || []).map((cell) => parseText(cell))
      const dataRows = matrix
        .slice(headerIndex + 1)
        .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''))

      if (!dataRows.length) {
        toast.error('No transaction rows found under the header row')
        return
      }

      setFileName(file.name)
      setHeaderRowNumber(headerIndex + 1)
      setHeaders(headerRow)
      setRows(dataRows)
      setDateCol(guessColumn(headerRow, COLUMN_HINTS.date))
      setDescCol(guessColumn(headerRow, COLUMN_HINTS.description))
      setDebitCol(guessColumn(headerRow, COLUMN_HINTS.debit))
      setCreditCol(guessColumn(headerRow, COLUMN_HINTS.credit))
      setAmountCol(guessColumn(headerRow, COLUMN_HINTS.amount))
    } catch (error) {
      toast.error(
        error instanceof SpreadsheetError
          ? error.message
          : 'Could not read this file — make sure it is a valid CSV or Excel export'
      )
    }
  }

  // Rows the current mapping can actually turn into transactions, plus how many it had
  // to leave out — a silently shorter list is how a reconciliation ends up short.
  const { parsedLines, unreadableRows } = useMemo<{ parsedLines: StatementLineInput[]; unreadableRows: number }>(() => {
    if (!rows.length || dateCol === NONE) return { parsedLines: [], unreadableRows: 0 }

    const dateIdx = Number(dateCol)
    const descIdx = descCol !== NONE ? Number(descCol) : -1
    const debitIdx = debitCol !== NONE ? Number(debitCol) : -1
    const creditIdx = creditCol !== NONE ? Number(creditCol) : -1
    const amountIdx = amountCol !== NONE ? Number(amountCol) : -1

    const lines: StatementLineInput[] = []
    let skipped = 0

    rows.forEach((row) => {
      // Day-first for slash dates, which is how banks here write them. Reading them
      // month-first (what `new Date(text)` does) either threw the line away or filed it
      // under the wrong day for two thirds of the year.
      const parsedDate = parseDate((row[dateIdx] ?? null) as CellValue)
      if (!parsedDate.ok || !parsedDate.value) {
        skipped += 1
        return
      }
      const date = toIsoDate(parsedDate.value)
      const description = descIdx >= 0 ? parseText((row[descIdx] ?? null) as CellValue) : ''

      if (amountMode === 'split') {
        const debit = debitIdx >= 0 ? parseNumeric((row[debitIdx] ?? null) as CellValue) : null
        const credit = creditIdx >= 0 ? parseNumeric((row[creditIdx] ?? null) as CellValue) : null
        const debitAmount = debit && debit.ok ? Math.abs(debit.value) : 0
        const creditAmount = credit && credit.ok ? Math.abs(credit.value) : 0
        if (debitAmount > 0) lines.push({ date, description, amount: debitAmount, direction: 'out' })
        else if (creditAmount > 0) lines.push({ date, description, amount: creditAmount, direction: 'in' })
        else skipped += 1
      } else {
        const amount = amountIdx >= 0 ? parseNumeric((row[amountIdx] ?? null) as CellValue) : null
        const value = amount && amount.ok ? amount.value : 0
        if (value > 0) lines.push({ date, description, amount: value, direction: 'in' })
        else if (value < 0) lines.push({ date, description, amount: Math.abs(value), direction: 'out' })
        else skipped += 1
      }
    })

    return { parsedLines: lines, unreadableRows: skipped }
  }, [rows, dateCol, descCol, debitCol, creditCol, amountCol, amountMode])

  const canParse = headers.length > 0 && dateCol !== NONE && (amountMode === 'split' ? debitCol !== NONE || creditCol !== NONE : amountCol !== NONE)

  const handleContinue = () => {
    if (parsedLines.length === 0) {
      toast.error('No valid transactions could be parsed with the selected columns')
      return
    }
    onParsed(parsedLines)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next) }}>
      <DialogContent className='sm:max-w-[560px]'>
        <DialogHeader>
          <DialogTitle>Upload Bank Statement</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel export from your bank and match it against your books automatically.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {headers.length === 0 ? (
            <label className='flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center hover:bg-muted/40'>
              <Upload className='h-8 w-8 text-muted-foreground' />
              <span className='text-sm font-medium'>Click to select a CSV or Excel file</span>
              <span className='text-xs text-muted-foreground'>.csv, .xlsx, .xls</span>
              <input type='file' accept={IMPORT_FILE_ACCEPT} className='hidden' onChange={(event) => { void handleFileChange(event) }} />
            </label>
          ) : (
            <>
              <div className='flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm'>
                <FileSpreadsheet className='h-4 w-4 text-muted-foreground' />
                <span className='font-medium'>{fileName}</span>
                <span className='text-muted-foreground'>
                  · {rows.length} rows detected{headerRowNumber > 1 ? `, headers on row ${headerRowNumber}` : ''}
                </span>
                <Button type='button' variant='ghost' size='sm' className='ml-auto h-7' onClick={reset}>
                  Change file
                </Button>
              </div>

              <div className='space-y-2'>
                <Label>Date Column</Label>
                <Select value={dateCol} onValueChange={setDateCol}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {headers.map((header, index) => (
                      <SelectItem key={index} value={String(index)}>
                        {header || `Column ${XLSX.utils.encode_col(index)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label>Description Column (optional)</Label>
                <Select value={descCol} onValueChange={setDescCol}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {headers.map((header, index) => (
                      <SelectItem key={index} value={String(index)}>
                        {header || `Column ${XLSX.utils.encode_col(index)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label>Amount Format</Label>
                <RadioGroup value={amountMode} onValueChange={(v) => setAmountMode(v as AmountMode)} className='flex gap-4'>
                  <label className='flex items-center gap-2 text-sm'>
                    <RadioGroupItem value='split' /> Separate Debit / Credit columns
                  </label>
                  <label className='flex items-center gap-2 text-sm'>
                    <RadioGroupItem value='single' /> Single Amount column (+/-)
                  </label>
                </RadioGroup>
              </div>

              {amountMode === 'split' ? (
                <div className='grid grid-cols-2 gap-3'>
                  <div className='space-y-2'>
                    <Label>Debit Column (money out)</Label>
                    <Select value={debitCol} onValueChange={setDebitCol}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {headers.map((header, index) => (
                      <SelectItem key={index} value={String(index)}>
                        {header || `Column ${XLSX.utils.encode_col(index)}`}
                      </SelectItem>
                    ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-2'>
                    <Label>Credit Column (money in)</Label>
                    <Select value={creditCol} onValueChange={setCreditCol}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {headers.map((header, index) => (
                      <SelectItem key={index} value={String(index)}>
                        {header || `Column ${XLSX.utils.encode_col(index)}`}
                      </SelectItem>
                    ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className='space-y-2'>
                  <Label>Amount Column</Label>
                  <Select value={amountCol} onValueChange={setAmountCol}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {headers.map((header, index) => (
                      <SelectItem key={index} value={String(index)}>
                        {header || `Column ${XLSX.utils.encode_col(index)}`}
                      </SelectItem>
                    ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>Positive = money in, negative = money out.</p>
                </div>
              )}

              <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
                <span className='font-medium'>{parsedLines.length}</span> transactions will be parsed with the current mapping.
                {unreadableRows > 0 && (
                  <span className='text-muted-foreground'>
                    {' '}
                    {unreadableRows} row{unreadableRows !== 1 ? 's' : ''} had no readable date or amount and will be left out —
                    check the columns above if that looks wrong.
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => { reset(); onOpenChange(false) }}>
            Cancel
          </Button>
          <Button type='button' onClick={handleContinue} disabled={!canParse || parsedLines.length === 0}>
            Continue to Matching
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
