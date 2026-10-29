import { useEffect, useMemo, useState } from 'react'
import {
  Boxes,
  Loader2,
  Package,
  PackagePlus,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useCreatePackProductMutation,
  useGetPackingSetupQuery,
  useSavePackSizesMutation,
  type PackingSetup,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { fmtQty } from '../lib/constants'
import { packInner } from '../lib/packing-math'
import { ProductPicker } from './product-picker'

/*
 * Pack sizes of a bulk finished good — how it leaves the factory. The BOM makes the bulk
 * (e.g. Vito Mineral T by the kg); each pack size turns it into a sellable pack product:
 *   Carton 20 × 1 KG  → 20 kg a carton, uses 20 pouches + 1 carton box
 *   5 KG Bag          → 5 kg a bag, uses 1 bag
 * The list is edited as a whole and saved in one go.
 */

interface Draft {
  key: string
  id: string | null
  name: string
  packProduct: { id: string; name: string } | null
  contentQuantity: number | null
  innerCount: number | null
  innerName: string
  isActive: boolean
  materials: {
    key: string
    product: { id: string; name: string; unit?: string } | null
    quantity: number | null
  }[]
}

let seq = 0
const nextKey = () => `k${(seq += 1)}`

const fromSetup = (setup: PackingSetup): Draft[] =>
  setup.sizes.map((s) => ({
    key: nextKey(),
    id: s.id,
    name: s.name,
    packProduct: { id: s.packProduct.id, name: s.packProduct.name },
    contentQuantity: s.contentQuantity,
    innerCount: s.innerCount > 1 ? s.innerCount : null,
    innerName: s.innerName,
    isActive: s.isActive,
    materials: s.materials.map((m) => ({
      key: nextKey(),
      product: { id: m.id, name: m.name, unit: m.unit },
      quantity: m.quantity,
    })),
  }))

/** Quick starts for a product sold by weight. */
const PRESETS: {
  name: string
  content: number
  innerCount?: number
  innerName?: string
}[] = [
  { name: '1 KG Pack', content: 1 },
  { name: '5 KG Bag', content: 5 },
  { name: '20 KG Bag', content: 20 },
  { name: '25 KG Bag', content: 25 },
  { name: '50 KG Bag', content: 50 },
  {
    name: 'Carton 20 × 1 KG',
    content: 20,
    innerCount: 20,
    innerName: '1 KG pack',
  },
  { name: 'Bag 4 × 5 KG', content: 20, innerCount: 4, innerName: '5 KG bag' },
]

export function PackSizesSheet({
  productId,
  variantId,
  onClose,
}: {
  productId: string
  /** The bulk variant (from a production order), for a product with variants. */
  variantId?: string | null
  onClose: () => void
}) {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission('manageBoms') || hasPermission('editProducts')
  const canCreateProduct = hasPermission('createProducts')
  const { data: setup, isLoading } = useGetPackingSetupQuery({
    productId,
    variantId,
  })
  const [save, { isLoading: saving }] = useSavePackSizesMutation()
  const [createPackProduct] = useCreatePackProductMutation()
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [creating, setCreating] = useState<string | null>(null)

  useEffect(() => {
    if (setup && drafts === null) setDrafts(fromSetup(setup))
  }, [setup, drafts])

  const bulk = setup?.product
  const unit = bulk ? getUnitLabel(bulk.unit) : ''
  const list = drafts || []
  const dirty = useMemo(
    () =>
      !!setup &&
      drafts !== null &&
      JSON.stringify(fromSetupComparable(drafts)) !==
        JSON.stringify(fromSetupComparable(fromSetup(setup))),
    [setup, drafts]
  )

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((d) =>
      (d || []).map((x) => (x.key === key ? { ...x, ...patch } : x))
    )
  const add = (preset?: (typeof PRESETS)[number]) =>
    setDrafts((d) => [
      ...(d || []),
      {
        key: nextKey(),
        id: null,
        name: preset ? preset.name : '',
        packProduct: null,
        contentQuantity: preset ? preset.content : null,
        innerCount: preset?.innerCount ?? null,
        innerName: preset?.innerName ?? '',
        isActive: true,
        materials: [],
      },
    ])

  const quickCreate = async (d: Draft) => {
    if (!bulk) return
    const name = `${bulk.name} ${d.name}`.trim()
    setCreating(d.key)
    try {
      const unitGuess = /carton/i.test(d.name)
        ? 'carton'
        : /bag/i.test(d.name)
          ? 'bag'
          : /box/i.test(d.name)
            ? 'box'
            : 'pack'
      const p = await createPackProduct({
        productId,
        name,
        unit: unitGuess,
      }).unwrap()
      update(d.key, { packProduct: { id: p.id, name: p.name } })
      toast.success(`${t('Created')} ${p.name}`)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not create the product')))
    } finally {
      setCreating(null)
    }
  }

  const problems = list.flatMap((d, i) => {
    const label = d.name || `${t('Pack size')} ${i + 1}`
    return [
      !d.name.trim() && `${label}: ${t('enter a name')}`,
      !d.packProduct && `${label}: ${t('choose or create the pack product')}`,
      !(Number(d.contentQuantity) > 0) &&
        `${label}: ${t('enter how much goes into one pack')}`,
      d.materials.some((m) => !m.product || !(Number(m.quantity) > 0)) &&
        `${label}: ${t('complete or remove the packing material rows')}`,
    ].filter(Boolean) as string[]
  })

  const submit = async () => {
    if (!drafts || problems.length || saving) return
    try {
      const result = await save({
        productId,
        sizes: drafts.map((d) => ({
          id: d.id,
          name: d.name.trim(),
          packProductId: d.packProduct!.id,
          contentQuantity: Number(d.contentQuantity),
          innerCount: Number(d.innerCount) > 1 ? Number(d.innerCount) : 1,
          innerName: d.innerName.trim(),
          isActive: d.isActive,
          materials: d.materials.map((m) => ({
            productId: m.product!.id,
            quantity: Number(m.quantity),
          })),
        })),
      }).unwrap()
      setDrafts(fromSetup(result))
      toast.success(t('Pack sizes saved'))
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not save the pack sizes')))
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className='flex w-full flex-col gap-0 sm:max-w-2xl'
        onKeyDown={(e) => {
          if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void submit()
          }
        }}
      >
        <SheetHeader className='border-b px-5 py-4'>
          <SheetTitle className='flex items-center gap-2'>
            <Boxes className='h-4 w-4' />
            {t('Pack sizes')}
            {bulk && (
              <span className='text-muted-foreground truncate font-normal'>
                — {bulk.name}
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            {t(
              'How this product leaves the factory once a batch is made. Each pack size is its own product with its own stock and price; packing uses up the bulk and the packing material.'
            )}
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 space-y-4 overflow-y-auto px-5 py-4'>
          {isLoading || !bulk ? (
            <div className='space-y-3'>
              <Skeleton className='h-28 w-full' />
              <Skeleton className='h-28 w-full' />
            </div>
          ) : !bulk.canSetUp ? (
            <p className='text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm'>
              {bulk.problem ||
                t('Products with serial numbers cannot be packed.')}
            </p>
          ) : (
            <>
              <div className='bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-sm'>
                <span>
                  {t('Bulk in stock')}:{' '}
                  <span className='font-semibold tabular-nums'>
                    {fmtQty(bulk.available)} {unit}
                  </span>
                </span>
                {bulk.tracking.trackBatch && (
                  <span className='text-muted-foreground text-xs'>
                    {t('Packs keep the production batch number')}
                  </span>
                )}
              </div>

              {list.length === 0 && (
                <p className='text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm'>
                  {t(
                    'No pack sizes yet — add one below, or start from a common size.'
                  )}
                </p>
              )}

              {list.map((d, index) => (
                <div
                  key={d.key}
                  className={cn(
                    'space-y-3 rounded-xl border p-3',
                    !d.isActive && 'opacity-60'
                  )}
                >
                  <div className='flex items-center gap-2'>
                    <span className='bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold'>
                      {index + 1}
                    </span>
                    <Input
                      value={d.name}
                      onChange={(e) => update(d.key, { name: e.target.value })}
                      placeholder={t('Name, e.g. Carton 20 × 1 KG')}
                      aria-label={t('Pack size name')}
                      className='h-9 font-medium'
                      disabled={!canEdit}
                    />
                    <label className='flex shrink-0 items-center gap-1.5 text-xs'>
                      <Switch
                        checked={d.isActive}
                        onCheckedChange={(on) =>
                          update(d.key, { isActive: on })
                        }
                        disabled={!canEdit}
                        aria-label={t('In use')}
                      />
                      <span className='hidden sm:inline'>{t('In use')}</span>
                    </label>
                    {canEdit && (
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-8 w-8 shrink-0'
                        aria-label={t('Remove pack size')}
                        onClick={() =>
                          setDrafts((x) =>
                            (x || []).filter((y) => y.key !== d.key)
                          )
                        }
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    )}
                  </div>

                  <div className='grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]'>
                    <div className='min-w-0 space-y-1'>
                      <Label className='text-muted-foreground text-xs'>
                        {t('Stocked and sold as')}
                      </Label>
                      <div className='flex gap-2'>
                        <div className='min-w-0 flex-1'>
                          <ProductPicker
                            value={d.packProduct}
                            onChange={(p) =>
                              update(d.key, {
                                packProduct: { id: p.id, name: p.name },
                              })
                            }
                            productType='finished_good,by_product'
                            packRole='pack'
                            createAs='finished_good'
                            excludeIds={[bulk.id]}
                            placeholder={t('Pick the pack product…')}
                            searchPlaceholder={t('Search finished goods & by-products…')}
                            icon={
                              <Package className='text-muted-foreground h-4 w-4' />
                            }
                            disabled={!canEdit}
                          />
                        </div>
                        {!d.packProduct && canCreateProduct && canEdit && (
                          <Button
                            variant='outline'
                            size='sm'
                            className='h-9 shrink-0'
                            disabled={!d.name.trim() || creating === d.key}
                            onClick={() => quickCreate(d)}
                            title={
                              d.name.trim()
                                ? `${t('Create')} “${bulk.name} ${d.name.trim()}”`
                                : t('Enter the name first')
                            }
                          >
                            {creating === d.key ? (
                              <Loader2 className='h-4 w-4 animate-spin' />
                            ) : (
                              <PackagePlus className='h-4 w-4' />
                            )}
                            <span className='hidden sm:inline'>
                              {t('New product')}
                            </span>
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className='space-y-1'>
                      <Label className='text-muted-foreground text-xs'>
                        {t('One pack holds')}
                      </Label>
                      <div className='flex items-center gap-1.5'>
                        <Input
                          inputMode='decimal'
                          showVoiceInput={false}
                          value={d.contentQuantity ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d.]/g, '')
                            update(d.key, {
                              contentQuantity: v === '' ? null : Number(v),
                            })
                          }}
                          className='h-9 w-24 text-right tabular-nums'
                          aria-label={t('One pack holds')}
                          disabled={!canEdit}
                        />
                        <span className='text-muted-foreground text-sm'>
                          {unit}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className='space-y-1'>
                    <Label className='text-muted-foreground text-xs'>
                      {t('Inside (optional) — e.g. 20 × 1 KG pack')}
                    </Label>
                    <div className='flex items-center gap-1.5'>
                      <Input
                        inputMode='numeric'
                        showVoiceInput={false}
                        value={d.innerCount ?? ''}
                        placeholder='1'
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d]/g, '')
                          update(d.key, {
                            innerCount: v === '' ? null : Number(v),
                          })
                        }}
                        className='h-9 w-16 text-right tabular-nums'
                        aria-label={t('How many inside')}
                        disabled={!canEdit}
                      />
                      <X className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
                      <Input
                        value={d.innerName}
                        onChange={(e) =>
                          update(d.key, { innerName: e.target.value })
                        }
                        placeholder={t('1 KG pack')}
                        className='h-9'
                        aria-label={t('Inner pack name')}
                        disabled={!canEdit}
                      />
                    </div>
                  </div>

                  <div className='space-y-1.5'>
                    <Label className='text-muted-foreground text-xs'>
                      {t('Packing material per pack')}
                    </Label>
                    <p className='text-muted-foreground text-xs'>
                      {t(
                        'Only products classified as Packaging Material are listed (cartons, bags, pouches, labels). Classify them on Products, or add a new one from the picker.'
                      )}
                    </p>
                    {d.materials.map((m) => (
                      <div key={m.key} className='flex items-center gap-2'>
                        <div className='min-w-0 flex-1'>
                          <ProductPicker
                            value={m.product}
                            onChange={(p) =>
                              update(d.key, {
                                materials: d.materials.map((x) =>
                                  x.key === m.key
                                    ? {
                                        ...x,
                                        product: {
                                          id: p.id,
                                          name: p.name,
                                          unit: p.unit,
                                        },
                                      }
                                    : x
                                ),
                              })
                            }
                            productType='packaging_material'
                            createAs='packaging_material'
                            excludeIds={[
                              bulk.id,
                              ...(d.packProduct ? [d.packProduct.id] : []),
                            ]}
                            placeholder={t('Carton box, bag, pouch, label…')}
                            disabled={!canEdit}
                          />
                        </div>
                        <Input
                          inputMode='decimal'
                          showVoiceInput={false}
                          value={m.quantity ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d.]/g, '')
                            update(d.key, {
                              materials: d.materials.map((x) =>
                                x.key === m.key
                                  ? {
                                      ...x,
                                      quantity: v === '' ? null : Number(v),
                                    }
                                  : x
                              ),
                            })
                          }}
                          className='h-9 w-20 text-right tabular-nums'
                          aria-label={t('Quantity per pack')}
                          disabled={!canEdit}
                        />
                        <span className='text-muted-foreground w-10 truncate text-xs'>
                          {m.product?.unit ? getUnitLabel(m.product.unit) : ''}
                        </span>
                        {canEdit && (
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 shrink-0'
                            aria-label={t('Remove packing material')}
                            onClick={() =>
                              update(d.key, {
                                materials: d.materials.filter(
                                  (x) => x.key !== m.key
                                ),
                              })
                            }
                          >
                            <X className='h-4 w-4' />
                          </Button>
                        )}
                      </div>
                    ))}
                    {canEdit && (
                      <Button
                        variant='ghost'
                        size='sm'
                        className='text-muted-foreground h-8 px-2'
                        onClick={() =>
                          update(d.key, {
                            materials: [
                              ...d.materials,
                              {
                                key: nextKey(),
                                product: null,
                                quantity: d.innerCount || 1,
                              },
                            ],
                          })
                        }
                      >
                        <Plus className='h-3.5 w-3.5' />
                        {t('Add packing material')}
                      </Button>
                    )}
                  </div>

                  {Number(d.contentQuantity) > 0 && (
                    <p className='text-muted-foreground border-t pt-2 text-xs'>
                      {t('1 pack')} = {fmtQty(Number(d.contentQuantity))} {unit}{' '}
                      {t('of')} {bulk.name}
                      {packInner({
                        innerCount: Number(d.innerCount) || 1,
                        innerName: d.innerName,
                      })
                        ? ` (${packInner({ innerCount: Number(d.innerCount) || 1, innerName: d.innerName })})`
                        : ''}
                      {d.materials.filter((m) => m.product).length
                        ? ` + ${d.materials
                            .filter((m) => m.product)
                            .map(
                              (m) =>
                                `${fmtQty(Number(m.quantity) || 0)} ${m.product!.name}`
                            )
                            .join(', ')}`
                        : ''}
                    </p>
                  )}
                </div>
              ))}

              {canEdit && (
                <div className='space-y-2'>
                  <Button variant='outline' size='sm' onClick={() => add()}>
                    <Plus className='h-4 w-4' />
                    {t('Add pack size')}
                  </Button>
                  {['kg', 'g', 'ton'].includes(bulk.unit) && (
                    <div className='flex flex-wrap gap-1.5'>
                      <span className='text-muted-foreground self-center text-xs'>
                        {t('Common sizes')}:
                      </span>
                      {PRESETS.filter(
                        (p) => !list.some((d) => d.name === p.name)
                      ).map((p) => (
                        <button
                          key={p.name}
                          type='button'
                          onClick={() => add(p)}
                          className='hover:border-foreground/40 rounded-full border px-2.5 py-0.5 text-xs'
                        >
                          + {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {problems.length > 0 && dirty && (
          <ul className='max-h-24 space-y-0.5 overflow-y-auto border-t bg-rose-500/5 px-5 py-2 text-xs text-rose-700 dark:text-rose-400'>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className='bg-muted/30 flex items-center justify-end gap-2 border-t px-5 py-3'>
          <Button variant='outline' onClick={onClose}>
            {dirty ? t('Discard') : t('Close')}
          </Button>
          {canEdit && (
            <Button
              onClick={submit}
              disabled={!dirty || problems.length > 0 || saving}
              title='Ctrl+S'
            >
              {saving ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <Save className='h-4 w-4' />
              )}
              {t('Save pack sizes')}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Drafts without their throwaway keys — to tell whether anything changed. */
function fromSetupComparable(drafts: Draft[]) {
  return drafts.map(({ key: _key, materials, ...d }) => ({
    ...d,
    materials: materials.map(({ key: _k, ...m }) => ({
      id: m.product?.id,
      q: m.quantity,
    })),
  }))
}
