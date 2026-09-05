import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Loader2, Package, Building2, ScanLine, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/context/language-context'
import { onEnterAdvance, focusField } from '@/lib/invoice-form-keyboard'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { generateBatchNumber } from './variants/generate-variant-combinations'
import { ImportSerialEntryDialog } from './import-serial-entry-dialog'
import {
  useGetImportableMasterProductsQuery,
  useImportMasterProductsMutation,
  type ImeiEntry,
  type ImportableMasterProduct,
} from '@/stores/masterProduct.api'
import { isRequestTimeoutError, getTimeoutErrorMessage } from '@/lib/api-timeout'

const SEARCH_DEBOUNCE_MS = 300

// The org catalog this list draws from can run into the thousands — fetching (and
// rendering) all of them at once on every dialog open, the way this used to work, meant
// shipping every field of every master product over the wire and mounting that many rows
// in the DOM up front. A page at a time, searched server-side, keeps both bounded no
// matter how large the catalog gets.
const PAGE_SIZE = 500

// Send the import as several small requests instead of one giant one. A single request
// for 200+ products takes tens of seconds; if *anything* interrupts a request that long —
// a real timeout, a network blip, a dev-server reload, the tab losing focus — the whole
// batch is left in limbo: some products already committed server-side, others not, with
// no way for the client to know which. Chunking means an interruption only ever costs the
// current small chunk, the completed chunks stay safely imported, and the user gets live
// progress instead of a single all-or-nothing spinner.
const IMPORT_CHUNK_SIZE = 25

interface ImportProductsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

interface RowState {
  price: number
  cost: number
  stockQuantity: number
  batchNumber: string
  imeis: ImeiEntry[]
}

/**
 * Label-above-input group for the per-row detail fields. A plain flex-wrap row of these
 * (rather than fixed table columns) means the fields always wrap onto their own line
 * instead of silently overflowing the dialog on a narrow window — see the "Import from
 * other branches" bug where Opening Qty/Price/Cost lived in table columns wide enough to
 * push past the dialog edge, inside a vertical-only ScrollArea that clips horizontal
 * overflow instead of scrolling to it. That made the fields exist in the DOM but be
 * genuinely unreachable, so imports silently went through with only default price/cost
 * and zero opening quantity.
 */
function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-1'>
      <label className='text-[10px] font-medium text-muted-foreground'>{label}</label>
      {children}
    </div>
  )
}

export function ImportProductsDialog({ open, onOpenChange, onImported }: ImportProductsDialogProps) {
  const { t } = useLanguage()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)

  // isLoading (first-ever fetch only), not isFetching (any fetch): the import mutation
  // invalidates this query after every chunk, so isFetching flips true repeatedly during
  // an import — gating the whole dialog body on it would blank out the list and search
  // box back to a spinner after every chunk instead of just letting it quietly shrink.
  // Server-paginated + server-searched: a couple hundred to a few thousand importable
  // products across an org's branches is common, and shipping every field of every one
  // of them on every dialog open (then filtering/scrolling client-side) doesn't scale —
  // see masterProduct.service.js#getImportableMasterProducts.
  const { data, isLoading: isLoadingImportable } = useGetImportableMasterProductsQuery(
    { search: debouncedSearch, page, limit: PAGE_SIZE },
    { skip: !open },
  )
  const rows = useMemo(() => data?.results ?? [], [data])
  const totalResults = data?.totalResults ?? 0
  const totalPages = data?.totalPages ?? 0
  const [importMasterProducts] = useImportMasterProductsMutation()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Record<string, RowState>>({})
  const [serialDialogRowId, setSerialDialogRowId] = useState<string | null>(null)
  // null when not importing; otherwise how many of the total selected items have gone
  // through so far, updated after each chunk completes.
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)
  const isImporting = importProgress !== null

  // A page only ever holds the rows currently on screen, but a selection can span pages
  // (pick some on page 1, page over, pick more) — so every row ever seen gets kept here
  // by id, and that's what handleImport and the field/detail rows below read from
  // regardless of which page put it there.
  const [rowCache, setRowCache] = useState<Record<string, ImportableMasterProduct>>({})
  useEffect(() => {
    if (!rows.length) return
    setRowCache((prev) => {
      const next = { ...prev }
      let changed = false
      for (const row of rows) {
        if (next[row.masterProductId] !== row) {
          next[row.masterProductId] = row
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [rows])

  // Reset everything each time the dialog opens fresh, rather than carrying over a
  // previous session's picks or search silently.
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set())
      setOverrides({})
      setSerialDialogRowId(null)
      setSearchInput('')
      setPage(1)
      setRowCache({})
    }
  }, [open])

  // A new search term invalidates the current page number — without this, searching
  // while sitting on page 5 would ask the server for page 5 of a much shorter result set.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Importing everything on the last page shrinks totalPages out from under the current
  // page number (the list refetches after every chunk) — clamp back rather than being
  // left on a now-nonexistent page showing an empty list above a "3 / 2" pager.
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages)
  }, [totalPages, page])

  // Matching name, Urdu name, barcode, category, and the branches that carry it now
  // happens server-side (see masterProduct.service.js#getImportableMasterProducts) — this
  // page's rows have already been filtered and sorted by the time they get here.
  const filtered = rows

  const valueFor = (row: ImportableMasterProduct): RowState =>
    overrides[row.masterProductId] ?? { price: row.suggestedPrice, cost: row.suggestedCost, stockQuantity: 0, batchNumber: '', imeis: [] }

  const setRow = (id: string, next: RowState) => setOverrides((prev) => ({ ...prev, [id]: next }))

  // Opening-batch identity only matters once there's actually opening stock to seed —
  // same "auto-suggest the moment it becomes relevant" UX as the batch number field in
  // users-action-dialog.tsx, just triggered by qty going from 0 to non-zero instead of a
  // checkbox toggle.
  const setStockQuantity = (row: ImportableMasterProduct, qty: number) => {
    const v = valueFor(row)
    const needsBatch = (row.trackBatch || row.trackExpiry) && qty > 0 && !v.batchNumber
    setRow(row.masterProductId, { ...v, stockQuantity: qty, batchNumber: needsBatch ? generateBatchNumber() : v.batchNumber })
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // "Select all" only ever acts on the current page, so picks made on an earlier page or
  // search survive paging or typing a new term — the same "select all in this view"
  // convention as a mail client's list checkbox.
  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.masterProductId))
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      filtered.forEach((r) => (allSelected ? next.delete(r.masterProductId) : next.add(r.masterProductId)))
      return next
    })
  }

  const selectedCount = selectedIds.size
  const serialDialogRowIndex = filtered.findIndex((r) => r.masterProductId === serialDialogRowId)
  const serialDialogRow = filtered[serialDialogRowIndex]

  // Enter advances field-to-field (qty → batch or serial trigger, if visible → price →
  // cost → next row's qty) instead of submitting the dialog — same parent-owned
  // ref-map pattern as the Invoice/Purchase item rows (see lib/invoice-form-keyboard.ts).
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const importButtonRef = useRef<HTMLButtonElement | null>(null)
  const fieldKey = (masterProductId: string, field: 'qty' | 'batch' | 'price' | 'cost') => `${masterProductId}:${field}`
  const focusRowField = (rowIndex: number, field: 'qty' | 'batch' | 'price' | 'cost') => {
    const row = filtered[rowIndex]
    if (!row) {
      focusField(importButtonRef.current, false)
      return
    }
    focusField(fieldRefs.current[fieldKey(row.masterProductId, field)])
  }

  const handleImport = async () => {
    if (isImporting) return
    // selectedIds can carry ids picked on pages other than the one currently on screen,
    // so this reads from rowCache (every row ever seen this session) rather than `rows`
    // (just the current page).
    const selectedRows = [...selectedIds].map((id) => rowCache[id]).filter((row): row is ImportableMasterProduct => !!row)

    // Fail fast client-side with a specific, per-product message — same requirement the
    // server enforces too (masterProduct.service.js#importMasterProducts), checked here
    // first so a mistake doesn't cost a round trip.
    for (const row of selectedRows) {
      const v = valueFor(row)
      if (v.stockQuantity <= 0) continue
      if ((row.trackImei || row.trackSerial) && v.imeis.length !== v.stockQuantity) {
        toast.error(`Enter ${v.stockQuantity} ${row.trackSerial ? 'serial' : 'IMEI'} number(s) for "${row.name}" — ${v.imeis.length} entered`)
        return
      }
      if ((row.trackBatch || row.trackExpiry) && !v.batchNumber.trim()) {
        toast.error(`Enter a batch number for the opening stock of "${row.name}"`)
        return
      }
    }

    const items = selectedRows.map((row) => {
      const v = valueFor(row)
      return {
        masterProductId: row.masterProductId,
        price: Number(v.price) || 0,
        cost: Number(v.cost) || 0,
        stockQuantity: Number(v.stockQuantity) || 0,
        batchNumber: v.batchNumber.trim() || undefined,
        imeis: v.imeis.length ? v.imeis : undefined,
      }
    })
    if (items.length === 0) return

    // Sent as sequential chunks (see IMPORT_CHUNK_SIZE above), not one request for
    // everything — each chunk is awaited and counted before the next one starts, so if
    // chunk 6 of 10 is the one that fails/times out/gets interrupted, chunks 1-5 are
    // already safely committed and only the untried remainder needs a retry. Retrying is
    // always safe regardless: masterProduct.service.js#importMasterProducts matches
    // already-imported items by masterProductId and returns them as-is instead of
    // duplicating.
    let done = 0
    setImportProgress({ done, total: items.length })
    try {
      for (let i = 0; i < items.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = items.slice(i, i + IMPORT_CHUNK_SIZE)
        await importMasterProducts(chunk).unwrap()
        done += chunk.length
        setImportProgress({ done, total: items.length })
        // Drop exactly the ids that just landed — precise, since we know exactly which
        // ones we sent, unlike diffing against a re-fetched page which may not even
        // include these ids' page. Keeps "N selected of M" from overcounting once these
        // products are gone from the importable list for good (see
        // masterProduct.service.js#importMasterProducts — already-imported ids are
        // excluded from later /importable responses).
        const justImported = new Set(chunk.map((item) => item.masterProductId))
        setSelectedIds((prev) => new Set([...prev].filter((id) => !justImported.has(id))))
      }
      toast.success(t('products_imported_success', { count: String(items.length) }))
      onImported?.()
      onOpenChange(false)
    } catch (err) {
      // Refresh the underlying product list/stats regardless of how far it got — whatever
      // chunks did complete are real, committed products the rest of the app should see
      // immediately, not just after the next unrelated refresh.
      onImported?.()
      if (done > 0) {
        toast.error(t('products_import_partial', { done: String(done), total: String(items.length) }))
      } else if (isRequestTimeoutError(err)) {
        // A timeout only means the client gave up waiting on this one chunk — the request
        // keeps running server-side, so this chunk may still land a moment later.
        toast.error(getTimeoutErrorMessage('import these products'))
      } else {
        toast.error(t('products_import_failed'))
      }
    } finally {
      setImportProgress(null)
    }
  }

  // A zero-result page reads as "nothing at all" when there's no active search, or "no
  // matches for this search" when there is — the server doesn't need to tell the two
  // apart separately since debouncedSearch already distinguishes them here.
  const noProductsAtAll = !isLoadingImportable && totalResults === 0 && !debouncedSearch.trim()
  const noSearchMatches = !isLoadingImportable && totalResults === 0 && !!debouncedSearch.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Ignore close attempts (X button, Escape, overlay click) while a chunk is
        // in flight — closing mid-import doesn't stop the server from finishing that
        // chunk, it just makes the client lose track of how far it got.
        if (!next && isImporting) return
        onOpenChange(next)
      }}
    >
      {/* flex column + max-h + overflow-hidden here, with only the middle section
          scrolling, is the same "fixed header/footer, scrollable body" shape used by
          every other tall dialog in this codebase (e.g. categories-action-dialog.tsx).
          The plain DialogContent this used before has no height cap of its own, so on a
          short viewport (a laptop with devtools open, a small window) the list could push
          the Cancel/Import footer below the visible area with no way to scroll to it —
          not just a cosmetic overflow, the import button was genuinely unreachable. */}
      <DialogContent className='flex max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-[min(96vw,1024px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl'>
        <DialogHeader className='shrink-0 gap-1 border-b px-6 py-4'>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <Building2 className='h-4 w-4 text-blue-600' />
            {t('import_from_other_branches')}
          </DialogTitle>
          <DialogDescription>{t('import_from_other_branches_desc')}</DialogDescription>
        </DialogHeader>

        {isLoadingImportable ? (
          <div className='flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' /> {t('loading')}
          </div>
        ) : noProductsAtAll ? (
          <div className='flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground'>
            <Building2 className='h-8 w-8 text-muted-foreground/50' />
            {t('no_importable_products')}
          </div>
        ) : (
          <div className='flex min-h-0 flex-1 flex-col'>
            <div className='flex shrink-0 items-center justify-between gap-3 border-b px-6 py-3'>
              <div className='relative w-full max-w-xs'>
                <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  autoFocus
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t('search_products')}
                  aria-label={t('search_products')}
                  className='pl-9'
                />
              </div>
              <div className='shrink-0 text-xs text-muted-foreground'>
                {t('n_selected_of_total', { selected: String(selectedCount), total: String(totalResults) })}
              </div>
            </div>

            {noSearchMatches ? (
              <div className='flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground'>
                <Search className='h-8 w-8 text-muted-foreground/50' />
                {t('no_products_match_search')}
                <Button type='button' variant='ghost' size='sm' onClick={() => setSearchInput('')}>
                  {t('clear')}
                </Button>
              </div>
            ) : (
              <div className='min-h-0 flex-1 overflow-y-auto'>
                <div className='sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-6 py-2'>
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label={t('select_all')} />
                  <span className='text-xs font-medium text-muted-foreground'>{t('select_all')}</span>
                </div>
                <div className='divide-y px-6 pb-3'>
                  {filtered.map((row, index) => {
                    const checked = selectedIds.has(row.masterProductId)
                    const v = valueFor(row)
                    const needsBatch = (row.trackBatch || row.trackExpiry) && v.stockQuantity > 0
                    const needsSerial = (row.trackImei || row.trackSerial) && v.stockQuantity > 0
                    return (
                      <div key={row.masterProductId} className={`flex flex-wrap items-center gap-3 py-3 ${checked ? 'bg-muted/40' : ''}`}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleOne(row.masterProductId)}
                          className='shrink-0'
                        />
                        {row.image?.url ? (
                          <img src={row.image.url} alt={row.name} className='h-8 w-8 shrink-0 rounded object-cover' />
                        ) : (
                          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted'>
                            <Package className='h-4 w-4 text-muted-foreground' />
                          </div>
                        )}
                        <div className='min-w-0 flex-1 basis-40'>
                          <div className='truncate text-sm font-medium'>{row.name}</div>
                          <div className='mt-0.5 flex flex-wrap items-center gap-1'>
                            {row.category ? (
                              <Badge variant='secondary' className='px-1.5 py-0 text-[10px]'>
                                {row.category}
                              </Badge>
                            ) : null}
                            <span
                              className='inline-flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground'
                              title={row.carriedAtBranches.join(', ')}
                            >
                              <Building2 className='h-3 w-3 shrink-0' />
                              <span className='truncate'>{row.carriedAtBranches.join(', ')}</span>
                            </span>
                          </div>
                        </div>

                        {/* Detail fields sit inline with the name (same row) rather than on
                            a line below it, and only appear once a product is actually
                            picked for import — keeps an at-a-glance list scannable across
                            200+ rows. flex-wrap on the row (not a fixed table column) lets
                            this group fall onto its own line only if the window is too
                            narrow to fit it, instead of silently overflowing the dialog. */}
                        {checked && (
                          <div className='flex shrink-0 flex-wrap items-end gap-2'>
                            <FieldGroup label={t('opening_qty')}>
                              <Input
                                ref={(el) => { fieldRefs.current[fieldKey(row.masterProductId, 'qty')] = el }}
                                type='number'
                                min={0}
                                value={v.stockQuantity}
                                onChange={(e) => setStockQuantity(row, Number(e.target.value))}
                                onKeyDown={(e) =>
                                  onEnterAdvance(e, () => {
                                    if (needsBatch) focusRowField(index, 'batch')
                                    else if (needsSerial) setSerialDialogRowId(row.masterProductId)
                                    else focusRowField(index, 'price')
                                  })
                                }
                                className='h-8 w-24 text-sm'
                              />
                            </FieldGroup>

                            {needsBatch ? (
                              <FieldGroup label={t('batch_serial_label')}>
                                <Input
                                  ref={(el) => { fieldRefs.current[fieldKey(row.masterProductId, 'batch')] = el }}
                                  placeholder='Batch number'
                                  showVoiceInput={false}
                                  value={v.batchNumber}
                                  onChange={(e) => setRow(row.masterProductId, { ...v, batchNumber: e.target.value })}
                                  onKeyDown={(e) => onEnterAdvance(e, () => focusRowField(index, 'price'))}
                                  className='h-8 w-36 text-sm'
                                />
                              </FieldGroup>
                            ) : needsSerial ? (
                              <FieldGroup label={t('batch_serial_label')}>
                                <button
                                  type='button'
                                  onClick={() => setSerialDialogRowId(row.masterProductId)}
                                  className={`inline-flex h-8 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors ${
                                    v.imeis.length >= v.stockQuantity
                                      ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
                                      : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400'
                                  }`}
                                >
                                  <ScanLine className='h-3 w-3' />
                                  {v.imeis.length}/{v.stockQuantity}
                                </button>
                              </FieldGroup>
                            ) : null}

                            <FieldGroup label={t('price')}>
                              <Input
                                ref={(el) => { fieldRefs.current[fieldKey(row.masterProductId, 'price')] = el }}
                                type='number'
                                min={0}
                                value={v.price}
                                onChange={(e) => setRow(row.masterProductId, { ...v, price: Number(e.target.value) })}
                                onKeyDown={(e) => onEnterAdvance(e, () => focusRowField(index, 'cost'))}
                                className='h-8 w-28 text-sm'
                              />
                            </FieldGroup>

                            <FieldGroup label={t('cost')}>
                              <Input
                                ref={(el) => { fieldRefs.current[fieldKey(row.masterProductId, 'cost')] = el }}
                                type='number'
                                min={0}
                                value={v.cost}
                                onChange={(e) => setRow(row.masterProductId, { ...v, cost: Number(e.target.value) })}
                                onKeyDown={(e) => onEnterAdvance(e, () => focusRowField(index + 1, 'qty'))}
                                className='h-8 w-28 text-sm'
                              />
                            </FieldGroup>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!noSearchMatches && totalPages > 1 && (
              <div className='shrink-0 border-t px-6 py-2'>
                <SimplePagination currentPage={page} totalPages={totalPages} totalResults={totalResults} limit={PAGE_SIZE} onPageChange={setPage} className='border-t-0 pt-0' />
              </div>
            )}
          </div>
        )}

        <DialogFooter className='shrink-0 border-t px-6 py-4'>
          {isImporting && importProgress ? (
            <div className='flex w-full items-center gap-3'>
              <Loader2 className='h-4 w-4 shrink-0 animate-spin text-muted-foreground' />
              <div className='min-w-0 flex-1'>
                <div className='text-sm text-muted-foreground'>
                  {t('importing_n_of_total', { done: String(importProgress.done), total: String(importProgress.total) })}
                </div>
                <div className='mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                  <div
                    className='h-full rounded-full bg-primary transition-all'
                    style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button ref={importButtonRef} type='button' onClick={handleImport} disabled={selectedCount === 0}>
                {t('import_n_products', { count: String(selectedCount) })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      {serialDialogRow && (
        <ImportSerialEntryDialog
          open={!!serialDialogRowId}
          onOpenChange={(next) => {
            setSerialDialogRowId(next ? serialDialogRowId : null)
            // Continue the same field-to-field Enter chain into Price once serial entry
            // is done (Done button, or auto-close on hitting the target count).
            if (!next) focusRowField(serialDialogRowIndex, 'price')
          }}
          productName={serialDialogRow.name}
          isSerial={!!serialDialogRow.trackSerial}
          targetCount={valueFor(serialDialogRow).stockQuantity}
          value={valueFor(serialDialogRow).imeis}
          onChange={(next) => setRow(serialDialogRow.masterProductId, { ...valueFor(serialDialogRow), imeis: next })}
        />
      )}
    </Dialog>
  )
}
