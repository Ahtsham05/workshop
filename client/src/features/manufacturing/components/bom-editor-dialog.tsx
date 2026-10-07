import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Plus,
  Replace,
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
import { getAllUnits } from '@/lib/units'
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
import { ProductPicker } from './product-picker'

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
let keySeq = 0
const nextKey = () => `line-${++keySeq}`

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

const toDateInput = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : ''

export type BomEditorMode = 'create' | 'edit' | 'version'

/**
 * Create a BOM, edit an unlocked version, or branch a new version off an existing one.
 * Components always reference the branch's existing products.
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
  const units = useMemo(() => getAllUnits(), [])
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
  const [lines, setLines] = useState<LineDraft[]>(() => toDraft(bom))

  const [createBom, { isLoading: creating }] = useCreateBomMutation()
  const [updateBom, { isLoading: updating }] = useUpdateBomMutation()
  const [createVersion, { isLoading: versioning }] =
    useCreateBomVersionMutation()
  const busy = creating || updating || versioning

  const patchLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    )

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      {
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
      },
    ])

  const title =
    mode === 'create'
      ? t('New Bill of Materials')
      : mode === 'edit'
        ? `${t('Edit')} ${bom?.bomNumber} · v${bom?.version}`
        : `${t('New version of')} ${bom?.bomNumber}`

  const submit = async () => {
    if (!product) return toast.error(t('Choose the product this BOM builds'))
    const valid = lines.filter((l) => l.productId)
    if (!valid.length) return toast.error(t('Add at least one component'))
    if (valid.some((l) => !(Number(l.quantity) > 0)))
      return toast.error(t('Every component needs a quantity above zero'))

    const body: BomInput = {
      name: name.trim(),
      quantity: Number(quantity) || 1,
      unit,
      notes,
      effectiveFrom: effectiveFrom || null,
      effectiveTo: effectiveTo || null,
      components: valid.map((l, index) => ({
        ...(mode === 'edit' && l._id ? { _id: l._id } : {}),
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
          .map((a) => ({
            productId: a.productId,
            ratio: Number(a.ratio) || 1,
          })),
      })),
    }
    try {
      let saved: Bom
      if (mode === 'create')
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-5xl'>
        <DialogHeader className='border-b px-6 py-4'>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === 'version'
              ? t(
                  'The current version stays untouched — orders already released keep using it.'
                )
              : t(
                  'Define what goes into one batch of this product. Sub-assemblies with their own BOM expand automatically.'
                )}
          </DialogDescription>
        </DialogHeader>

        <div className='flex-1 space-y-6 overflow-y-auto px-6 py-5'>
          <section className='grid gap-4 md:grid-cols-12'>
            <div className='grid gap-1.5 md:col-span-5'>
              <Label>{t('Product to build')}</Label>
              <ProductPicker
                value={product}
                onChange={(p) => {
                  setProduct(p)
                  setUnit(p.unit)
                }}
                disabled={mode !== 'create'}
              />
            </div>
            <div className='grid gap-1.5 md:col-span-4'>
              <Label>{t('BOM name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('Defaults to the product name')}
              />
            </div>
            <div className='grid gap-1.5 md:col-span-2'>
              <Label>{t('Output qty')}</Label>
              <Input
                type='number'
                min={0}
                step='any'
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className='grid gap-1.5 md:col-span-1'>
              <Label>{t('Unit')}</Label>
              <UnitSelect value={unit} onChange={setUnit} units={units} />
            </div>
            <div className='grid gap-1.5 md:col-span-3'>
              <Label>{t('Effective from')}</Label>
              <Input
                type='date'
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            <div className='grid gap-1.5 md:col-span-3'>
              <Label>{t('Effective to')}</Label>
              <Input
                type='date'
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
              />
            </div>
            <div className='flex items-end gap-3 pb-2 md:col-span-6'>
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

          <section className='space-y-2'>
            <div className='flex items-center justify-between'>
              <h3 className='text-sm font-semibold'>
                {t('Components')}{' '}
                <span className='text-muted-foreground font-normal'>
                  ({lines.filter((l) => l.productId).length})
                </span>
              </h3>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={addLine}
              >
                <Plus className='mr-1.5 h-3.5 w-3.5' />
                {t('Add component')}
              </Button>
            </div>

            <div className='overflow-hidden rounded-xl border'>
              <div className='bg-muted/40 text-muted-foreground hidden grid-cols-[1.5rem_minmax(0,3fr)_6rem_6rem_5rem_minmax(0,2fr)_4.5rem_2rem] gap-2 border-b px-3 py-2 text-xs font-medium md:grid'>
                <span />
                <span>{t('Component')}</span>
                <span>{t('Qty')}</span>
                <span>{t('Unit')}</span>
                <span>{t('Scrap %')}</span>
                <span>{t('Sub-BOM')}</span>
                <span>{t('Optional')}</span>
                <span />
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
              {lines.map((line) => (
                <div key={line.key} className='border-b last:border-b-0'>
                  <div className='grid grid-cols-2 items-center gap-2 px-3 py-2 md:grid-cols-[1.5rem_minmax(0,3fr)_6rem_6rem_5rem_minmax(0,2fr)_4.5rem_2rem]'>
                    <button
                      type='button'
                      className='text-muted-foreground hover:bg-muted hidden h-6 w-6 items-center justify-center rounded md:flex'
                      onClick={() =>
                        patchLine(line.key, { expanded: !line.expanded })
                      }
                      aria-label={t('Alternatives & notes')}
                    >
                      {line.expanded ? (
                        <ChevronDown className='h-4 w-4' />
                      ) : (
                        <ChevronRight className='h-4 w-4' />
                      )}
                    </button>
                    <div className='col-span-2 md:col-span-1'>
                      <ProductPicker
                        value={
                          line.productId
                            ? { id: line.productId, name: line.productName }
                            : null
                        }
                        excludeIds={product ? [product.id] : []}
                        onChange={(p) =>
                          patchLine(line.key, {
                            productId: p.id,
                            productName: p.name,
                            unit: p.unit,
                            childBomId: AUTO,
                          })
                        }
                      />
                    </div>
                    <Input
                      type='number'
                      min={0}
                      step='any'
                      value={line.quantity}
                      onChange={(e) =>
                        patchLine(line.key, { quantity: e.target.value })
                      }
                      aria-label={t('Qty')}
                    />
                    <UnitSelect
                      value={line.unit}
                      onChange={(u) => patchLine(line.key, { unit: u })}
                      units={units}
                    />
                    <Input
                      type='number'
                      min={0}
                      max={100}
                      step='any'
                      value={line.scrapPercent}
                      onChange={(e) =>
                        patchLine(line.key, { scrapPercent: e.target.value })
                      }
                      aria-label={t('Scrap %')}
                    />
                    <SubBomSelect
                      productId={line.productId}
                      value={line.childBomId}
                      onChange={(v) => patchLine(line.key, { childBomId: v })}
                    />
                    <label className='flex items-center gap-2 text-xs md:justify-center'>
                      <Checkbox
                        checked={line.isOptional}
                        onCheckedChange={(v) =>
                          patchLine(line.key, { isOptional: !!v })
                        }
                      />
                      <span className='md:hidden'>{t('Optional')}</span>
                    </label>
                    <div className='flex justify-end gap-1'>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='h-8 w-8 md:hidden'
                        onClick={() =>
                          patchLine(line.key, { expanded: !line.expanded })
                        }
                      >
                        <Replace className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='text-muted-foreground hover:text-destructive h-8 w-8'
                        onClick={() =>
                          setLines((prev) =>
                            prev.filter((l) => l.key !== line.key)
                          )
                        }
                        aria-label={t('Remove')}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </div>
                  </div>
                  {line.expanded && (
                    <div className='bg-muted/30 grid gap-3 px-3 py-3 md:grid-cols-2 md:pl-11'>
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
                              patchLine(line.key, {
                                alternatives: [
                                  ...line.alternatives,
                                  {
                                    productId: '',
                                    productName: '',
                                    ratio: '1',
                                  },
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
                            {t(
                              'Substitutes that may be issued instead of this component.'
                            )}
                          </p>
                        )}
                        {line.alternatives.map((alt, i) => (
                          <div
                            key={i}
                            className='grid grid-cols-[minmax(0,1fr)_5.5rem_2rem] items-center gap-2'
                          >
                            <ProductPicker
                              value={
                                alt.productId
                                  ? { id: alt.productId, name: alt.productName }
                                  : null
                              }
                              excludeIds={[
                                line.productId,
                                ...(product ? [product.id] : []),
                              ]}
                              onChange={(p) =>
                                patchLine(line.key, {
                                  alternatives: line.alternatives.map((a, j) =>
                                    j === i
                                      ? {
                                          ...a,
                                          productId: p.id,
                                          productName: p.name,
                                        }
                                      : a
                                  ),
                                })
                              }
                            />
                            <Input
                              type='number'
                              min={0}
                              step='any'
                              value={alt.ratio}
                              title={t(
                                'Units of the alternative that replace one unit of the component'
                              )}
                              onChange={(e) =>
                                patchLine(line.key, {
                                  alternatives: line.alternatives.map((a, j) =>
                                    j === i
                                      ? { ...a, ratio: e.target.value }
                                      : a
                                  ),
                                })
                              }
                            />
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon'
                              className='h-8 w-8'
                              onClick={() =>
                                patchLine(line.key, {
                                  alternatives: line.alternatives.filter(
                                    (_, j) => j !== i
                                  ),
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
                          onChange={(e) =>
                            patchLine(line.key, { notes: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className='grid gap-1.5'>
            <Label>{t('Notes')}</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('Process notes, revision reason…')}
            />
          </section>
        </div>

        <DialogFooter className='border-t px-6 py-3'>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {mode === 'version' ? <GitBranch className='mr-2 h-4 w-4' /> : null}
            {mode === 'version' ? t('Create version') : t('Save BOM')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UnitSelect({
  value,
  onChange,
  units,
}: {
  value: string
  onChange: (v: string) => void
  units: { value: string; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className='h-9 px-2'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className='max-h-72'>
        {units.map((u) => (
          <SelectItem key={u.value} value={u.value}>
            {u.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      <SelectTrigger className='h-9'>
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
