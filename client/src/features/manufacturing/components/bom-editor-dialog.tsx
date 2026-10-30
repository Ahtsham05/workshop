import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Boxes,
  CalendarCheck,
  CalendarDays,
  FileText,
  GitBranch,
  GripVertical,
  Hash,
  Layers,
  Lock,
  Package,
  Plus,
  Replace,
  Save,
  Tag,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useCreateBomMutation,
  useCreateBomVersionMutation,
  useGetBomsQuery,
  useUpdateBomMutation,
  type Bom,
  type BomInput,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { afterPaint } from '@/lib/invoice-form-keyboard'
import { formatTotalsByUnit } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  BUILDABLE_PRODUCT_TYPES,
  COMPONENT_PRODUCT_TYPES,
} from '../lib/constants'
import {
  ROUTING_ADD_SELECTOR,
  fromRoutingDraft,
  stepFieldSelector,
  toRoutingDraft,
  type RoutingDraft,
} from '../lib/routing-draft'
import { ProductPicker } from './product-picker'
import { RoutingEditor } from './routing-editor'

type AltDraft = { productId: string; productName: string; ratio: string }
type LineDraft = {
  key: string
  _id?: string
  productId: string
  productName: string
  quantity: string
  unit: string
  scrapPercent: string
  isOptional: boolean
  childBomId: string
  notes: string
  alternatives: AltDraft[]
  expanded: boolean
}

const AUTO = '__auto__'
/** Which product list is open: the header's, or a component row's (by key). */
const HEADER_PICKER = '__header__'
let keySeq = 0
const nextKey = () => `line-${++keySeq}`

const blankLine = (): LineDraft => ({
  key: nextKey(),
  productId: '',
  productName: '',
  quantity: '1',
  unit: 'pcs',
  scrapPercent: '0',
  isOptional: false,
  childBomId: AUTO,
  notes: '',
  alternatives: [],
  expanded: false,
})

const toDraft = (bom?: Bom | null): LineDraft[] =>
  (bom?.components || []).map((c) => ({
    key: nextKey(),
    _id: c._id,
    productId: c.productId,
    productName: c.productName || '',
    quantity: String(c.quantity),
    unit: c.unit,
    scrapPercent: String(c.scrapPercent || 0),
    isOptional: c.isOptional,
    childBomId: c.childBomId || AUTO,
    notes: c.notes || '',
    alternatives: (c.alternatives || []).map((a) => ({
      productId: a.productId,
      productName: a.productName || '',
      ratio: String(a.ratio || 1),
    })),
    expanded: false,
  }))

/** Component lines as the API takes them; `keepIds` when editing the same version in place. */
const toComponentsPayload = (lines: LineDraft[], keepIds: boolean) =>
  lines
    .filter((l) => l.productId)
    .map((l, index) => ({
      ...(keepIds && l._id ? { _id: l._id } : {}),
      productId: l.productId,
      quantity: Number(l.quantity),
      unit: l.unit,
      scrapPercent: Number(l.scrapPercent) || 0,
      isOptional: l.isOptional,
      childBomId: l.childBomId === AUTO ? null : l.childBomId,
      notes: l.notes,
      sequence: index,
      alternatives: l.alternatives
        .filter((a) => a.productId)
        .map((a) => ({ productId: a.productId, ratio: Number(a.ratio) || 1 })),
    }))

/** What a locked version freezes — the output quantity and the component lines. */
const recipeKey = (
  quantity: number,
  components: ReturnType<typeof toComponentsPayload>
) => JSON.stringify([quantity, components])

const toDateInput = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : ''

const isPlainEnter = (e: React.KeyboardEvent) =>
  e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey

const COMPONENT_GRID =
  'md:grid-cols-[1.25rem_1.75rem_minmax(0,3fr)_9rem_6.5rem_minmax(0,1.5fr)_4.5rem_5rem]'

/** The look every field in this dialog shares (pickers and selects included). */
const FIELD =
  'bg-background h-10 rounded-lg shadow-xs transition-[color,box-shadow,border-color] hover:border-foreground/25'

export type BomEditorMode = 'create' | 'edit' | 'version'

/**
 * Create a BOM, edit an unlocked version, or branch a new version off an existing one.
 * Components always reference the branch's existing products.
 *
 * Keyboard (like the invoice screen): Enter goes Product → Output qty → each component
 * (its search opens by itself; pick → Qty → next row, adding one after the last),
 * skipping optional fields (BOM name, unit, dates, scrap, sub-BOM — Tab reaches them).
 * Enter on an empty search finishes the components and moves to the routing, then the
 * notes. Ctrl+Enter saves from anywhere.
 *
 * Product to build lists finished goods (and sub-assemblies, which have their own BOM);
 * components list everything else.
 */
export function BomEditorDialog({
  mode,
  bom,
  presetProduct,
  onClose,
  onSaved,
}: {
  mode: BomEditorMode
  bom?: Bom | null
  presetProduct?: { id: string; name: string; unit?: string } | null
  onClose: () => void
  onSaved?: (bom: Bom) => void
}) {
  const { t } = useLanguage()
  const [product, setProduct] = useState<{ id: string; name: string } | null>(
    bom ? { id: bom.productId, name: bom.productName } : presetProduct || null
  )
  const [name, setName] = useState(bom?.name || '')
  const [quantity, setQuantity] = useState(String(bom?.quantity ?? 1))
  const [unit, setUnit] = useState(bom?.unit || presetProduct?.unit || 'pcs')
  const [notes, setNotes] = useState(bom?.notes || '')
  const [effectiveFrom, setEffectiveFrom] = useState(
    toDateInput(bom?.effectiveFrom)
  )
  const [effectiveTo, setEffectiveTo] = useState(toDateInput(bom?.effectiveTo))
  const [isDefault, setIsDefault] = useState(
    mode === 'edit' ? !!bom?.isDefault : mode === 'create'
  )
  // A locked version (released orders use it) keeps its recipe: editing it saves recipe
  // changes as the next version; name, notes, dates and routing still update in place.
  const revises = mode === 'edit' && !!bom?.isLocked
  const [lines, setLines] = useState<LineDraft[]>(() => {
    const draft = toDraft(bom)
    return draft.length ? draft : [blankLine()]
  })
  const [originalRecipe] = useState(() =>
    recipeKey(bom?.quantity ?? 1, toComponentsPayload(toDraft(bom), false))
  )
  const [routing, setRouting] = useState<RoutingDraft[]>(() =>
    toRoutingDraft(bom?.operations)
  )
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const [createBom, { isLoading: creating }] = useCreateBomMutation()
  const [updateBom, { isLoading: updating }] = useUpdateBomMutation()
  const [createVersion, { isLoading: versioning }] =
    useCreateBomVersionMutation()
  const busy = creating || updating || versioning

  // ---- keyboard chain ---------------------------------------------------------------
  // Focus at once (fast typing must not spill into the previous field); wait a paint
  // only if the field isn't on screen yet.
  const focusLater = (selector: string) => {
    const go = () => {
      const el = bodyRef.current?.querySelector<HTMLElement>(selector)
      el?.focus()
      if (el instanceof HTMLInputElement) el.select()
      return !!el
    }
    if (!go()) afterPaint(go)
  }
  const field = (id: string) => `[data-field="${id}"]`

  /** Arrive on a component row: its search when it has no product yet, else its Qty. */
  const goToLine = (index: number) => {
    const line = lines[index]
    if (!line) {
      const fresh = blankLine()
      setLines((prev) => [...prev, fresh])
      setOpenPicker(fresh.key)
      return
    }
    if (line.productId) focusLater(field(`line:${line.key}:qty`))
    else setOpenPicker(line.key)
  }

  const finishComponents = () => {
    const first = routing[0]
    focusLater(
      first ? stepFieldSelector(first.key, 'name') : ROUTING_ADD_SELECTOR
    )
  }

  const enterTo = (action: () => void) => (e: React.KeyboardEvent) => {
    if (!isPlainEnter(e)) return
    e.preventDefault()
    action()
  }

  // Open the first search the person needs as soon as the dialog has settled.
  useEffect(() => {
    if (mode !== 'create') return
    afterPaint(() =>
      setOpenPicker(product ? (lines[0]?.key ?? null) : HEADER_PICKER)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patchLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    )

  const addLine = () => {
    const fresh = blankLine()
    setLines((prev) => [...prev, fresh])
    setOpenPicker(fresh.key)
  }

  const moveLine = (fromKey: string, toKey: string) =>
    setLines((prev) => {
      const from = prev.findIndex((l) => l.key === fromKey)
      const to = prev.findIndex((l) => l.key === toKey)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [row] = next.splice(from, 1)
      next.splice(to, 0, row)
      return next
    })

  const title =
    mode === 'create'
      ? t('New Bill of Materials')
      : mode === 'edit'
        ? `${t('Edit')} ${bom?.bomNumber} · v${bom?.version}`
        : `${t('New version of')} ${bom?.bomNumber}`

  const recipeChanged =
    revises &&
    recipeKey(Number(quantity) || 1, toComponentsPayload(lines, false)) !==
      originalRecipe

  const submit = async () => {
    if (busy) return
    if (!product) {
      toast.error(t('Choose the product this BOM builds'))
      return setOpenPicker(HEADER_PICKER)
    }
    const valid = lines.filter((l) => l.productId)
    if (!valid.length) {
      toast.error(t('Add at least one component'))
      return goToLine(lines.findIndex((l) => !l.productId))
    }
    const badQty = valid.find((l) => !(Number(l.quantity) > 0))
    if (badQty) {
      toast.error(t('Every component needs a quantity above zero'))
      return focusLater(field(`line:${badQty.key}:qty`))
    }
    const unnamed = routing.find(
      (r) => !r.name.trim() && (r.workCenter.trim() || r.instructions.trim())
    )
    if (unnamed) {
      toast.error(t('Every routing step needs a name'))
      return focusLater(stepFieldSelector(unnamed.key, 'name'))
    }

    const body: BomInput = {
      name: name.trim(),
      quantity: Number(quantity) || 1,
      unit,
      notes,
      effectiveFrom: effectiveFrom || null,
      effectiveTo: effectiveTo || null,
      operations: fromRoutingDraft(routing, mode === 'edit' && !recipeChanged),
      components: toComponentsPayload(valid, mode === 'edit' && !recipeChanged),
    }
    try {
      let saved: Bom
      if (recipeChanged) {
        saved = await createVersion({
          bomId: bom!.id,
          ...body,
          isDefault,
        }).unwrap()
        toast.success(
          t(
            'Saved as version {{v}} — version {{old}} stays with the orders that used it'
          )
            .replace('{{v}}', String(saved.version))
            .replace('{{old}}', String(bom!.version))
        )
        onSaved?.(saved)
        onClose()
        return
      }
      if (revises) {
        // Only the parts a locked version allows; the server refuses recipe fields.
        const { components: _c, quantity: _q, ...inPlace } = body
        saved = await updateBom({
          bomId: bom!.id,
          ...inPlace,
          ...(isDefault && !bom!.isDefault ? { isDefault: true } : {}),
        }).unwrap()
      } else if (mode === 'create')
        saved = await createBom({
          ...body,
          productId: product.id,
          isDefault,
        }).unwrap()
      else if (mode === 'edit')
        saved = await updateBom({
          bomId: bom!.id,
          ...body,
          ...(isDefault && !bom!.isDefault ? { isDefault: true } : {}),
        }).unwrap()
      else
        saved = await createVersion({
          bomId: bom!.id,
          ...body,
          isDefault,
        }).unwrap()
      toast.success(
        mode === 'version'
          ? t('Version {{v}} created').replace('{{v}}', String(saved.version))
          : t('BOM saved')
      )
      onSaved?.(saved)
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to save BOM')))
    }
  }

  // Ctrl/Cmd+Enter saves from any field (captured first, so an open list can't eat it).
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.altKey) return
      e.preventDefault()
      e.stopPropagation()
      void submitRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const componentCount = lines.filter((l) => l.productId).length
  const pickedLines = lines.filter((l) => l.productId)
  const componentTotal = formatTotalsByUnit(pickedLines)
  // what the floor actually draws once each line's scrap allowance is added
  const componentTotalWithScrap = pickedLines.some(
    (l) => Number(l.scrapPercent) > 0
  )
    ? formatTotalsByUnit(
        pickedLines.map((l) => ({
          quantity:
            (Number(l.quantity) || 0) *
            (1 + (Number(l.scrapPercent) || 0) / 100),
          unit: l.unit,
        }))
      )
    : null

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className='flex max-h-[94vh] flex-col gap-0 p-0 sm:max-w-6xl'
        onOpenAutoFocus={(e) => mode === 'create' && e.preventDefault()}
      >
        <DialogHeader className='px-6 pt-5 pb-4 max-sm:px-4'>
          <div className='flex items-start gap-3'>
            <span className='bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl'>
              <Layers className='h-5 w-5' />
            </span>
            <div className='min-w-0 text-left'>
              <DialogTitle className='text-lg'>{title}</DialogTitle>
              <DialogDescription>
                {mode === 'version'
                  ? t(
                      'The current version stays untouched — orders already released keep using it.'
                    )
                  : revises
                    ? t(
                        'Released orders use this version, so changing components or quantity saves a new version — this one stays with those orders. Name, notes and routing update here.'
                      )
                    : t(
                        'Define what goes into one batch of this product. Sub-assemblies with their own BOM expand automatically.'
                      )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div
          ref={bodyRef}
          className='flex-1 space-y-4 overflow-y-auto px-6 pb-5 max-sm:px-4'
        >
          {/* ---- header ---- */}
          <section className='bg-muted/30 grid grid-cols-1 gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-12'>
            <FieldBlock
              label={t('Product to build')}
              required
              className='sm:col-span-2 lg:col-span-5'
            >
              <ProductPicker
                value={product}
                productType={BUILDABLE_PRODUCT_TYPES}
                packRole='make'
                createAs='finished_good'
                placeholder={t('Select product to build…')}
                searchPlaceholder={t(
                  'Search finished goods, by-products & sub-assemblies…'
                )}
                icon={<Package className='text-muted-foreground h-4 w-4' />}
                className={FIELD}
                data-field='header:product'
                open={openPicker === HEADER_PICKER}
                onOpenChange={(o) => setOpenPicker(o ? HEADER_PICKER : null)}
                onChange={(p) => {
                  setProduct(p)
                  setUnit(p.unit)
                  if (!name.trim()) setName(p.name)
                  // BOM name is optional (and now filled in) — straight on to the qty.
                  focusLater(field('header:qty'))
                }}
                disabled={mode !== 'create'}
              />
            </FieldBlock>
            <FieldBlock label={t('BOM name')} className='lg:col-span-4'>
              <InputGroup icon={<Tag />}>
                <Input
                  className={BARE_INPUT}
                  value={name}
                  showVoiceInput={false}
                  data-field='header:name'
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={enterTo(() => focusLater(field('header:qty')))}
                  placeholder={t('Defaults to the product name')}
                />
              </InputGroup>
            </FieldBlock>
            <FieldBlock
              label={t('Output qty')}
              required
              className='lg:col-span-3'
            >
              <NumberField
                icon={<Hash />}
                value={quantity}
                onChange={setQuantity}
                data-field='header:qty'
                aria-label={t('Output qty')}
                onKeyDown={enterTo(() => goToLine(0))}
                suffix={<UnitTag unit={product ? unit : undefined} />}
              />
            </FieldBlock>
            <FieldBlock label={t('Effective from')} className='lg:col-span-3'>
              <DateField
                icon={<CalendarDays />}
                value={effectiveFrom}
                data-field='header:from'
                onChange={setEffectiveFrom}
                onKeyDown={enterTo(() => focusLater(field('header:to')))}
              />
            </FieldBlock>
            <FieldBlock label={t('Effective to')} className='lg:col-span-3'>
              <DateField
                icon={<CalendarCheck />}
                value={effectiveTo}
                data-field='header:to'
                onChange={setEffectiveTo}
                onKeyDown={enterTo(() => goToLine(0))}
              />
            </FieldBlock>
            <div className='bg-background flex h-10 items-center gap-3 self-end rounded-lg border px-3 shadow-xs sm:col-span-2 lg:col-span-6'>
              <Switch
                id='bom-default'
                checked={isDefault}
                onCheckedChange={setIsDefault}
                disabled={mode === 'edit' && bom?.isDefault}
              />
              <Label htmlFor='bom-default' className='font-normal'>
                {t('Use as the default BOM for this product')}
              </Label>
            </div>
          </section>

          {/* ---- components ---- */}
          <section className='bg-card rounded-xl border'>
            <SectionHeader
              icon={<Boxes className='h-4.5 w-4.5' />}
              title={t('Components')}
              count={componentCount}
              action={
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={addLine}
                >
                  <Plus className='mr-1.5 h-3.5 w-3.5' />
                  {t('Add component')}
                </Button>
              }
            />
            <div className='px-4 pb-4'>
              <div className='overflow-hidden rounded-lg border'>
                <div
                  className={cn(
                    'bg-muted/40 text-muted-foreground hidden gap-2 border-b px-3 py-2 text-xs font-medium md:grid',
                    COMPONENT_GRID
                  )}
                >
                  <span />
                  <span>#</span>
                  <span>{t('Component')}</span>
                  <span>{t('Qty')}</span>
                  <span>{t('Scrap %')}</span>
                  <span>{t('Sub-BOM')}</span>
                  <span className='text-center'>{t('Optional')}</span>
                  <span className='text-right'>{t('Actions')}</span>
                </div>
                {lines.length === 0 && (
                  <button
                    type='button'
                    onClick={addLine}
                    className='text-muted-foreground hover:bg-muted/40 w-full py-8 text-center text-sm'
                  >
                    {t('No components yet — add the first one')}
                  </button>
                )}
                {lines.map((line, index) => (
                  <div
                    key={line.key}
                    className={cn(
                      'border-b last:border-b-0',
                      dragKey === line.key && 'opacity-50'
                    )}
                    onDragOver={(e) => {
                      if (!dragKey) return
                      e.preventDefault()
                      if (dragKey !== line.key) moveLine(dragKey, line.key)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragKey(null)
                    }}
                  >
                    <div
                      className={cn(
                        'grid grid-cols-2 items-center gap-2 px-3 py-2.5',
                        COMPONENT_GRID
                      )}
                    >
                      <span
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', line.key)
                          setDragKey(line.key)
                        }}
                        onDragEnd={() => setDragKey(null)}
                        className='text-muted-foreground hover:text-foreground hidden cursor-grab items-center justify-center active:cursor-grabbing md:flex'
                        title={t('Drag to reorder')}
                      >
                        <GripVertical className='h-4 w-4' />
                      </span>
                      <span className='hidden text-sm font-medium tabular-nums md:block'>
                        {index + 1}
                      </span>
                      <div className='col-span-2 flex items-center gap-2 md:col-span-1'>
                        <span className='text-muted-foreground w-5 shrink-0 text-xs font-medium tabular-nums md:hidden'>
                          {index + 1}.
                        </span>
                        <ProductPicker
                          value={
                            line.productId
                              ? { id: line.productId, name: line.productName }
                              : null
                          }
                          icon={
                            <Package className='text-muted-foreground h-4 w-4 shrink-0' />
                          }
                          className={FIELD}
                          data-field={`line:${line.key}:product`}
                          productType={COMPONENT_PRODUCT_TYPES}
                          createAs='raw_material'
                          searchPlaceholder={t(
                            'Search raw materials, components, by-products…'
                          )}
                          excludeIds={product ? [product.id] : []}
                          open={openPicker === line.key}
                          onOpenChange={(o) =>
                            setOpenPicker(o ? line.key : null)
                          }
                          onEmptyEnter={finishComponents}
                          onChange={(p) => {
                            patchLine(line.key, {
                              productId: p.id,
                              productName: p.name,
                              unit: p.unit,
                              childBomId: AUTO,
                            })
                            focusLater(field(`line:${line.key}:qty`))
                          }}
                        />
                      </div>
                      <CellLabel label={t('Qty')}>
                        <NumberField
                          value={line.quantity}
                          onChange={(v) => patchLine(line.key, { quantity: v })}
                          data-field={`line:${line.key}:qty`}
                          onKeyDown={enterTo(() => goToLine(index + 1))}
                          aria-label={t('Qty')}
                          suffix={
                            <UnitTag
                              unit={line.productId ? line.unit : undefined}
                            />
                          }
                        />
                      </CellLabel>
                      <CellLabel label={t('Scrap %')}>
                        <NumberField
                          value={line.scrapPercent}
                          onChange={(v) =>
                            patchLine(line.key, { scrapPercent: v })
                          }
                          data-field={`line:${line.key}:scrap`}
                          onKeyDown={enterTo(() => goToLine(index + 1))}
                          aria-label={t('Scrap %')}
                          suffix={
                            <span className='text-muted-foreground text-xs font-medium'>
                              %
                            </span>
                          }
                        />
                      </CellLabel>
                      <CellLabel label={t('Sub-BOM')}>
                        <SubBomSelect
                          productId={line.productId}
                          value={line.childBomId}
                          onChange={(v) =>
                            patchLine(line.key, { childBomId: v })
                          }
                        />
                      </CellLabel>
                      <label className='flex items-center gap-2 text-xs md:justify-center'>
                        <Checkbox
                          checked={line.isOptional}
                          onCheckedChange={(v) =>
                            patchLine(line.key, { isOptional: !!v })
                          }
                        />
                        <span className='md:hidden'>{t('Optional')}</span>
                      </label>
                      <div className='flex justify-end gap-0.5'>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          tabIndex={-1}
                          className={cn(
                            'relative h-8 w-8',
                            (line.expanded ||
                              line.alternatives.length > 0 ||
                              line.notes) &&
                              'text-primary'
                          )}
                          onClick={() =>
                            patchLine(line.key, { expanded: !line.expanded })
                          }
                          title={t('Alternatives & notes')}
                          aria-label={t('Alternatives & notes')}
                        >
                          <Replace className='h-3.5 w-3.5' />
                          {line.alternatives.length > 0 && (
                            <span className='bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px]'>
                              {line.alternatives.length}
                            </span>
                          )}
                        </Button>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          tabIndex={-1}
                          className='h-8 w-8 text-red-600 hover:bg-red-500/10 hover:text-red-600'
                          onClick={() =>
                            setLines((prev) =>
                              prev.filter((l) => l.key !== line.key)
                            )
                          }
                          aria-label={t('Remove')}
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    </div>
                    {line.expanded && (
                      <LineExtras
                        line={line}
                        excludeIds={[
                          line.productId,
                          ...(product ? [product.id] : []),
                        ]}
                        onPatch={(patch) => patchLine(line.key, patch)}
                      />
                    )}
                  </div>
                ))}
                {componentCount > 0 && (
                  <div className='bg-muted/40 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t px-3 py-2 text-sm'>
                    <span className='font-semibold'>
                      {t('Total')}{' '}
                      <span className='text-muted-foreground text-xs font-normal'>
                        ({t('for')} {Number(quantity) || 0} {unit})
                      </span>
                    </span>
                    <span className='flex flex-wrap items-baseline gap-x-4 tabular-nums'>
                      <span className='font-semibold'>{componentTotal}</span>
                      {componentTotalWithScrap && (
                        <span className='text-muted-foreground text-xs'>
                          {t('with scrap')} {componentTotalWithScrap}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <RoutingEditor
            rows={routing}
            onChange={setRouting}
            onFinish={() => focusLater(field('notes'))}
          />

          {/* ---- notes ---- */}
          <section className='bg-card rounded-xl border'>
            <SectionHeader
              icon={<FileText className='h-4.5 w-4.5' />}
              title={t('Notes')}
            />
            <div className='px-4 pb-4'>
              <Textarea
                rows={2}
                value={notes}
                data-field='notes'
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('Process notes, revision reason…')}
              />
            </div>
          </section>
        </div>

        <DialogFooter className='items-center border-t px-6 py-3 max-sm:px-4'>
          <p className='text-muted-foreground mr-auto hidden text-xs lg:block'>
            <Kbd>Enter</Kbd> {t('next field')} · <Kbd>Ctrl</Kbd>+
            <Kbd>Enter</Kbd> {t('save')}
          </p>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {mode === 'version' || recipeChanged ? (
              <GitBranch className='mr-2 h-4 w-4' />
            ) : (
              <Save className='mr-2 h-4 w-4' />
            )}
            {mode === 'version'
              ? t('Create version')
              : recipeChanged
                ? t('Save as new version')
                : t('Save BOM')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldBlock({
  label,
  required,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid min-w-0 gap-1.5', className)}>
      <Label className='text-xs font-semibold'>
        {label}
        {required && <span className='text-destructive'>*</span>}
      </Label>
      {children}
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  count,
  action,
}: {
  icon: ReactNode
  title: string
  count?: number
  action?: ReactNode
}) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'>
      <div className='flex items-center gap-3'>
        <span className='bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg'>
          {icon}
        </span>
        <h3 className='text-sm font-semibold'>
          {title}
          {count !== undefined && (
            <span className='text-muted-foreground ml-1 font-normal'>
              ({count})
            </span>
          )}
        </h3>
      </div>
      {action}
    </div>
  )
}

/** A table cell on desktop; on phones the cell carries its own small label. */
function CellLabel({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className='grid min-w-0 gap-1'>
      <span className='text-muted-foreground text-[11px] md:hidden'>
        {label}
      </span>
      {children}
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className='bg-muted rounded border px-1 py-px font-mono text-[10px]'>
      {children}
    </kbd>
  )
}

function LineExtras({
  line,
  excludeIds,
  onPatch,
}: {
  line: LineDraft
  excludeIds: string[]
  onPatch: (patch: Partial<LineDraft>) => void
}) {
  const { t } = useLanguage()
  const setAlt = (i: number, patch: Partial<AltDraft>) =>
    onPatch({
      alternatives: line.alternatives.map((a, j) =>
        j === i ? { ...a, ...patch } : a
      ),
    })
  return (
    <div className='bg-muted/30 grid gap-3 border-t px-3 py-3 md:grid-cols-2 md:pl-14'>
      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <span className='text-muted-foreground text-xs font-medium'>
            {t('Alternative components')}
          </span>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            className='h-7 text-xs'
            onClick={() =>
              onPatch({
                alternatives: [
                  ...line.alternatives,
                  { productId: '', productName: '', ratio: '1' },
                ],
              })
            }
          >
            <Plus className='mr-1 h-3 w-3' />
            {t('Add')}
          </Button>
        </div>
        {line.alternatives.length === 0 && (
          <p className='text-muted-foreground text-xs'>
            {t('Substitutes that may be issued instead of this component.')}
          </p>
        )}
        {line.alternatives.map((alt, i) => (
          <div
            key={i}
            className='grid grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center gap-2'
          >
            <ProductPicker
              value={
                alt.productId
                  ? { id: alt.productId, name: alt.productName }
                  : null
              }
              excludeIds={excludeIds}
              productType={COMPONENT_PRODUCT_TYPES}
              onChange={(p) =>
                setAlt(i, { productId: p.id, productName: p.name })
              }
            />
            <NumberField
              className='h-9'
              value={alt.ratio}
              title={t(
                'Units of the alternative that replace one unit of the component'
              )}
              aria-label={t('Ratio')}
              onChange={(v) => setAlt(i, { ratio: v })}
              suffix={<span className='text-muted-foreground text-xs'>×</span>}
            />
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              onClick={() =>
                onPatch({
                  alternatives: line.alternatives.filter((_, j) => j !== i),
                })
              }
            >
              <Trash2 className='h-3.5 w-3.5' />
            </Button>
          </div>
        ))}
      </div>
      <div className='space-y-2'>
        <span className='text-muted-foreground text-xs font-medium'>
          {t('Line notes')}
        </span>
        <Textarea
          rows={2}
          value={line.notes}
          onChange={(e) => onPatch({ notes: e.target.value })}
        />
      </div>
    </div>
  )
}

/** One frame for icon + control + suffix: a single border and focus ring. */
function InputGroup({
  icon,
  suffix,
  className,
  children,
}: {
  icon?: ReactNode
  suffix?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        FIELD,
        'border-input dark:bg-input/30 focus-within:border-input-ring focus-within:ring-input-ring/50 flex min-w-0 items-center gap-2 border px-3 focus-within:ring-[3px]',
        className
      )}
    >
      {icon && (
        <span className='text-muted-foreground flex shrink-0 [&_svg]:h-4 [&_svg]:w-4'>
          {icon}
        </span>
      )}
      {children}
      {suffix}
    </div>
  )
}

const BARE_INPUT =
  'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent'

/** Decimal number without browser spinners: digits and one point, selected on focus. */
function NumberField({
  value,
  onChange,
  icon,
  suffix,
  className,
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  icon?: ReactNode
  suffix?: ReactNode
  className?: string
  title?: string
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  'aria-label'?: string
  'data-field'?: string
}) {
  return (
    <InputGroup icon={icon} suffix={suffix} className={className}>
      <Input
        type='text'
        inputMode='decimal'
        autoComplete='off'
        showVoiceInput={false}
        className={cn(BARE_INPUT, 'text-right font-medium tabular-nums')}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const [whole, ...rest] = e.target.value
            .replace(/[^\d.]/g, '')
            .split('.')
          onChange(rest.length ? `${whole}.${rest.join('')}` : whole)
        }}
        {...rest}
      />
    </InputGroup>
  )
}

/** The unit is the product's own (set when the product was saved) — shown, not chosen. */
function UnitTag({ unit }: { unit?: string }) {
  const { t } = useLanguage()
  return (
    <span
      title={t('Unit comes from the product')}
      className='bg-muted text-muted-foreground inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium'
    >
      {unit && <Lock className='h-3 w-3 opacity-60' aria-hidden />}
      {unit || t('unit')}
    </span>
  )
}

/** The app date field with a leading icon, in the dialog's field style. */
function DateField({
  icon,
  value,
  onChange,
  ...rest
}: {
  icon: ReactNode
  value: string
  onChange: (value: string) => void
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  'data-field'?: string
}) {
  return (
    <div className='relative min-w-0'>
      <span className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 [&_svg]:h-4 [&_svg]:w-4'>
        {icon}
      </span>
      {/* The date field pads its own text by 0.75rem; pl-6 makes room for the icon. */}
      <Input
        type='date'
        className={cn(FIELD, 'pl-6')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </div>
  )
}

/** Pin a specific BOM version of a sub-assembly, or follow its default ("Auto"). */
function SubBomSelect({
  productId,
  value,
  onChange,
}: {
  productId: string
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useLanguage()
  const { data } = useGetBomsQuery(
    { productId, isActive: true, limit: 20 },
    { skip: !productId }
  )
  const boms = data?.results || []
  if (!productId || boms.length === 0) {
    return (
      <span className='text-muted-foreground px-1 text-xs'>
        {productId ? t('Stocked item') : '—'}
      </span>
    )
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn(FIELD, 'w-full')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO}>{t('Default BOM')}</SelectItem>
        {boms.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.bomNumber} · v{b.version}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
