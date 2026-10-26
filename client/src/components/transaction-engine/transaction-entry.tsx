import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Barcode,
  ClipboardPaste,
  Hash,
  Keyboard,
  Loader2,
  Plus,
  Rows3,
  ScanLine,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useIsPhone } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { FormDraftNotice } from '@/components/form-draft-notice'
import { BulkPasteDialog } from './bulk-paste'
import {
  EngineContext,
  createNavigation,
  useEngine,
  useEntrySelector,
  type AnyColumn,
  type AnyStore,
  type EngineContextValue,
} from './engine-context'
import { EntryRow } from './entry-row'
import { resolvePasted } from './paste'
import { parsePasted } from './search'
import { createEntryStore, type EntryStore } from './store'
import { TransactionHeader } from './transaction-header'
import type {
  EntryRowBase,
  ProductSource,
  RowErrors,
  SaveAction,
  SaveMode,
  SavePayload,
  StockSource,
  TransactionConfig,
} from './types'
import { useEntryDraft } from './use-entry-draft'

/** Default grid track per column kind. */
const DEFAULT_WIDTH: Record<string, string> = {
  date: '8.5rem',
  product: 'minmax(15rem, 3fr)',
  quantity: '6.5rem',
  unit: '5.5rem',
  rate: '7.5rem',
  batch: 'minmax(9rem, 1.3fr)',
  serial: 'minmax(8rem, 1fr)',
  warehouse: 'minmax(8rem, 1fr)',
  text: 'minmax(8rem, 1.5fr)',
  number: '6.5rem',
  select: 'minmax(7rem, 1fr)',
  computed: '7.5rem',
}
const HANDLE = '2.25rem'
const ACTIONS = '2rem'

/** Smallest sensible width of a row (rem) — the table scrolls sideways below it. */
const minWidthRem = (tracks: string[]) =>
  tracks.reduce((sum, track) => {
    const m = track.match(/(\d+(?:\.\d+)?)rem/)
    return sum + (m ? Number(m[1]) : 6) + 0.375
  }, 1)

export type SaveResult = void | { rowErrors?: Record<string, RowErrors> }

export interface TransactionEntryProps<
  R extends EntryRowBase,
  H extends object,
> {
  config: TransactionConfig<R, H>
  products: ProductSource
  stock?: StockSource
  /** Throw (or return row errors) to keep the entry on screen as it is. */
  onSave: (payload: SavePayload<R, H>, mode: SaveMode) => Promise<SaveResult>
  /** Draft autosave; pass false for edit screens (they must show the stored record). */
  draft?: { key?: string } | false
  /** Pre-filled header/rows (edit mode, or "create from…"). */
  initial?: { header?: Partial<H>; rows?: Omit<R, 'id'>[] }
  readOnly?: boolean
  /** Hide the Save & New button (e.g. a dialog that closes on save). */
  saveNew?: boolean
  /** Extra save buttons (Save draft, Save & print…), shown before Save & New. */
  saveActions?: SaveAction[]
  saveLabel?: string
  /** Extra buttons in the footer, left of Save. */
  footerExtra?: React.ReactNode
  /** Access to the store (row data, reset…) for the screen around the engine. */
  storeRef?: React.MutableRefObject<EntryStore<R, H> | null>
  className?: string
  /**
   * 'card' — the roomier look for a screen that frames the entry in a card padded p-4 /
   * sm:p-6 with no bottom padding (the footer bar spans the card's width and closes it): a
   * marked scan box, the grid's title row, totals with icons, tinted secondary buttons.
   */
  appearance?: 'default' | 'card'
  /** Title of the rows section, shown left of Paste rows / Add row. */
  gridTitle?: React.ReactNode
  /** While set, the grid is covered by a loading state with this label (rows being fetched). */
  gridLoading?: string | false
}

/**
 * A complete multi-row transaction entry: header, the entry grid, totals and save — with
 * the same keyboard model on every screen that uses it. See ./README.md.
 */
export function TransactionEntry<R extends EntryRowBase, H extends object>(
  props: TransactionEntryProps<R, H>
) {
  const {
    config,
    products,
    stock,
    onSave,
    draft = {},
    initial,
    readOnly = false,
    appearance = 'default',
  } = props
  const card = appearance === 'card'
  // Secondary save buttons in the card look: tinted with the accent colour.
  const softButton = card
    ? 'bg-primary/10 text-primary shadow-none hover:bg-primary/15'
    : undefined
  const { t } = useLanguage()
  const tRef = useRef(t)
  tRef.current = t
  const isPhone = useIsPhone()

  const [store] = useState(() => {
    const s = createEntryStore(config, () => tRef.current)
    if (initial) {
      s.reset(
        { ...config.initialHeader(), ...(initial.header || {}) } as H,
        initial.rows?.length ? [...initial.rows, config.createRow()] : undefined
      )
    }
    return s
  })
  if (props.storeRef) props.storeRef.current = store
  const anyStore = store as unknown as AnyStore

  // Visible columns depend on the header only through `visible` — recompute cheaply and
  // keep the same array (and context) unless the visible set actually changes.
  const header = useStoreHeader(anyStore)
  const visibleKeys = config.columns
    .filter((c) => !c.visible || c.visible({ header: header as H, t }))
    .map((c) => c.key)
    .join('|')
  const columns = useMemo(
    () =>
      config.columns.filter((c) =>
        visibleKeys.split('|').includes(c.key)
      ) as unknown as AnyColumn[],
    [config.columns, visibleKeys]
  )
  const columnsRef = useRef(columns)
  columnsRef.current = columns
  const [nav] = useState(() => createNavigation(anyStore, columnsRef))

  const reportPasted = useCallback(
    (added: number, wanted: number) => {
      const tt = tRef.current
      if (added < wanted)
        toast.warning(
          `${added} ${tt('row(s) pasted')} — ${tt('a document holds up to')} ${config.maxRows ?? 1000} ${tt('rows')}`
        )
      else toast.success(`${added} ${tt('row(s) pasted')}`)
    },
    [config.maxRows]
  )
  const [paste, setPaste] = useState<{ open: boolean; text?: string }>({
    open: false,
  })
  const onPasteTable = useCallback(
    async (text: string) => {
      const { resolved, unresolved } = await resolvePasted(
        parsePasted(text),
        products
      )
      if (resolved.length) {
        reportPasted(
          store.appendPasted(resolved as never).length,
          resolved.length
        )
      }
      if (unresolved.length) {
        setPaste({
          open: true,
          text: unresolved
            .map((l) =>
              [l.productText, l.quantity ?? '', l.rate ?? '', ...l.extra].join(
                '\t'
              )
            )
            .join('\n'),
        })
      } else {
        nav.focusRowStart(
          store.getState().order[store.getState().order.length - 1]
        )
      }
    },
    [products, store, nav, reportPasted]
  )

  const draftControls = useEntryDraft(anyStore, {
    key: `entry:${(draft && draft.key) || config.id}`,
    enabled: draft !== false && !readOnly && !initial,
    relink: products.getByKey ? (p) => products.getByKey!(p.key) : undefined,
  })

  // Rows keep pointing at the live catalog record — after a catalog refresh, and for a
  // draft restored before the catalog finished loading.
  useEffect(() => {
    if (!products.getByKey) return
    store.relinkProducts((p) => products.getByKey!(p.key))
  }, [products, store])

  const value = useMemo<EngineContextValue>(
    () => ({
      store: anyStore,
      columns,
      products,
      stock: stock || {},
      nav,
      layout: isPhone ? 'cards' : 'table',
      readOnly,
      t,
      onPasteTable: (text) => void onPasteTable(text),
    }),
    [
      anyStore,
      columns,
      products,
      stock,
      nav,
      isPhone,
      readOnly,
      t,
      onPasteTable,
    ]
  )

  // ── Save ──────────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const save = useCallback(
    async (mode: SaveMode) => {
      if (savingRef.current || readOnly) return
      const action = props.saveActions?.find((a) => a.mode === mode)
      if (action && action.validate === false) {
        if (
          !store.filledRows().length &&
          !Object.values(store.getState().header).some(Boolean)
        ) {
          toast.error(tRef.current('Nothing to save yet'))
          return
        }
        savingRef.current = true
        setSaving(true)
        try {
          const result = await onSave(
            { header: store.getState().header, rows: store.filledRows() },
            mode
          )
          if (
            result &&
            result.rowErrors &&
            Object.keys(result.rowErrors).length
          ) {
            store.setRowErrors(result.rowErrors)
            return
          }
          draftControls.clear()
          if (action.resetAfter) {
            store.reset()
            nav.focusRowStart(store.getState().order[0])
          }
        } catch (err) {
          toast.error(
            getErrorMessage(
              err,
              tRef.current('Could not save — your entries are still here')
            )
          )
        } finally {
          savingRef.current = false
          setSaving(false)
        }
        return
      }
      const check = store.validateAll()
      if (!check.ok) {
        const bad = Object.keys(store.getState().errors).length
        toast.error(
          check.headerKey && !bad
            ? tRef.current('Check the highlighted header fields')
            : `${bad} ${tRef.current('row(s) need attention — nothing was lost')}`
        )
        if (check.firstInvalid)
          nav.focusCell(check.firstInvalid.rowId, check.firstInvalid.key)
        else if (check.headerKey)
          document.getElementById(`${config.id}-h-${check.headerKey}`)?.focus()
        return
      }
      const rows = store.filledRows()
      if (!rows.length) {
        toast.error(tRef.current('Add at least one row'))
        nav.focusRowStart(store.getState().order[0])
        return
      }
      savingRef.current = true
      setSaving(true)
      try {
        const result = await onSave(
          { header: store.getState().header, rows },
          mode
        )
        if (
          result &&
          result.rowErrors &&
          Object.keys(result.rowErrors).length
        ) {
          store.setRowErrors(result.rowErrors)
          const [rowId, errs] = Object.entries(result.rowErrors)[0]
          nav.focusCell(rowId, Object.keys(errs)[0] || config.columns[0].key)
          return
        }
        draftControls.clear()
        if (mode === 'save-new' || action?.resetAfter) {
          store.reset()
          nav.focusRowStart(store.getState().order[0])
        }
      } catch (err) {
        toast.error(
          getErrorMessage(
            err,
            tRef.current('Could not save — your entries are still here')
          )
        )
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },

    [store, nav, onSave, readOnly, config, draftControls, props.saveActions]
  )

  // ── Shortcuts (capture phase, so a cell never swallows them) ───────────────────
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'Enter' && mod && !e.altKey) {
      e.preventDefault()
      e.stopPropagation()
      void save('save')
      return
    }
    if (e.key === 'Enter' && e.altKey && props.saveNew !== false) {
      e.preventDefault()
      e.stopPropagation()
      void save('save-new')
      return
    }
    if (readOnly) return
    const active = store.getState().activeRowId
    if (!active) return
    const inGrid = (e.target as HTMLElement).closest?.('[data-entry-grid]')
    if (!inGrid) return
    if (e.key === 'Insert' && !mod) {
      e.preventDefault()
      nav.focusRowStart(store.insertRow(active))
    } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      nav.focusRowStart(store.duplicateRow(active))
    } else if (mod && e.key === 'Delete') {
      e.preventDefault()
      const focus = store.deleteRows([active])
      if (focus) nav.focusRowStart(focus)
    } else if (
      mod &&
      e.shiftKey &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown')
    ) {
      e.preventDefault()
      e.stopPropagation()
      store.moveRow(active, e.key === 'ArrowUp' ? -1 : 1)
    }
  }

  // Ctrl+Enter / Alt+Enter also work from anywhere else on the page — the body, or a
  // button around the entry (e.g. a screen's "Issue all") — but not from a dialog or
  // another entry, which have their own Enter.
  useEffect(() => {
    const onDoc = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented) return
      const root = rootRef.current
      if (!root?.isConnected) return
      const target = e.target as HTMLElement | null
      if (target && target !== document.body) {
        if (root.contains(target)) return // the capture handler has it
        if (
          target.closest?.(
            '[role="dialog"], [role="alertdialog"], [data-entry-root]'
          )
        )
          return
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        void save('save')
      } else if (e.altKey && props.saveNew !== false) {
        e.preventDefault()
        void save('save-new')
      }
    }
    document.addEventListener('keydown', onDoc)
    return () => document.removeEventListener('keydown', onDoc)
  }, [save, props.saveNew])

  return (
    <EngineContext.Provider value={value}>
      <div
        ref={rootRef}
        data-entry-root
        className={cn('space-y-3', props.className)}
        onKeyDownCapture={onKeyDownCapture}
      >
        <FormDraftNotice draft={draftControls} />
        {config.headerFields?.length ? (
          <TransactionHeader fields={config.headerFields as never} />
        ) : null}
        <EntryToolbar
          onPaste={() => setPaste({ open: true })}
          card={card}
          title={props.gridTitle}
        />
        <div
          className={cn('relative', props.gridLoading && 'min-h-[11rem]')}
          aria-busy={props.gridLoading ? true : undefined}
        >
          <EntryGrid />
          {props.gridLoading && <GridLoading label={props.gridLoading} />}
        </div>
        <div
          className={cn(
            'bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t backdrop-blur',
            card
              ? 'bg-card/95 supports-[backdrop-filter]:bg-card/85 -mx-4 rounded-b-xl px-4 py-3 sm:-mx-6 sm:px-6'
              : '-mx-1 px-1 pt-3 pb-2'
          )}
        >
          <EntryTotals card={card} />
          <div className='ml-auto flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>button]:flex-1'>
            {props.footerExtra}
            {/* A read-only (posted) document has nothing to save. */}
            {!readOnly &&
              props.saveActions?.map((a) => (
                <Button
                  key={a.mode}
                  type='button'
                  variant={card ? 'secondary' : a.variant || 'outline'}
                  className={softButton}
                  disabled={saving || readOnly}
                  onClick={() => void save(a.mode)}
                >
                  {t(a.label)}
                </Button>
              ))}
            {!readOnly && props.saveNew !== false && (
              <Button
                type='button'
                variant={card ? 'secondary' : 'outline'}
                className={softButton}
                disabled={saving || readOnly}
                onClick={() => void save('save-new')}
              >
                {t('Save & New')}
                <kbd
                  className={cn(
                    'ml-2 hidden text-[10px] lg:inline',
                    card ? 'opacity-70' : 'text-muted-foreground'
                  )}
                >
                  Alt+Enter
                </kbd>
              </Button>
            )}
            {!readOnly && (
              <Button
                type='button'
                disabled={saving}
                onClick={() => void save('save')}
              >
                {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {props.saveLabel || t('Save')}
                <kbd
                  className={cn(
                    'ml-2 hidden text-[10px] lg:inline',
                    card
                      ? 'bg-primary-foreground/15 rounded px-1.5 py-0.5 font-mono'
                      : 'opacity-70'
                  )}
                >
                  Ctrl+Enter
                </kbd>
              </Button>
            )}
          </div>
        </div>
      </div>
      <BulkPasteDialog
        open={paste.open}
        initialText={paste.text}
        products={products}
        t={t}
        onClose={() => setPaste({ open: false })}
        onAdd={(resolved) => {
          reportPasted(
            store.appendPasted(resolved as never).length,
            resolved.length
          )
        }}
      />
    </EngineContext.Provider>
  )
}

function useStoreHeader(store: AnyStore) {
  const [, force] = useState(0)
  const ref = useRef(store.getState().header)
  useEffect(
    () =>
      store.subscribe(() => {
        const h = store.getState().header
        if (h !== ref.current) {
          ref.current = h
          force((n) => n + 1)
        }
      }),
    [store]
  )
  return ref.current
}

const EntryGrid = memo(function EntryGrid() {
  const { columns, layout, t, store } = useEngine()
  const order = useEntrySelector((s) => s.order)
  const tracks = useMemo(
    () => columns.map((c) => c.width || DEFAULT_WIDTH[c.kind] || '8rem'),
    [columns]
  )
  const gridTemplate = useMemo(
    () => [HANDLE, ...tracks, ACTIONS].join(' '),
    [tracks]
  )
  const minWidth = useMemo(() => `${minWidthRem(tracks) + 5}rem`, [tracks])

  if (layout === 'cards') {
    return (
      <div data-entry-grid className='overflow-hidden rounded-xl border'>
        {order.map((id, i) => (
          <EntryRow key={id} rowId={id} index={i} gridTemplate={gridTemplate} />
        ))}
        <AddRowButton />
      </div>
    )
  }
  return (
    <div data-entry-grid className='overflow-x-auto rounded-xl border'>
      <div
        role='table'
        aria-label={t(store.config.noun)}
        aria-rowcount={order.length + 1}
        style={{ minWidth }}
      >
        <div role='row' className='bg-muted/40 border-b'>
          <div
            className='text-muted-foreground grid items-center gap-1.5 px-2 py-2 text-xs font-medium'
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div role='columnheader' className='text-center'>
              #
            </div>
            {columns.map((c) => (
              <div
                key={c.key}
                role='columnheader'
                className={cn(
                  'truncate px-1',
                  (c.align === 'right' ||
                    (c.align !== 'left' &&
                      ['quantity', 'rate', 'number', 'computed'].includes(
                        c.kind
                      ))) &&
                    'text-right'
                )}
              >
                {t(c.label)}
              </div>
            ))}
            <div role='columnheader'>
              <span className='sr-only'>{t('Actions')}</span>
            </div>
          </div>
        </div>
        {order.map((id, i) => (
          <EntryRow key={id} rowId={id} index={i} gridTemplate={gridTemplate} />
        ))}
      </div>
      <AddRowButton />
    </div>
  )
})

function AddRowButton() {
  const { store, nav, t, readOnly } = useEngine()
  if (readOnly) return null
  return (
    <button
      type='button'
      tabIndex={-1}
      onClick={() => nav.focusRowStart(store.ensureTrailingBlank())}
      className='text-muted-foreground hover:bg-muted/40 hover:text-foreground flex w-full items-center gap-2 px-4 py-2 text-left text-sm'
    >
      <Plus className='h-4 w-4' />
      {t('Add row')}
    </button>
  )
}

const EntryToolbar = memo(function EntryToolbar({
  onPaste,
  card = false,
  title,
}: {
  onPaste: () => void
  card?: boolean
  title?: React.ReactNode
}) {
  const { store, nav, products, columns, t, readOnly } = useEngine()
  const selectedCount = useEntrySelector((s) => Object.keys(s.selected).length)
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null
  )

  const scan = async () => {
    const value = code.trim()
    if (!value) return
    const product = await products.lookupCode(value)
    if (!product) {
      setStatus({ ok: false, text: `${t('No product with code')} “${value}”` })
      return
    }
    const rowId = store.scanProduct(product)
    store.ensureTrailingBlank()
    const row = store.getState().rows[rowId]
    setStatus({
      ok: true,
      text: `${product.name} · ${t('qty')} ${row?.quantity ?? 1}`,
    })
    setCode('')
    document
      .getElementById(`${store.config.id}-row-${rowId}`)
      ?.scrollIntoView({ block: 'nearest' })
    // Serial-tracked items need their serial picked next.
    const serialColumn = columns.find((c) => c.kind === 'serial')
    if (product.trackSerial && serialColumn)
      nav.focusCell(rowId, serialColumn.key)
  }

  if (readOnly) return title ? <div>{title}</div> : null
  const scanBox = (
    <>
      <div className={cn('relative w-full', card ? 'sm:w-80' : 'sm:w-72')}>
        {card ? (
          <>
            <Barcode className='text-primary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
            <ScanLine className='text-primary/70 pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2' />
          </>
        ) : (
          <ScanLine className='text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4' />
        )}
        <Input
          value={code}
          showVoiceInput={false}
          autoComplete='off'
          spellCheck={false}
          aria-label={t('Scan barcode')}
          placeholder={t('Scan or type barcode, Enter')}
          className={
            card
              ? 'border-primary/40 bg-primary/5 placeholder:text-primary/70 focus-visible:border-primary h-10 border-dashed pr-9 pl-9'
              : 'h-9 pl-8'
          }
          onChange={(e) => {
            setCode(e.target.value)
            setStatus(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault()
              void scan()
            }
          }}
        />
      </div>
      {status && (
        <span
          role='status'
          className={cn(
            'text-xs',
            status.ok
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-rose-700 dark:text-rose-400'
          )}
        >
          {status.text}
        </span>
      )}
    </>
  )
  const actions = (
    <div className='ml-auto flex items-center gap-1.5'>
      {selectedCount > 0 && (
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='text-destructive'
          onClick={() => {
            const focus = store.deleteRows(
              Object.keys(store.getState().selected)
            )
            if (focus) nav.focusRowStart(focus)
          }}
        >
          <Trash2 className='mr-1.5 h-3.5 w-3.5' />
          {t('Delete')} {selectedCount}
        </Button>
      )}
      <Button type='button' size='sm' variant='outline' onClick={onPaste}>
        <ClipboardPaste className='mr-1.5 h-3.5 w-3.5' />
        {t('Paste rows')}
      </Button>
      <Button
        type='button'
        size='sm'
        variant={card ? 'default' : 'outline'}
        onClick={() => nav.focusRowStart(store.ensureTrailingBlank())}
      >
        <Plus className='mr-1.5 h-3.5 w-3.5' />
        {t('Add row')}
      </Button>
      <ShortcutHelp />
    </div>
  )
  if (!title)
    return (
      <div className='flex flex-wrap items-center gap-2'>
        {scanBox}
        {actions}
      </div>
    )
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>{scanBox}</div>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='min-w-0 flex-1 max-sm:basis-full'>{title}</div>
        {actions}
      </div>
    </div>
  )
})

const SHORTCUTS: [string, string][] = [
  ['Enter', 'Pick / next field — new row after the last field'],
  ['Tab · Shift+Tab', 'Next / previous field'],
  ['↑ ↓', 'Results in a list · same column in another row'],
  ['Esc', 'Close the list or picker'],
  ['Ctrl+Enter', 'Save'],
  ['Alt+Enter', 'Save & New'],
  ['Insert', 'Insert a row above'],
  ['Ctrl+D', 'Duplicate row'],
  ['Ctrl+Delete', 'Delete row'],
  ['Ctrl+Shift+↑ ↓', 'Move row'],
  ['Delete on #', 'Delete the selected rows'],
  ['Ctrl+V in Product', 'Paste rows from a spreadsheet'],
]

function ShortcutHelp() {
  const { t } = useEngine()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='h-8 w-8'
          aria-label={t('Keyboard shortcuts')}
        >
          <Keyboard className='h-4 w-4' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 p-3'>
        <div className='mb-2 text-sm font-semibold'>
          {t('Keyboard shortcuts')}
        </div>
        <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs'>
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className='contents'>
              <dt>
                <kbd className='bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]'>
                  {keys}
                </kbd>
              </dt>
              <dd className='text-muted-foreground'>{t(what)}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}

/** Row count, total quantity and the config's own totals — recalculated as rows change. */
const EntryTotals = memo(function EntryTotals({
  card = false,
}: {
  card?: boolean
}) {
  const { store, t } = useEngine()
  const rows = useEntrySelector((s) => s.rows)
  const order = useEntrySelector((s) => s.order)
  const header = useEntrySelector((s) => s.header)
  const lines = useMemo(() => {
    const filled = order
      .map((id) => rows[id])
      .filter((r) => r && !store.isEmpty(r))
    const qty = filled.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
    return [
      {
        key: '__rows',
        label: t('Rows'),
        value: filled.length,
        emphasis: false,
        icon: <Rows3 />,
      },
      {
        key: '__qty',
        label: t('Quantity'),
        value: Math.round(qty * 1000) / 1000,
        emphasis: false,
        icon: <Hash />,
      },
      ...(store.config.totals
        ? store.config.totals(filled, { header, t })
        : []),
    ]
  }, [rows, order, header, store, t])
  return (
    <dl
      className='flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm'
      aria-live='polite'
    >
      {lines.map((l) => (
        <div
          key={l.key}
          className={cn(
            'flex gap-1.5',
            card ? 'items-center' : 'items-baseline'
          )}
        >
          {card && l.icon && (
            <span
              aria-hidden
              className='bg-muted text-muted-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full [&_svg]:h-3.5 [&_svg]:w-3.5'
            >
              {l.icon}
            </span>
          )}
          <dt className='text-muted-foreground text-xs'>
            {t(String(l.label))}
          </dt>
          <dd
            className={cn(
              'tabular-nums',
              l.emphasis ? 'text-base font-semibold' : 'font-medium'
            )}
          >
            {l.value}
          </dd>
        </div>
      ))}
    </dl>
  )
})

/** Covers the grid while its rows are being fetched: a spinner and placeholder rows. */
function GridLoading({ label }: { label: string }) {
  return (
    <div
      role='status'
      className='bg-background/80 absolute inset-0 z-[5] flex flex-col overflow-hidden rounded-xl border backdrop-blur-[1px]'
    >
      <div className='flex items-center gap-2 border-b px-4 py-3 text-sm font-medium'>
        <Loader2 className='text-primary h-4 w-4 animate-spin' aria-hidden />
        {label}
      </div>
      <div className='flex-1 space-y-3 px-4 py-3' aria-hidden>
        {[72, 58, 66].map((w, i) => (
          <div key={i} className='flex items-center gap-4'>
            <div className='bg-muted h-3 w-5 animate-pulse rounded' />
            <div
              className='bg-muted h-3 animate-pulse rounded'
              style={{ width: `${w}%`, animationDelay: `${i * 150}ms` }}
            />
            <div
              className='bg-muted ml-auto h-3 w-16 animate-pulse rounded'
              style={{ animationDelay: `${i * 150}ms` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
