import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDispatch } from 'react-redux'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { AlertCircle, Building2, Loader2, Package, ScanLine, Search } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { onEnterAdvance, focusField } from '@/lib/invoice-form-keyboard'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import type { AppDispatch } from '@/stores/store'
import { generateBatchNumber } from './variants/generate-variant-combinations'
import { ImportSerialEntryDialog } from './import-serial-entry-dialog'
import {
  invalidateImportableMasterProducts,
  useGetImportableMasterProductsQuery,
  useImportMasterProductsMutation,
  useLazyGetImportableMasterProductIdsQuery,
  type ImeiEntry,
  type ImportableMasterProduct,
  type ImportMasterProductItem,
} from '@/stores/masterProduct.api'
import { isRequestTimeoutError, getTimeoutErrorMessage } from '@/lib/api-timeout'

const SEARCH_DEBOUNCE_MS = 300

// Rows are server-paged and server-searched (see
// masterProduct.service.js#getImportableMasterProducts). 100 keeps a page quick to render
// with every row's fields open; "Select all" covers importing more than one page at once.
const PAGE_SIZE = 100

// The server writes a whole request in a fixed handful of queries however many products
// it carries (masterProduct.service.js#importMasterProducts), so chunks aren't about
// server time any more — they give a large import visible progress, and mean an
// interrupted request only costs its own chunk. Retrying is always safe: products already
// imported are skipped server-side.
const IMPORT_CHUNK_SIZE = 250

// Per-device memory of the Active switch, so a shop that always imports straight to
// sale doesn't have to flip it every time.
const ACTIVATE_PREF_KEY = 'import-branch-products:activate'

const readActivatePref = () => {
  try {
    return localStorage.getItem(ACTIVATE_PREF_KEY) !== 'false'
  } catch {
    return true
  }
}

const writeActivatePref = (value: boolean) => {
  try {
    localStorage.setItem(ACTIVATE_PREF_KEY, String(value))
  } catch {
    // Storage blocked — the switch still works for this session.
  }
}

type FieldName = 'qty' | 'batch' | 'price' | 'cost'

// Kept as the raw input text so a field can be cleared and retyped; parsed on import.
interface RowState {
  price: string
  cost: string
  stockQuantity: string
  batchNumber: string
  imeis: ImeiEntry[]
}

const defaultRowState = (row: ImportableMasterProduct): RowState => ({
  price: String(row.suggestedPrice ?? 0),
  cost: String(row.suggestedCost ?? 0),
  stockQuantity: '',
  batchNumber: '',
  imeis: [],
})

const tracksBatch = (row: ImportableMasterProduct) => !!(row.trackBatch || row.trackExpiry)
const tracksSerial = (row: ImportableMasterProduct) => !!(row.trackImei || row.trackSerial)
const toQuantity = (raw: string) => Math.max(Number(raw) || 0, 0)
// A cleared price/cost field falls back to the suggestion rather than silently becoming 0.
const toAmount = (raw: string, fallback: number) => (raw.trim() === '' ? fallback : Math.max(Number(raw) || 0, 0))

/** The client-side twin of the server's opening-stock rule, so a mistake costs no round trip. */
const openingStockProblem = (row: ImportableMasterProduct, state: RowState): string | null => {
  const qty = row.acceptsOpeningStock ? toQuantity(state.stockQuantity) : 0
  if (qty <= 0) return null
  if (tracksSerial(row) && state.imeis.length !== qty) {
    return `Enter exactly ${qty} ${row.trackSerial ? 'serial' : 'IMEI'} number(s) for the opening stock — ${state.imeis.length} entered`
  }
  if (tracksBatch(row) && !state.batchNumber.trim()) return 'Enter a batch number for the opening stock'
  return null
}

/**
 * Label-above-input group for the per-row detail fields. A flex-wrap row of these (not
 * fixed table columns) lets the fields drop onto their own line on a narrow window
 * instead of overflowing the dialog where they can't be reached.
 */
function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-[10px] font-medium text-muted-foreground'>{label}</span>
      {children}
    </div>
  )
}

interface ImportRowProps {
  row: ImportableMasterProduct
  index: number
  checked: boolean
  value: RowState | undefined
  error: string | undefined
  disabled: boolean
  onToggle: (id: string) => void
  onUpdate: (row: ImportableMasterProduct, patch: Partial<RowState>) => void
  onOpenSerial: (id: string) => void
  registerField: (id: string, field: FieldName, el: HTMLInputElement | null) => void
  onAdvance: (index: number, from: FieldName, row: ImportableMasterProduct) => void
}

/**
 * One product row. Memoized with stable callbacks from the dialog, so ticking one box or
 * typing in one field re-renders that row only — not the whole page of them.
 */
const ImportRow = memo(function ImportRow({
  row,
  index,
  checked,
  value,
  error,
  disabled,
  onToggle,
  onUpdate,
  onOpenSerial,
  registerField,
  onAdvance,
}: ImportRowProps) {
  const { t } = useLanguage()
  const id = row.masterProductId
  const state = value ?? defaultRowState(row)
  const qty = row.acceptsOpeningStock ? toQuantity(state.stockQuantity) : 0
  const needsBatch = tracksBatch(row) && qty > 0
  const needsSerial = tracksSerial(row) && qty > 0

  return (
    <div
      className={cn(
        'px-4 py-3 transition-colors sm:px-6',
        error ? 'bg-destructive/5' : checked ? 'bg-primary/5' : 'hover:bg-muted/40'
      )}
    >
      <div className='flex flex-wrap items-center gap-3'>
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={() => onToggle(id)}
          aria-label={row.name}
          className='shrink-0'
        />
        <button
          type='button'
          disabled={disabled}
          onClick={() => onToggle(id)}
          className='flex min-w-0 flex-1 basis-56 items-center gap-3 text-left disabled:cursor-not-allowed'
        >
          {row.image?.url ? (
            <img src={row.image.url} alt='' loading='lazy' className='h-9 w-9 shrink-0 rounded-md border object-cover' />
          ) : (
            <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted'>
              <Package className='h-4 w-4 text-muted-foreground' />
            </span>
          )}
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm font-medium'>{row.name}</span>
            <span className='mt-0.5 flex min-w-0 flex-wrap items-center gap-1'>
              {row.category ? (
                <Badge variant='secondary' className='px-1.5 py-0 text-[10px]'>
                  {row.category}
                </Badge>
              ) : null}
              {row.hasVariants ? (
                <Badge variant='outline' className='px-1.5 py-0 text-[10px]'>
                  {t('n_variants', { count: String(row.variantCount) })}
                </Badge>
              ) : null}
              {tracksBatch(row) ? (
                <Badge variant='outline' className='px-1.5 py-0 text-[10px]'>
                  {t('batch')}
                </Badge>
              ) : null}
              {tracksSerial(row) ? (
                <Badge variant='outline' className='px-1.5 py-0 text-[10px]'>
                  {row.trackSerial ? t('serial') : 'IMEI'}
                </Badge>
              ) : null}
              <span
                className='inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground'
                title={row.carriedAtBranches.join(', ')}
              >
                <Building2 className='h-3 w-3 shrink-0' />
                <span className='truncate'>{row.carriedAtBranches.join(', ')}</span>
              </span>
            </span>
          </span>
        </button>

        {/* Only a picked product shows its fields — keeps a long list scannable. */}
        {checked && (
          <div className='flex w-full shrink-0 flex-wrap items-end gap-2 pl-7 sm:w-auto sm:pl-0'>
            {row.acceptsOpeningStock ? (
              <FieldGroup label={t('opening_qty')}>
                <Input
                  ref={(el) => registerField(id, 'qty', el)}
                  type='number'
                  min={0}
                  inputMode='decimal'
                  placeholder='0'
                  disabled={disabled}
                  value={state.stockQuantity}
                  onChange={(e) => onUpdate(row, { stockQuantity: e.target.value })}
                  onKeyDown={(e) => onEnterAdvance(e, () => onAdvance(index, 'qty', row))}
                  className='h-8 w-20 text-sm'
                />
              </FieldGroup>
            ) : (
              <p className='max-w-[9rem] self-center text-[11px] leading-tight text-muted-foreground'>
                {t('import_stock_per_variant_hint')}
              </p>
            )}

            {needsBatch ? (
              <FieldGroup label={t('batch_serial_label')}>
                <Input
                  ref={(el) => registerField(id, 'batch', el)}
                  placeholder='Batch number'
                  showVoiceInput={false}
                  disabled={disabled}
                  value={state.batchNumber}
                  onChange={(e) => onUpdate(row, { batchNumber: e.target.value })}
                  onKeyDown={(e) => onEnterAdvance(e, () => onAdvance(index, 'batch', row))}
                  className='h-8 w-40 text-sm'
                />
              </FieldGroup>
            ) : needsSerial ? (
              <FieldGroup label={t('batch_serial_label')}>
                <button
                  type='button'
                  disabled={disabled}
                  onClick={() => onOpenSerial(id)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
                    state.imeis.length >= qty
                      ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
                      : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400'
                  )}
                >
                  <ScanLine className='h-3 w-3' />
                  {state.imeis.length}/{qty}
                </button>
              </FieldGroup>
            ) : null}

            <FieldGroup label={t('price')}>
              <Input
                ref={(el) => registerField(id, 'price', el)}
                type='number'
                min={0}
                inputMode='decimal'
                disabled={disabled}
                value={state.price}
                onChange={(e) => onUpdate(row, { price: e.target.value })}
                onKeyDown={(e) => onEnterAdvance(e, () => onAdvance(index, 'price', row))}
                className='h-8 w-24 text-sm'
              />
            </FieldGroup>

            <FieldGroup label={t('cost')}>
              <Input
                ref={(el) => registerField(id, 'cost', el)}
                type='number'
                min={0}
                inputMode='decimal'
                disabled={disabled}
                value={state.cost}
                onChange={(e) => onUpdate(row, { cost: e.target.value })}
                onKeyDown={(e) => onEnterAdvance(e, () => onAdvance(index, 'cost', row))}
                className='h-8 w-24 text-sm'
              />
            </FieldGroup>
          </div>
        )}
      </div>

      {error ? (
        <p role='alert' className='mt-1.5 flex items-start gap-1.5 pl-7 text-xs text-destructive'>
          <AlertCircle className='mt-px h-3.5 w-3.5 shrink-0' />
          {error}
        </p>
      ) : null}
    </div>
  )
})

function ListSkeleton() {
  return (
    <div className='divide-y'>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className='flex items-center gap-3 px-4 py-3 sm:px-6'>
          <Skeleton className='h-4 w-4 rounded' />
          <Skeleton className='h-9 w-9 rounded-md' />
          <div className='flex-1 space-y-1.5'>
            <Skeleton className='h-3.5 w-2/5' />
            <Skeleton className='h-3 w-1/4' />
          </div>
        </div>
      ))}
    </div>
  )
}

interface ImportProductsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

export function ImportProductsDialog({ open, onOpenChange, onImported }: ImportProductsDialogProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)

  // isLoading (first fetch only) gates the body; a background refetch keeps the current
  // rows on screen and only shows a small spinner.
  const { data, isLoading, isFetching } = useGetImportableMasterProductsQuery(
    { search: debouncedSearch, page, limit: PAGE_SIZE },
    { skip: !open, refetchOnMountOrArgChange: 30 }
  )
  const [fetchAllIds, { isFetching: isSelectingAll }] = useLazyGetImportableMasterProductIdsQuery()
  const [importMasterProducts] = useImportMasterProductsMutation()

  const rows = useMemo(() => data?.results ?? [], [data])
  const totalResults = data?.totalResults ?? 0
  const totalPages = data?.totalPages ?? 0

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [overrides, setOverrides] = useState<Record<string, RowState>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serialDialogRowId, setSerialDialogRowId] = useState<string | null>(null)
  const [activate, setActivate] = useState(readActivatePref)
  // null when not importing; otherwise how many selected products have been sent so far.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const isImporting = progress !== null

  // A selection can span pages and searches, so every row ever shown is kept by id —
  // that's what the import and the serial dialog read from, not just the current page.
  const [rowCache, setRowCache] = useState<Record<string, ImportableMasterProduct>>({})
  useEffect(() => {
    if (!rows.length) return
    setRowCache((prev) => {
      let next: Record<string, ImportableMasterProduct> | null = null
      for (const row of rows) {
        if (prev[row.masterProductId] !== row) {
          next ??= { ...prev }
          next[row.masterProductId] = row
        }
      }
      return next ?? prev
    })
  }, [rows])

  // Start clean on every open rather than silently carrying over the last session's picks.
  // rowCache is deliberately kept: it's server data, not a choice, and the page RTK Query
  // already has cached arrives in the same commit as `open` — clearing the cache here
  // would wipe those rows right after they were added, and edits to them would be lost.
  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set())
    setOverrides({})
    setErrors({})
    setSerialDialogRowId(null)
    setSearchInput('')
    setPage(1)
  }, [open])

  // A new search starts from its first page.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Importing the last page's products shrinks totalPages under the current page.
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages)
  }, [totalPages, page])

  // Refs let the memoized rows' callbacks stay stable while still reading current state.
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const overridesRef = useRef(overrides)
  overridesRef.current = overrides
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const importButtonRef = useRef<HTMLButtonElement | null>(null)

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const updateRow = useCallback((row: ImportableMasterProduct, patch: Partial<RowState>) => {
    setOverrides((prev) => {
      const current = prev[row.masterProductId] ?? defaultRowState(row)
      const next = { ...current, ...patch }
      // Suggest a batch number the moment opening stock makes one necessary.
      if (patch.stockQuantity !== undefined && tracksBatch(row) && toQuantity(patch.stockQuantity) > 0 && !current.batchNumber) {
        next.batchNumber = generateBatchNumber()
      }
      return { ...prev, [row.masterProductId]: next }
    })
    setErrors((prev) => {
      if (!prev[row.masterProductId]) return prev
      const next = { ...prev }
      delete next[row.masterProductId]
      return next
    })
  }, [])

  const registerField = useCallback((id: string, field: FieldName, el: HTMLInputElement | null) => {
    fieldRefs.current[`${id}:${field}`] = el
  }, [])

  // Enter moves qty → batch (or the serial dialog) → price → cost → the next picked row,
  // then to the Import button — same parent-owned ref map as the Invoice/Purchase rows
  // (see lib/invoice-form-keyboard.ts).
  const focusRowField = useCallback((row: ImportableMasterProduct, field: FieldName) => {
    focusField(fieldRefs.current[`${row.masterProductId}:${field}`])
  }, [])

  const focusNextPickedRow = useCallback((fromIndex: number) => {
    const pageRows = rowsRef.current
    for (let i = fromIndex; i < pageRows.length; i += 1) {
      const id = pageRows[i].masterProductId
      const el = fieldRefs.current[`${id}:qty`] ?? fieldRefs.current[`${id}:price`]
      if (el) return focusField(el)
    }
    focusField(importButtonRef.current, false)
  }, [])

  const advance = useCallback(
    (index: number, from: FieldName, row: ImportableMasterProduct) => {
      const state = overridesRef.current[row.masterProductId] ?? defaultRowState(row)
      const qty = row.acceptsOpeningStock ? toQuantity(state.stockQuantity) : 0
      if (from === 'qty') {
        if (tracksBatch(row) && qty > 0) return focusRowField(row, 'batch')
        if (tracksSerial(row) && qty > 0) return setSerialDialogRowId(row.masterProductId)
        return focusRowField(row, 'price')
      }
      if (from === 'batch') return focusRowField(row, 'price')
      if (from === 'price') return focusRowField(row, 'cost')
      focusNextPickedRow(index + 1)
    },
    [focusRowField, focusNextPickedRow]
  )

  const pageIds = useMemo(() => rows.map((r) => r.masterProductId), [rows])
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const togglePage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      pageIds.forEach((id) => (allOnPageSelected ? next.delete(id) : next.add(id)))
      return next
    })
  }

  const selectAllMatching = async () => {
    try {
      const { ids } = await fetchAllIds({ search: debouncedSearch }).unwrap()
      setSelectedIds((prev) => new Set([...prev, ...ids]))
    } catch {
      toast.error(t('products_import_select_all_failed'))
    }
  }

  const handleActivateChange = (next: boolean) => {
    setActivate(next)
    writeActivatePref(next)
  }

  const selectedCount = selectedIds.size

  const handleImport = async () => {
    if (isImporting || selectedCount === 0) return
    const ids = [...selectedIds]

    // Rows never paged to have no edits (so no opening stock) and can't fail this check.
    const problems: Record<string, string> = {}
    for (const id of ids) {
      const row = rowCache[id]
      const state = overrides[id]
      if (!row || !state) continue
      const problem = openingStockProblem(row, state)
      if (problem) problems[id] = problem
    }
    const problemIds = Object.keys(problems)
    if (problemIds.length) {
      setErrors(problems)
      const first = rowCache[problemIds[0]]
      toast.error(t('products_import_fix_rows', { count: String(problemIds.length) }), {
        description: `${first?.name}: ${problems[problemIds[0]]}`,
      })
      return
    }

    const items: ImportMasterProductItem[] = ids.map((id) => {
      const row = rowCache[id]
      if (!row) return { masterProductId: id }
      const state = overrides[id] ?? defaultRowState(row)
      const qty = row.acceptsOpeningStock ? toQuantity(state.stockQuantity) : 0
      return {
        masterProductId: id,
        price: toAmount(state.price, row.suggestedPrice),
        cost: toAmount(state.cost, row.suggestedCost),
        stockQuantity: qty,
        batchNumber: qty > 0 && tracksBatch(row) ? state.batchNumber.trim() : undefined,
        imeis: qty > 0 && tracksSerial(row) ? state.imeis : undefined,
      }
    })

    setErrors({})
    setProgress({ done: 0, total: items.length })
    const failures: Record<string, string> = {}
    let importedCount = 0
    let alreadyImportedCount = 0
    let sent = 0
    let interruption: unknown = null
    try {
      for (let i = 0; i < items.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = items.slice(i, i + IMPORT_CHUNK_SIZE)
        const result = await importMasterProducts({ items: chunk, activate }).unwrap()
        importedCount += result.importedCount
        alreadyImportedCount += result.alreadyImportedCount
        result.failed.forEach((f) => {
          failures[f.masterProductId] = f.error
        })
        sent += chunk.length
        // Everything that landed leaves the selection; failures stay picked for a retry.
        setSelectedIds((prev) => {
          const next = new Set(prev)
          chunk.forEach((item) => {
            if (!failures[item.masterProductId]) next.delete(item.masterProductId)
          })
          return next
        })
        setProgress({ done: sent, total: items.length })
      }
    } catch (err) {
      interruption = err
    } finally {
      setProgress(null)
      // One list refresh for the whole import, not one per chunk.
      dispatch(invalidateImportableMasterProducts())
      if (importedCount > 0) onImported?.()
    }

    const failedIds = Object.keys(failures)
    if (failedIds.length) setErrors(failures)

    if (interruption) {
      if (sent > 0) {
        toast.error(t('products_import_partial', { done: String(sent), total: String(items.length) }))
      } else if (isRequestTimeoutError(interruption)) {
        // Only the client gave up waiting — the server may still finish this chunk.
        toast.error(getTimeoutErrorMessage('import these products'))
      } else {
        toast.error(t('products_import_failed'))
      }
      return
    }

    if (failedIds.length) {
      const first = failedIds[0]
      toast.warning(
        t('products_import_some_failed', { imported: String(importedCount), failed: String(failedIds.length) }),
        { description: `${rowCache[first]?.name ?? t('product')}: ${failures[first]}` }
      )
      return
    }

    if (importedCount > 0) {
      toast.success(t('products_imported_success', { count: String(importedCount) }), {
        description: activate ? t('products_imported_active_hint') : t('products_imported_inactive_hint'),
      })
    } else if (alreadyImportedCount > 0) {
      toast.info(t('products_already_imported', { count: String(alreadyImportedCount) }))
    }
    onOpenChange(false)
  }

  const serialDialogRow = serialDialogRowId ? rowCache[serialDialogRowId] : undefined
  const serialDialogState = serialDialogRow ? (overrides[serialDialogRow.masterProductId] ?? defaultRowState(serialDialogRow)) : undefined

  const noProductsAtAll = !isLoading && totalResults === 0 && !debouncedSearch.trim()
  const noSearchMatches = !isLoading && totalResults === 0 && !!debouncedSearch.trim()
  // One page is covered by its own checkbox; across pages, fetch just the matching ids.
  const canSelectAllMatching = totalPages > 1 && selectedCount < totalResults

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-import doesn't stop the request in flight — it only loses track of
        // how far the import got — so close attempts are ignored until it finishes.
        if (!next && isImporting) return
        onOpenChange(next)
      }}
    >
      {/* Fixed header/footer with only the list scrolling, so the footer is always reachable. */}
      <DialogContent className='flex max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-[min(96vw,1024px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl'>
        <DialogHeader className='shrink-0 gap-1 border-b px-4 py-4 text-left sm:px-6'>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <Building2 className='h-4 w-4 text-blue-600' />
            {t('import_from_other_branches')}
          </DialogTitle>
          <DialogDescription>{t('import_from_other_branches_desc')}</DialogDescription>
        </DialogHeader>

        {noProductsAtAll ? (
          <div className='flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-muted-foreground'>
            <Building2 className='h-8 w-8 text-muted-foreground/50' />
            {t('no_importable_products')}
          </div>
        ) : (
          <div className='flex min-h-0 flex-1 flex-col'>
            <div className='flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 sm:px-6'>
              <div className='relative w-full sm:max-w-xs'>
                <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  autoFocus
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t('search_products')}
                  aria-label={t('search_products')}
                  disabled={isImporting}
                  className='pl-9'
                />
              </div>
              <div className='ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
                {isFetching && !isLoading ? <Loader2 className='h-3.5 w-3.5 animate-spin text-muted-foreground' /> : null}
                <span className='text-muted-foreground'>
                  {t('n_selected_of_total', { selected: String(selectedCount), total: String(totalResults) })}
                </span>
                {canSelectAllMatching ? (
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    className='h-auto p-0 text-xs'
                    disabled={isSelectingAll || isImporting}
                    onClick={selectAllMatching}
                  >
                    {isSelectingAll ? <Loader2 className='mr-1 h-3 w-3 animate-spin' /> : null}
                    {t('select_all_n', { count: String(totalResults) })}
                  </Button>
                ) : null}
                {selectedCount > 0 ? (
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    className='h-auto p-0 text-xs text-muted-foreground'
                    disabled={isImporting}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    {t('clear_selection')}
                  </Button>
                ) : null}
              </div>
            </div>

            {isLoading ? (
              <ListSkeleton />
            ) : noSearchMatches ? (
              <div className='flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground'>
                <Search className='h-8 w-8 text-muted-foreground/50' />
                {t('no_products_match_search')}
                <Button type='button' variant='ghost' size='sm' onClick={() => setSearchInput('')}>
                  {t('clear')}
                </Button>
              </div>
            ) : (
              <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain'>
                <div className='sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur sm:px-6'>
                  <Checkbox
                    id='import-select-page'
                    checked={allOnPageSelected}
                    onCheckedChange={togglePage}
                    disabled={isImporting}
                  />
                  <Label htmlFor='import-select-page' className='cursor-pointer text-xs font-medium text-muted-foreground'>
                    {totalPages > 1 ? t('select_this_page_n', { count: String(pageIds.length) }) : t('select_all')}
                  </Label>
                </div>
                <div className='divide-y'>
                  {rows.map((row, index) => (
                    <ImportRow
                      key={row.masterProductId}
                      row={row}
                      index={index}
                      checked={selectedIds.has(row.masterProductId)}
                      value={overrides[row.masterProductId]}
                      error={errors[row.masterProductId]}
                      disabled={isImporting}
                      onToggle={toggleOne}
                      onUpdate={updateRow}
                      onOpenSerial={setSerialDialogRowId}
                      registerField={registerField}
                      onAdvance={advance}
                    />
                  ))}
                </div>
              </div>
            )}

            {!noSearchMatches && totalPages > 1 && (
              <div className='shrink-0 border-t px-4 py-2 sm:px-6'>
                <SimplePagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalResults={totalResults}
                  limit={PAGE_SIZE}
                  onPageChange={setPage}
                  className='border-t-0 pt-0'
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className='shrink-0 flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
          {isImporting && progress ? (
            <div className='flex w-full items-center gap-3 py-1'>
              <Loader2 className='h-4 w-4 shrink-0 animate-spin text-primary' />
              <div className='min-w-0 flex-1'>
                <div className='text-sm text-muted-foreground'>
                  {t('importing_n_of_total', { done: String(progress.done), total: String(progress.total) })}
                </div>
                <div className='mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                  <div
                    className='h-full rounded-full bg-primary transition-all duration-300'
                    style={{ width: `${Math.max(4, Math.round((progress.done / progress.total) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className='flex items-start gap-3'>
                <Switch id='import-activate' checked={activate} onCheckedChange={handleActivateChange} className='mt-0.5' />
                <Label htmlFor='import-activate' className='flex cursor-pointer flex-col items-start gap-0.5'>
                  <span className='text-sm font-medium'>{t('import_as_active')}</span>
                  <span className='text-xs font-normal text-muted-foreground'>
                    {activate ? t('import_as_active_on_hint') : t('import_as_active_off_hint')}
                  </span>
                </Label>
              </div>
              <div className='flex flex-col-reverse gap-2 sm:flex-row'>
                <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
                  {t('cancel')}
                </Button>
                <Button ref={importButtonRef} type='button' onClick={handleImport} disabled={selectedCount === 0}>
                  {t('import_n_products', { count: String(selectedCount) })}
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      {serialDialogRow && serialDialogState && (
        <ImportSerialEntryDialog
          open
          onOpenChange={(next) => {
            if (next) return
            const row = serialDialogRow
            setSerialDialogRowId(null)
            // Continue the Enter chain into Price once serial entry is done.
            focusRowField(row, 'price')
          }}
          productName={serialDialogRow.name}
          isSerial={!!serialDialogRow.trackSerial}
          targetCount={toQuantity(serialDialogState.stockQuantity)}
          value={serialDialogState.imeis}
          onChange={(next) => updateRow(serialDialogRow, { imeis: next })}
        />
      )}
    </Dialog>
  )
}
