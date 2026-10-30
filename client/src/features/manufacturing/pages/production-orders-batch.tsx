import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Boxes,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Flag,
  LayoutTemplate,
  List,
  PackageCheck,
  Plus,
  Trash2,
} from 'lucide-react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  useCreateProductionOrderBatchMutation,
  useGetBomsQuery,
  useGetManufacturingSettingsQuery,
  useGetOperatorsQuery,
  type Bom,
  type OrderBatchHeader,
} from '@/stores/manufacturing.api'
import type { RootState } from '@/stores/store'
import { shiftBusinessCalendarDate } from '@/lib/business-timezone'
import { useLanguage } from '@/context/language-context'
import { useBranchName } from '@/hooks/use-branch-name'
import { useIsPhone } from '@/hooks/use-mobile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TransactionEntry,
  rowErrorsFromApi,
  type EntryStore,
  type HeaderField,
  type SaveMode,
} from '@/components/transaction-engine'
import { useConfirm } from '../lib/confirm'
import {
  BUILDABLE_PRODUCT_TYPES,
  PRIORITIES,
  PRIORITY_META,
} from '../lib/constants'
import { useCatalogProducts } from '../lib/product-catalog'
import {
  blankBatchRow,
  buildableSource,
  createBatchConfig,
  rowToBatchLine,
  type BatchHeader,
  type BatchRow,
} from '../lib/production-order-batch'
import {
  BUILT_IN_TEMPLATES,
  DEFAULT_LEAD_DAYS,
  daysBetween,
  isCalendarDate,
  loadLastUsed,
  loadTemplates,
  plannedDates,
  rememberLastUsed,
  saveTemplates,
  templateFromEntry,
  type OrderTemplate,
} from '../lib/production-order-templates'

const LIST = '/manufacturing/production-orders'

const toApiHeader = (
  h: BatchHeader,
  status: OrderBatchHeader['status']
): OrderBatchHeader => ({
  plannedStartDate: h.plannedStartDate || null,
  plannedCompletionDate: h.plannedCompletionDate || null,
  priority: h.priority,
  operatorId: h.operatorId || null,
  teamMemberIds: h.teamMemberIds,
  sourceLocation: h.sourceLocation,
  wipLocation: h.wipLocation,
  finishedGoodsLocation: h.finishedGoodsLocation,
  notes: h.notes,
  status,
})

const plainEnter = (e: React.KeyboardEvent) =>
  e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey

/**
 * Keyboard glue for a closed dropdown in the header: Enter keeps what is picked and moves
 * on (the field is usually pre-filled), ↓ opens it. Space still opens it as a button.
 */
function EnterMovesOn({
  next,
  enabled,
  children,
}: {
  next: () => void
  enabled: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className='min-w-0'
      onKeyDownCapture={(e) => {
        const el = e.target as HTMLElement
        if (
          el.getAttribute('role') !== 'combobox' ||
          el.getAttribute('aria-expanded') === 'true'
        )
          return
        if (plainEnter(e) && enabled) {
          e.preventDefault()
          e.stopPropagation()
          next()
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          el.click()
        }
      }}
    >
      {children}
    </div>
  )
}

/**
 * New production orders, several at once — the invoice-style entry for planners. Every
 * row becomes its own order. Nothing is checked while you type (no material/shortage
 * requests); the server validates every row when the orders are created.
 *
 * Most of the form fills itself: today's dates and the last lead time, the last operator,
 * the default BOM and one batch of it per product. Team, locations (from Settings) and
 * notes are not asked for here. Enter walks the header into the rows; the product list
 * opens by itself and a new row is always waiting at the end.
 */
export default function ProductionOrdersBatchPage({
  productId,
}: {
  productId?: string
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const branchName = useBranchName()
  const isPhone = useIsPhone()
  const user = useSelector((state: RootState) => state.auth.data?.user) as
    | { id?: string; _id?: string; organizationId?: string }
    | undefined
  const userId = user?.id || user?._id || null
  const userKey = `${user?.organizationId || 'org'}:${userId || 'me'}`

  // The shared cached catalog — every buildable product, not just the first 200.
  const { products: buildable, isLoading: productsLoading } =
    useCatalogProducts({
      productType: BUILDABLE_PRODUCT_TYPES,
      packRole: 'make',
    })
  const { data: bomPage, isLoading: bomsLoading } = useGetBomsQuery({
    isActive: true,
    limit: 200,
  })
  const { data: settings } = useGetManufacturingSettingsQuery()
  const { data: operators } = useGetOperatorsQuery()
  const [createBatch] = useCreateProductionOrderBatchMutation()

  const storeRef = useRef<EntryStore<BatchRow, BatchHeader> | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const source = useMemo(
    () => buildableSource(buildable),
    [buildable]
  )
  const bomsByProduct = useMemo(() => {
    const map = new Map<string, Bom[]>()
    ;(bomPage?.results || []).forEach((b) => {
      const list = map.get(b.productId) || []
      list.push(b)
      map.set(b.productId, list)
    })
    map.forEach((list) =>
      list.sort(
        (a, b) =>
          Number(b.isDefault) - Number(a.isDefault) || b.version - a.version
      )
    )
    return map
  }, [bomPage])

  const people = useMemo(
    () =>
      (operators || []).map((o) => ({
        value: o.id,
        label: o.name || o.email || '—',
        sublabel: o.email,
        // Initials avatar in the list and on the field.
        picture: null,
      })),
    [operators]
  )

  const headerFields = useMemo<HeaderField<BatchHeader>[]>(
    () => [
      {
        key: 'plannedStartDate',
        label: 'Planned start',
        kind: 'date',
        required: true,
        icon: CalendarDays,
        // Moving the start moves the completion with it (same lead time).
        derive: (value, h) => {
          if (!isCalendarDate(value)) return {}
          const gap =
            daysBetween(h.plannedStartDate, h.plannedCompletionDate) ??
            loadLastUsed(userKey).leadDays ??
            DEFAULT_LEAD_DAYS
          return {
            plannedCompletionDate: shiftBusinessCalendarDate(
              value,
              Math.max(0, gap)
            ),
          }
        },
      },
      {
        key: 'plannedCompletionDate',
        label: 'Planned completion',
        kind: 'date',
        required: true,
        icon: CalendarCheck,
      },
      {
        key: 'priority',
        label: 'Priority',
        kind: 'select',
        icon: Flag,
        options: () =>
          PRIORITIES.map((p) => ({
            value: p,
            label: t(PRIORITY_META[p].label),
          })),
      },
      {
        key: 'operatorId',
        label: 'Operator',
        kind: 'custom',
        render: ({ value, onChange, id, next }) => (
          <EnterMovesOn next={next} enabled={!!value}>
            <SearchableSelect
              id={id}
              options={people}
              value={(value as string) || ''}
              onValueChange={(v) => onChange(v || null)}
              onSelected={next}
              deselectable={false}
              placeholder={t('Unassigned')}
              clearLabel={t('Unassigned')}
              searchPlaceholder={t('Search people…')}
            />
          </EnterMovesOn>
        ),
      },
    ],
    [people, userKey, t]
  )

  /** The header a fresh list starts with — read again on every Save & New. */
  const defaults = useCallback((): Partial<BatchHeader> => {
    const last = loadLastUsed(userKey)
    return {
      priority: settings?.defaultPriority || 'normal',
      sourceLocation: settings?.defaultSourceLocation || '',
      wipLocation: settings?.defaultWipLocation || '',
      finishedGoodsLocation: settings?.defaultFinishedGoodsLocation || '',
      // An explicit "Unassigned" last time (null) stays unassigned.
      operatorId: last.operatorId !== undefined ? last.operatorId : userId,
      // Team, locations and notes are not on this screen: no team, the Settings
      // locations, no notes (all can be changed on the order afterwards).
      teamMemberIds: [],
      notes: '',
      ...plannedDates(last.leadDays ?? DEFAULT_LEAD_DAYS),
    }
  }, [settings, userKey, userId])

  const config = useMemo(
    () =>
      createBatchConfig({
        headerFields,
        bomsByProduct,
        requireBom: settings?.requireBomForProduction !== false,
        defaults,
      }),
    [headerFields, bomsByProduct, settings, defaults]
  )

  const ready = !productsLoading && !bomsLoading && !!settings

  // The header is filled in already — start where the work is: the first product.
  useEffect(() => {
    if (!ready || isPhone || productId) return
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      if (active && active !== document.body) return
      cardRef.current
        ?.querySelector<HTMLInputElement>(
          '[data-entry-grid] input[role="combobox"]'
        )
        ?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [ready, isPhone, productId])

  // A remembered operator who has since left the organization is not offered.
  useEffect(() => {
    const store = storeRef.current
    if (!store || !operators?.length) return
    const { operatorId } = store.getState().header
    if (operatorId && !operators.some((o) => o.id === operatorId))
      store.setHeader({ operatorId: null })
  }, [operators, ready])

  // Opened from the single-order dialog with a product picked: start with it.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !productId || !ready) return
    const store = storeRef.current
    const product = source.getByKey?.(productId)
    if (!store || !product) return
    seeded.current = true
    if (store.filledRows().length) return
    const rowId = store.getState().order[0]
    if (rowId) store.setProduct(rowId, product)
  }, [productId, ready, source])

  // ── Quick templates ────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<OrderTemplate[]>(() =>
    loadTemplates(userKey)
  )
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)

  const applyTemplate = useCallback(
    async (tpl: OrderTemplate) => {
      const store = storeRef.current
      if (!store) return
      const patch: Partial<BatchHeader> = {}
      if (tpl.priority) patch.priority = tpl.priority
      if (tpl.leadDays !== undefined || tpl.startOffset !== undefined)
        Object.assign(
          patch,
          plannedDates(tpl.leadDays ?? DEFAULT_LEAD_DAYS, tpl.startOffset ?? 0)
        )
      // Only what this screen shows — team, locations and notes stay hidden defaults.
      if (tpl.header?.operatorId !== undefined)
        patch.operatorId = tpl.header.operatorId
      if (!tpl.rows?.length) {
        store.setHeader(patch)
        toast.success(`${t('Template applied')}: ${t(tpl.name)}`)
        return
      }
      if (store.filledRows().length) {
        const ok = await confirm({
          title: t('Replace the rows on screen?'),
          description: t(
            'The template brings its own products. The rows you entered are replaced.'
          ),
          confirmText: t('Replace'),
        })
        if (!ok) return
      }
      const ctx = store.ctx()
      let missing = 0
      const rows: Omit<BatchRow, 'id'>[] = []
      tpl.rows.forEach((r) => {
        const product = source.getByKey?.(r.productKey)
        if (!product) {
          missing++
          return
        }
        const filled = config.applyProduct(
          { ...blankBatchRow(), id: '' },
          product,
          ctx
        )
        const boms = bomsByProduct.get(product.productId) || []
        const { id: _id, ...row } = {
          ...filled,
          quantity: r.quantity ?? filled.quantity,
          bomId:
            r.bomId && boms.some((b) => b.id === r.bomId)
              ? r.bomId
              : filled.bomId,
        }
        rows.push(row)
      })
      store.reset({ ...store.getState().header, ...patch }, [
        ...rows,
        blankBatchRow(),
      ])
      if (missing)
        toast.warning(
          `${t('Template applied')} — ${missing} ${t('product(s) are no longer available and were left out')}`
        )
      else toast.success(`${t('Template applied')}: ${tpl.name}`)
    },
    [bomsByProduct, config, confirm, source, t]
  )

  const deleteTemplate = (id: string) => {
    const next = templates.filter((x) => x.id !== id)
    setTemplates(next)
    saveTemplates(userKey, next)
  }

  const onSave = useCallback(
    async (
      { header, rows }: { header: BatchHeader; rows: BatchRow[] },
      mode: SaveMode
    ) => {
      try {
        const { orders } = await createBatch({
          header: toApiHeader(header, mode === 'draft' ? 'draft' : 'planned'),
          lines: rows.map(rowToBatchLine),
        }).unwrap()
        rememberLastUsed(userKey, header)
        const numbers = orders.map((o) => o.orderNumber)
        toast.success(
          `${orders.length} ${t(mode === 'draft' ? 'draft order(s) saved' : 'production order(s) created')}: ${
            numbers.length > 3
              ? `${numbers[0]} … ${numbers[numbers.length - 1]}`
              : numbers.join(', ')
          }`
        )
        if (mode === 'save-new') return
        navigate({ to: LIST as never })
      } catch (err) {
        const rowErrors = rowErrorsFromApi(err, rows, {
          plannedQuantity: 'quantity',
        })
        if (rowErrors) {
          toast.error(t('Some rows need attention — no order was created'))
          return { rowErrors }
        }
        throw err
      }
    },
    [createBatch, navigate, t, userKey]
  )

  return (
    <div className='space-y-5'>
      <PageHero branchName={branchName} />

      {!ready ? (
        <Skeleton className='h-[32rem] w-full rounded-xl' />
      ) : (
        <Card
          ref={cardRef}
          className='gap-5 p-4 pb-0 sm:p-6 sm:pb-0'
          aria-labelledby='po-batch-title'
        >
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='flex min-w-0 items-center gap-3'>
              <div className='bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'>
                <ClipboardList className='h-5 w-5' aria-hidden />
              </div>
              <div className='min-w-0'>
                <h3
                  id='po-batch-title'
                  className='text-base leading-tight font-semibold'
                >
                  {t('Create new production orders')}
                </h3>
                <p className='text-muted-foreground mt-0.5 text-xs'>
                  {t(
                    'Pick the products to make — each row becomes its own order with the dates, priority and operator above.'
                  )}
                </p>
              </div>
            </div>
            <div className='flex items-center gap-2 max-sm:w-full'>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='gap-1.5 max-sm:ml-auto'
                  >
                    <LayoutTemplate className='h-4 w-4' />
                    {t('Quick templates')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-72'>
                  <DropdownMenuLabel className='text-muted-foreground text-xs font-medium'>
                    {t('Start from')}
                  </DropdownMenuLabel>
                  {BUILT_IN_TEMPLATES.map((tpl) => (
                    <DropdownMenuItem
                      key={tpl.id}
                      onSelect={() => void applyTemplate(tpl)}
                      className='flex-col items-start gap-0.5'
                    >
                      <span className='font-medium'>{t(tpl.name)}</span>
                      {tpl.description && (
                        <span className='text-muted-foreground text-xs'>
                          {t(tpl.description)}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                  {templates.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className='text-muted-foreground text-xs font-medium'>
                        {t('Your templates')}
                      </DropdownMenuLabel>
                      {templates.map((tpl) => (
                        <DropdownMenuItem
                          key={tpl.id}
                          onSelect={() => void applyTemplate(tpl)}
                          className='group gap-2'
                        >
                          <div className='min-w-0 flex-1'>
                            <div className='truncate font-medium'>
                              {tpl.name}
                            </div>
                            <div className='text-muted-foreground text-xs'>
                              {tpl.rows?.length
                                ? `${tpl.rows.length} ${t('product(s)')}`
                                : t('Header only')}
                              {tpl.priority
                                ? ` · ${t(PRIORITY_META[tpl.priority].label)}`
                                : ''}
                            </div>
                          </div>
                          <button
                            type='button'
                            aria-label={`${t('Delete template')} ${tpl.name}`}
                            className='text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-1'
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              deleteTemplate(tpl.id)
                            }}
                          >
                            <Trash2 className='h-3.5 w-3.5' />
                          </button>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setSaveTemplateOpen(true)}>
                    <Plus className='mr-2 h-4 w-4' />
                    {t('Save current as template…')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <TransactionEntry<BatchRow, BatchHeader>
            config={config}
            products={source}
            storeRef={storeRef}
            draft={{ key: 'production-orders:batch' }}
            onSave={onSave}
            appearance='card'
            className='space-y-5'
            gridTitle={
              <div className='flex min-w-0 items-center gap-2'>
                <span className='bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-md'>
                  <Boxes className='h-4 w-4' aria-hidden />
                </span>
                <span className='text-sm font-semibold'>
                  {t('Products to manufacture')}
                </span>
                <span className='text-muted-foreground truncate text-xs max-sm:hidden'>
                  ({t('Finished goods / Sub-assemblies')})
                </span>
              </div>
            }
            saveLabel={t('Create & plan')}
            saveActions={[
              {
                mode: 'draft',
                label: 'Save as drafts',
                variant: 'secondary',
              },
            ]}
            footerExtra={
              <Button
                type='button'
                variant='outline'
                onClick={async () => {
                  const store = storeRef.current
                  if (store?.filledRows().length) {
                    const ok = await confirm({
                      title: t('Leave without creating the orders?'),
                      description: t(
                        'Your rows stay as a draft on this device until you discard them.'
                      ),
                      confirmText: t('Leave'),
                    })
                    if (!ok) return
                  }
                  navigate({ to: LIST as never })
                }}
              >
                {t('Cancel')}
              </Button>
            }
          />
        </Card>
      )}
      <p className='text-muted-foreground text-xs'>
        {t(
          'The product list opens by itself: type to search, ↑↓ to choose, Enter to pick. Enter on Qty adds the next row. The BOM is chosen for you (Tab to change it). Ctrl+Enter creates & plans; Alt+Enter creates and starts a fresh list.'
        )}
      </p>

      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        rowCount={storeRef.current?.filledRows().length ?? 0}
        onSave={(name, withRows) => {
          const store = storeRef.current
          if (!store) return
          const rows = withRows
            ? store
                .filledRows()
                .filter((r) => r.product)
                .map((r) => ({
                  productKey: r.product!.key,
                  quantity: r.quantity,
                  bomId: r.bomId,
                }))
            : []
          const tpl = templateFromEntry(name, store.getState().header, rows)
          const next = [tpl, ...templates.filter((x) => x.name !== name)]
          setTemplates(next)
          if (saveTemplates(userKey, next))
            toast.success(`${t('Template saved')}: ${name}`)
          else toast.error(t('Could not save the template on this device'))
        }}
      />
    </div>
  )
}

/** Title, what the screen does, and the way back to the list. */
function PageHero({ branchName }: { branchName?: string | null }) {
  const { t } = useLanguage()
  return (
    <section className='flex flex-wrap items-start justify-between gap-4'>
      <div className='flex min-w-0 items-start gap-4'>
        <div className='bg-primary/10 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-xl'>
          <PackageCheck className='h-6 w-6' aria-hidden />
        </div>
        <div className='min-w-0 space-y-1'>
          <Badge
            variant='secondary'
            className='bg-primary/10 text-primary h-5 rounded-md px-1.5 text-[10px] font-medium'
          >
            {t('Manufacturing')}
          </Badge>
          <h2 className='text-xl leading-tight font-semibold tracking-tight sm:text-2xl'>
            {t('Production Orders')}
          </h2>
          <p className='text-muted-foreground max-w-xl text-sm'>
            {t(
              'Create and manage production orders. Each order becomes its own record. Materials are issued from stock and output is received into finished goods'
            )}
            {branchName ? ` (${branchName})` : ''}.
          </p>
        </div>
      </div>
      <Button asChild variant='outline' size='sm'>
        <Link to={LIST as never}>
          <List className='mr-1.5 h-4 w-4' />
          {t('All production orders')}
        </Link>
      </Button>
    </section>
  )
}

function SaveTemplateDialog({
  open,
  onOpenChange,
  rowCount,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rowCount: number
  onSave: (name: string, withRows: boolean) => void
}) {
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [withRows, setWithRows] = useState(true)
  useEffect(() => {
    if (open) {
      setName('')
      setWithRows(rowCount > 0)
    }
  }, [open, rowCount])
  const submit = () => {
    const n = name.trim()
    if (!n) return
    onSave(n, withRows && rowCount > 0)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Save as template')}</DialogTitle>
          <DialogDescription>
            {t(
              'Keeps the priority, lead time and operator — dates are worked out from the day you use it. Saved on this device.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='grid gap-1.5'>
            <Label htmlFor='po-template-name'>{t('Template name')}</Label>
            <Input
              id='po-template-name'
              autoFocus
              showVoiceInput={false}
              autoComplete='off'
              maxLength={60}
              value={name}
              placeholder={t('e.g. Weekly fan assembly')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (plainEnter(e)) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
          </div>
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox
              checked={withRows && rowCount > 0}
              disabled={rowCount === 0}
              onCheckedChange={(v) => setWithRows(v === true)}
            />
            {rowCount
              ? t('Include the products and quantities ({{n}} rows)').replace(
                  '{{n}}',
                  String(rowCount)
                )
              : t('No product rows to include yet')}
          </label>
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='button' disabled={!name.trim()} onClick={submit}>
            {t('Save template')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
