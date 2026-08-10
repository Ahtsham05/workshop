import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
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

type AmountMode = 'single' | 'split'

const NONE = '__none__'

/** Best-effort auto-pick of a column whose header loosely matches one of `candidates`. */
function guessColumn(headers: string[], candidates: string[]): string {
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h.includes(candidate))
    if (idx >= 0) return headers[idx]
  }
  return NONE
}

function parseAmount(value: unknown): number {
  if (value == null || value === '') return 0
  const cleaned = String(value).replace(/,/g, '').replace(/[^0-9.-]/g, '')
  const num = parseFloat(cleaned)
  return Number.isFinite(num) ? num : 0
}

function parseDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return null
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString()
  }
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
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
  const [dateCol, setDateCol] = useState(NONE)
  const [descCol, setDescCol] = useState(NONE)
  const [debitCol, setDebitCol] = useState(NONE)
  const [creditCol, setCreditCol] = useState(NONE)
  const [amountCol, setAmountCol] = useState(NONE)

  const reset = () => {
    setFileName('')
    setHeaders([])
    setRows([])
    setDateCol(NONE)
    setDescCol(NONE)
    setDebitCol(NONE)
    setCreditCol(NONE)
    setAmountCol(NONE)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', codepage: 65001 })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true }) as unknown[][]

        if (aoa.length < 2) {
          toast.error('No transaction rows found in this file')
          return
        }

        const headerRow = aoa[0].map((h) => String(h ?? '').trim())
        const dataRows = aoa.slice(1).filter((row) => row.some((cell) => cell != null && String(cell).trim() !== ''))

        setHeaders(headerRow)
        setRows(dataRows)
        setDateCol(guessColumn(headerRow, ['date']))
        setDescCol(guessColumn(headerRow, ['description', 'narration', 'details', 'particular', 'memo']))
        setDebitCol(guessColumn(headerRow, ['debit', 'withdrawal', 'paid out']))
        setCreditCol(guessColumn(headerRow, ['credit', 'deposit', 'paid in']))
        setAmountCol(guessColumn(headerRow, ['amount']))
      } catch {
        toast.error('Could not read this file — make sure it is a valid CSV or Excel export')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const parsedLines = useMemo<StatementLineInput[]>(() => {
    if (!rows.length || dateCol === NONE) return []
    const columnIndex = (name: string) => headers.indexOf(name)
    const dateIdx = columnIndex(dateCol)
    const descIdx = descCol !== NONE ? columnIndex(descCol) : -1
    const debitIdx = debitCol !== NONE ? columnIndex(debitCol) : -1
    const creditIdx = creditCol !== NONE ? columnIndex(creditCol) : -1
    const amountIdx = amountCol !== NONE ? columnIndex(amountCol) : -1

    const lines: StatementLineInput[] = []
    rows.forEach((row) => {
      const date = parseDate(row[dateIdx])
      if (!date) return
      const description = descIdx >= 0 ? String(row[descIdx] ?? '').trim() : ''

      if (amountMode === 'split') {
        const debit = debitIdx >= 0 ? Math.abs(parseAmount(row[debitIdx])) : 0
        const credit = creditIdx >= 0 ? Math.abs(parseAmount(row[creditIdx])) : 0
        if (debit > 0) lines.push({ date, description, amount: debit, direction: 'out' })
        else if (credit > 0) lines.push({ date, description, amount: credit, direction: 'in' })
      } else {
        const amount = amountIdx >= 0 ? parseAmount(row[amountIdx]) : 0
        if (amount > 0) lines.push({ date, description, amount, direction: 'in' })
        else if (amount < 0) lines.push({ date, description, amount: Math.abs(amount), direction: 'out' })
      }
    })
    return lines
  }, [rows, headers, dateCol, descCol, debitCol, creditCol, amountCol, amountMode])

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
              <input type='file' accept='.csv,.xlsx,.xls' className='hidden' onChange={handleFileChange} />
            </label>
          ) : (
            <>
              <div className='flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm'>
                <FileSpreadsheet className='h-4 w-4 text-muted-foreground' />
                <span className='font-medium'>{fileName}</span>
                <span className='text-muted-foreground'>· {rows.length} rows detected</span>
                <Button type='button' variant='ghost' size='sm' className='ml-auto h-7' onClick={reset}>
                  Change file
                </Button>
              </div>

              <div className='space-y-2'>
                <Label>Date Column</Label>
                <Select value={dateCol} onValueChange={setDateCol}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label>Description Column (optional)</Label>
                <Select value={descCol} onValueChange={setDescCol}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
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
                        {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-2'>
                    <Label>Credit Column (money in)</Label>
                    <Select value={creditCol} onValueChange={setCreditCol}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
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
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>Positive = money in, negative = money out.</p>
                </div>
              )}

              <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
                <span className='font-medium'>{parsedLines.length}</span> transactions will be parsed with the current mapping.
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
