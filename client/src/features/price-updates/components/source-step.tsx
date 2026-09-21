import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import {
  BookmarkCheck,
  ClipboardPaste,
  FileSpreadsheet,
  FileText,
  FileUp,
  Image as ImageIcon,
  Info,
  Loader2,
  MessageCircle,
  ScanSearch,
  Sparkles,
  X,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { isSupportedSpreadsheet, SpreadsheetError } from '@/lib/excel-import'
import type { ListType } from '@/lib/price-update-rules'
import { cn } from '@/lib/utils'
import { normalizeSuppliersList } from '@/features/purchase-invoice/utils/catalog-helpers'
import { fetchSuppliers } from '@/stores/supplier.slice'
import type { AppDispatch, RootState } from '@/stores/store'
import {
  useAnalyzeMutation,
  useExtractFromFileMutation,
  type AnalyzeResponse,
  type SourceType,
} from '@/stores/priceUpdate.api'

import { IGNORED_REASON } from '../lib/labels'
import {
  bestSheetName,
  FIELD_CHOICES,
  loadSpreadsheet,
  parsePriceSheet,
  sheetToRows,
  type LoadedSpreadsheet,
} from '../lib/spreadsheet'
import type { ParsedSheet } from '@/lib/excel-import'

export interface SourceMeta {
  sourceType: SourceType
  fileName?: string
  supplierId: string | null
  supplierName?: string
  note: string
  /** The exact text that was analyzed, kept with the update for audit. */
  sourceText?: string
}

export interface AnalyzedSource {
  analysis: AnalyzeResponse
  source: SourceMeta
  /** What the list's numbers seem to be, when the list itself says so. */
  listTypeHint: ListType | null
}

const EXAMPLE = `*SAMSUNG*
Galaxy A15 4/128 - 38,500
Galaxy A25 8/256 = 62.5k
Galaxy S24 Ultra 12/256  445000/-

*INFINIX*
Hot 40i 4/128
Price: 27,500

Tecno Spark 20  DP 31000  RP 33999`

const looksLikeWhatsApp = (text: string) =>
  /^\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}/m.test(text) || /\*[^*\n]{2,}\*/.test(text)

/** Infers what the list's numbers are from labels/headers the parser saw. */
function hintFromAnalysis(analysis: AnalyzeResponse): ListType | null {
  const kinds = analysis.columnKinds
  if (kinds) {
    const real = kinds.filter((k) => k === 'cost' || k === 'price')
    if (real.length === 2 && real[0] === 'cost') return 'cost_price'
    if (real.length === 2 && real[0] === 'price') return 'price_cost'
    if (real.length === 1) return real[0] === 'cost' ? 'cost' : 'price'
  }
  const labelled = analysis.rows.filter((r) => r.values.some((v) => v.kind === 'cost') && r.values.some((v) => v.kind === 'price')).length
  if (analysis.rows.length && labelled / analysis.rows.length >= 0.5) return 'cost_price'
  const onlyCost = analysis.rows.filter((r) => r.values.length && r.values.every((v) => v.kind === 'cost')).length
  if (analysis.rows.length && onlyCost / analysis.rows.length >= 0.5) return 'cost'
  const onlyPrice = analysis.rows.filter((r) => r.values.length && r.values.every((v) => v.kind === 'price')).length
  if (analysis.rows.length && onlyPrice / analysis.rows.length >= 0.5) return 'price'
  return null
}

interface SheetState {
  loaded: LoadedSpreadsheet
  sheetName: string
  overrides: Record<number, string | null>
  parsed: ParsedSheet
}

interface SourceStepProps {
  onAnalyzed: (result: AnalyzedSource) => void
  onOpenSavedMatches: () => void
}

export function SourceStep({ onAnalyzed, onOpenSavedMatches }: SourceStepProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const suppliersRaw = useSelector((state: RootState) => state.supplier.data)

  const [tab, setTab] = useState<'paste' | 'upload'>('paste')
  const [text, setText] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [note, setNote] = useState('')
  const [sourceType, setSourceType] = useState<SourceType | null>(null)
  const [fileName, setFileName] = useState<string | undefined>()
  const [notice, setNotice] = useState<{ text: string; fromAi: boolean } | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [empty, setEmpty] = useState<AnalyzeResponse | null>(null)
  const [reading, setReading] = useState(false)

  const [analyze, { isLoading: analyzing }] = useAnalyzeMutation()
  const [extract] = useExtractFromFileMutation()

  useEffect(() => {
    dispatch(fetchSuppliers({ page: 1, limit: 1000 }))
  }, [dispatch])

  const supplierOptions = useMemo(
    () =>
      normalizeSuppliersList(suppliersRaw).map((supplier) => ({
        value: String((supplier as { id?: string; _id?: string }).id || (supplier as { _id?: string })._id),
        label: supplier.name,
        sublabel: supplier.phone,
      })),
    [suppliersRaw],
  )

  const sheetRows = useMemo(() => (sheet ? sheetToRows(sheet.parsed) : null), [sheet])

  const resetSource = () => {
    setSheet(null)
    setFileName(undefined)
    setNotice(null)
    setSourceType(null)
    setEmpty(null)
  }

  const applySheet = (loaded: LoadedSpreadsheet, sheetName: string, overrides: Record<number, string | null> = {}) => {
    try {
      const parsed = parsePriceSheet(loaded, sheetName, overrides)
      setSheet({ loaded, sheetName, overrides, parsed })
    } catch (err) {
      toast.error(err instanceof SpreadsheetError ? err.message : t('Could not read that sheet'))
    }
  }

  const handleFile = async (file: File) => {
    resetSource()
    const lower = file.name.toLowerCase()
    setReading(true)
    try {
      if (lower.endsWith('.txt')) {
        setText(await file.text())
        setSourceType('text')
        setFileName(file.name)
        setTab('paste')
        return
      }
      if (isSupportedSpreadsheet(file)) {
        const loaded = await loadSpreadsheet(file)
        const name = bestSheetName(loaded)
        if (!name) throw new SpreadsheetError(t('That file has no sheets.'))
        setSourceType('excel')
        setFileName(file.name)
        applySheet(loaded, name)
        return
      }
      if (lower.endsWith('.pdf') || file.type === 'application/pdf' || file.type.startsWith('image/')) {
        const res = await extract(file).unwrap()
        setText(res.text)
        setFileName(file.name)
        setSourceType(file.type.startsWith('image/') ? 'image' : 'pdf')
        setNotice({
          text:
            res.method === 'ai'
              ? res.notice || t('Read with AI — check the numbers before applying.')
              : `${t('Read from')} ${file.name}${res.pages ? ` (${res.pages} ${t(res.pages === 1 ? 'page' : 'pages')})` : ''}. ${t('Check it looks right, then continue.')}`,
          fromAi: res.method === 'ai',
        })
        if (res.truncated) toast.warning(t('The file is very long — only the first part was read.'))
        setTab('paste')
        return
      }
      toast.error(t('Upload a PDF, a photo, an Excel/CSV file, or a text file.'))
    } catch (err) {
      toast.error(err instanceof SpreadsheetError ? err.message : getErrorMessage(err, t('Could not read that file')))
    } finally {
      setReading(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive, open: openPicker } = useDropzone({
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (files[0]) void handleFile(files[0])
    },
  })

  const canAnalyze = sheet ? Boolean(sheetRows && sheetRows.rows.length) : text.trim().length > 0
  const supplierName = supplierOptions.find((s) => s.value === supplierId)?.label

  const run = async () => {
    setEmpty(null)
    try {
      const analysis = sheet && sheetRows
        ? await analyze({ rows: sheetRows.rows, supplierId: supplierId || null }).unwrap()
        : await analyze({ text, supplierId: supplierId || null }).unwrap()

      if (!analysis.rows.length) {
        setEmpty(analysis)
        return
      }
      onAnalyzed({
        analysis,
        source: {
          sourceType: sheet ? 'excel' : sourceType || (looksLikeWhatsApp(text) ? 'whatsapp' : 'text'),
          fileName,
          supplierId: supplierId || null,
          supplierName,
          note: note.trim(),
          sourceText: sheet ? undefined : text,
        },
        listTypeHint: sheet && sheetRows ? sheetRows.listType : hintFromAnalysis(analysis),
      })
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not read the price list')))
    }
  }

  const lineCount = text.split('\n').filter((l) => l.trim()).length

  return (
    <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]'>
      <div className='space-y-4'>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>{t('1. Give us the price list')}</CardTitle>
            <CardDescription>{t('Paste a WhatsApp message, or upload the supplier’s PDF, Excel sheet or a photo of it.')}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'paste' | 'upload')}>
              <TabsList className='grid w-full grid-cols-2 sm:w-auto sm:inline-grid'>
                <TabsTrigger value='paste' className='gap-2'>
                  <MessageCircle className='h-4 w-4' /> {t('Paste message')}
                </TabsTrigger>
                <TabsTrigger value='upload' className='gap-2'>
                  <FileUp className='h-4 w-4' /> {t('Upload file')}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div {...getRootProps()} className={cn('relative rounded-xl', isDragActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}>
              <input {...getInputProps()} />

              {tab === 'paste' && !sheet && (
                <div className='space-y-2'>
                  {notice && (
                    <Alert className={cn(notice.fromAi ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/40 bg-emerald-500/5')}>
                      {notice.fromAi ? <ScanSearch className='h-4 w-4' /> : <FileText className='h-4 w-4' />}
                      <AlertDescription className='flex items-start justify-between gap-2'>
                        <span>{notice.text}</span>
                        <button type='button' onClick={() => setNotice(null)} aria-label={t('Dismiss')} className='text-muted-foreground hover:text-foreground'>
                          <X className='h-4 w-4' />
                        </button>
                      </AlertDescription>
                    </Alert>
                  )}
                  <Textarea
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value)
                      setEmpty(null)
                    }}
                    placeholder={t('Paste the message here…') + '\n\n' + EXAMPLE}
                    className='min-h-[280px] resize-y font-mono text-[13px] leading-relaxed'
                    aria-label={t('Price list text')}
                    showVoiceInput={false}
                    spellCheck={false}
                  />
                  <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground'>
                    <span>{lineCount > 0 ? `${lineCount} ${t(lineCount === 1 ? 'line' : 'lines')}` : t('Nothing pasted yet')}</span>
                    <div className='flex flex-wrap gap-2'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={async () => {
                          try {
                            const pasted = await navigator.clipboard.readText()
                            if (pasted.trim()) {
                              setText(pasted)
                              setSourceType(null)
                              setEmpty(null)
                            } else toast.info(t('Your clipboard is empty.'))
                          } catch {
                            toast.info(t('Your browser blocked clipboard access — press Ctrl+V in the box instead.'))
                          }
                        }}
                      >
                        <ClipboardPaste className='mr-1.5 h-3.5 w-3.5' /> {t('Paste from clipboard')}
                      </Button>
                      {!text && (
                        <Button type='button' variant='ghost' size='sm' onClick={() => setText(EXAMPLE)}>
                          <Sparkles className='mr-1.5 h-3.5 w-3.5' /> {t('Try an example')}
                        </Button>
                      )}
                      {text && (
                        <Button type='button' variant='ghost' size='sm' onClick={() => { setText(''); resetSource() }}>
                          {t('Clear')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(tab === 'upload' || sheet) && (
                <div className='space-y-3'>
                  {!sheet && (
                    <button
                      type='button'
                      onClick={openPicker}
                      disabled={reading}
                      className={cn(
                        'flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-12 text-center transition-colors',
                        isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40',
                      )}
                    >
                      {reading ? <Loader2 className='h-9 w-9 animate-spin text-primary' /> : <FileUp className='h-9 w-9 text-primary' />}
                      <div>
                        <p className='font-medium'>{reading ? t('Reading your file…') : t('Drop a file here, or click to choose')}</p>
                        <p className='mt-1 text-sm text-muted-foreground'>{t('PDF · Excel / CSV · photo or screenshot')}</p>
                      </div>
                      <div className='flex flex-wrap justify-center gap-2 text-xs text-muted-foreground'>
                        <span className='inline-flex items-center gap-1 rounded-full border px-2 py-0.5'><FileText className='h-3 w-3' /> PDF</span>
                        <span className='inline-flex items-center gap-1 rounded-full border px-2 py-0.5'><FileSpreadsheet className='h-3 w-3' /> Excel / CSV</span>
                        <span className='inline-flex items-center gap-1 rounded-full border px-2 py-0.5'><ImageIcon className='h-3 w-3' /> {t('Photo')}</span>
                      </div>
                    </button>
                  )}
                  {sheet && sheetRows && (
                    <SheetPreview
                      state={sheet}
                      rowCount={sheetRows.rows.length}
                      onSheet={(name) => applySheet(sheet.loaded, name)}
                      onMap={(column, field) => {
                        const overrides = { ...sheet.overrides, [column]: field }
                        applySheet(sheet.loaded, sheet.sheetName, overrides)
                      }}
                      onRemove={resetSource}
                    />
                  )}
                </div>
              )}
            </div>

            {empty && <NothingFound analysis={empty} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>{t('2. Details (optional)')}</CardTitle>
            <CardDescription>{t('Choosing the supplier lets the system remember how their list names your products.')}</CardDescription>
          </CardHeader>
          <CardContent className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label>{t('Supplier')}</Label>
              <SearchableSelect
                options={supplierOptions}
                value={supplierId}
                onValueChange={setSupplierId}
                placeholder={t('Any / not sure')}
                searchPlaceholder={t('Search suppliers…')}
                emptyText={t('No suppliers found')}
                clearLabel={t('Clear supplier')}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='price-update-note'>{t('Note')}</Label>
              <Input id='price-update-note' value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. September rates')} />
            </div>
          </CardContent>
        </Card>

        <div className='flex flex-wrap items-center justify-end gap-3'>
          <Button size='lg' onClick={run} disabled={!canAnalyze || analyzing || reading} className='min-w-52'>
            {analyzing ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <ScanSearch className='mr-2 h-4 w-4' />}
            {analyzing ? t('Matching products…') : t('Read & match products')}
          </Button>
        </div>
      </div>

      <aside className='space-y-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='flex items-center gap-2 text-sm'>
              <Info className='h-4 w-4 text-primary' /> {t('What can I paste?')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm text-muted-foreground'>
            <p>{t('Anything a supplier sends — the system finds the products and prices:')}</p>
            <ul className='list-inside list-disc space-y-1'>
              <li>{t('“Galaxy A15 4/128 - 38,500”')}</li>
              <li>{t('A name, then “Price: 27500” on the next line')}</li>
              <li>{t('Brand headings with model lines below')}</li>
              <li>{t('“DP 31000  RP 33999” (dealer + retail)')}</li>
              <li>{t('“62.5k”, “1.2 lac”, “27500/-”')}</li>
              <li>{t('Urdu digits and product names')}</li>
            </ul>
            <p className='text-xs'>{t('Dates, phone numbers, RAM/storage like “4/128” and emoji are ignored automatically. You review everything before any price changes.')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='space-y-3 p-4'>
            <div className='flex items-start gap-3'>
              <BookmarkCheck className='mt-0.5 h-5 w-5 shrink-0 text-emerald-600' />
              <div className='space-y-1'>
                <p className='text-sm font-medium'>{t('Saved matches')}</p>
                <p className='text-xs text-muted-foreground'>{t('When you pick or confirm a product for a line, it’s remembered — next time that name matches instantly.')}</p>
              </div>
            </div>
            <Button variant='outline' size='sm' className='w-full' onClick={onOpenSavedMatches}>
              {t('View saved matches')}
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}

function NothingFound({ analysis }: { analysis: AnalyzeResponse }) {
  const { t } = useLanguage()
  const sample = analysis.ignored.slice(0, 6)
  return (
    <Alert variant='destructive'>
      <Info className='h-4 w-4' />
      <AlertTitle>{t('No prices found')}</AlertTitle>
      <AlertDescription className='space-y-2'>
        <p>{t('Each line needs a product name and a price, for example')} <span className='font-mono'>Galaxy A15 4/128 - 38500</span>.</p>
        {sample.length > 0 && (
          <ul className='space-y-0.5 text-xs'>
            {sample.map((l) => (
              <li key={l.line} className='truncate'>
                <span className='text-muted-foreground'>#{l.line}</span> <span className='font-mono'>{l.raw}</span>{' '}
                <span className='text-muted-foreground'>— {t(IGNORED_REASON[l.reason] || l.reason)}</span>
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  )
}

function SheetPreview({
  state,
  rowCount,
  onSheet,
  onMap,
  onRemove,
}: {
  state: SheetState
  rowCount: number
  onSheet: (name: string) => void
  onMap: (column: number, field: string | null) => void
  onRemove: () => void
}) {
  const { t } = useLanguage()
  const { parsed, loaded, sheetName } = state
  const missingName = !parsed.columns.some((c) => c.field === 'name')
  const missingPrice = !parsed.columns.some((c) => c.field === 'cost' || c.field === 'price')
  const withData = loaded.sheets.filter((s) => s.rowCount > 0)

  return (
    <div className='space-y-3 rounded-xl border bg-muted/20 p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <FileSpreadsheet className='h-5 w-5 shrink-0 text-emerald-600' />
          <span className='truncate text-sm font-medium'>{loaded.fileName}</span>
          <Badge variant='secondary'>{rowCount} {t(rowCount === 1 ? 'row' : 'rows')}</Badge>
        </div>
        <div className='flex items-center gap-2'>
          {withData.length > 1 && (
            <Select value={sheetName} onValueChange={onSheet}>
              <SelectTrigger className='h-8 w-44' aria-label={t('Sheet')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {withData.map((s) => (
                  <SelectItem key={s.name} value={s.name}>{s.name} ({s.rowCount})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant='ghost' size='sm' onClick={onRemove}>
            <X className='mr-1 h-4 w-4' /> {t('Remove')}
          </Button>
        </div>
      </div>

      {(missingName || missingPrice) && (
        <Alert variant='destructive'>
          <AlertDescription>
            {missingName ? t('Choose which column is the product name.') : t('Choose which column holds the prices.')}
          </AlertDescription>
        </Alert>
      )}

      <div>
        <p className='mb-1.5 text-xs font-medium text-muted-foreground'>{t('Which column is which? (fix it here if it guessed wrong)')}</p>
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
          {parsed.columns
            .filter((c) => c.header)
            .slice(0, 12)
            .map((column) => (
              <div key={column.column} className='flex items-center gap-2 rounded-lg border bg-background p-2'>
                <span className='w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground'>{column.letter}</span>
                <span className='min-w-0 flex-1 truncate text-xs' title={column.header}>{column.header}</span>
                <Select value={column.field || '__ignore'} onValueChange={(v) => onMap(column.column, v === '__ignore' ? null : v)}>
                  <SelectTrigger className='h-7 w-36 text-xs' aria-label={`${t('Column')} ${column.letter}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_CHOICES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{t(f.label)}</SelectItem>
                    ))}
                    <SelectItem value='__ignore'>{t('Ignore')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
