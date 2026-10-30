import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Switch } from '@/components/ui/switch'
import { fmtQty } from '../lib/constants'
import { MAX_REGISTER_PRODUCTS as MAX_PRODUCTS } from '../lib/product-register-state'
import { productLineName } from '../lib/report-doc'
import type {
  ProductProductionReport,
  ProductRegisterOption,
} from '../lib/report-types'

/*
 * Controls of the product-wise production register: the products (each its own register,
 * or added up as one product line) and the kg per pack used to weigh what was received.
 * All remembered in this browser.
 */

/** Products whose name starts with the same first words as `name` — the other pack sizes. */
const relatedTo = (name: string, options: ProductRegisterOption[]) => {
  const words = name.trim().split(/\s+/)
  if (words.length < 2) return []
  const stem = words
    .slice(0, Math.max(2, words.length - 1))
    .join(' ')
    .toLowerCase()
  return options.filter((o) => o.name.toLowerCase().startsWith(stem))
}

export function ProductRegisterControls({
  data,
  productIds,
  onProductIdsChange,
  packWeights,
  onPackWeightChange,
  combine,
  onCombineChange,
}: {
  data?: ProductProductionReport
  productIds: string[]
  onProductIdsChange: (ids: string[]) => void
  packWeights: Record<string, number>
  onPackWeightChange: (key: string, kg: number | null) => void
  combine: boolean
  onCombineChange: (value: boolean) => void
}) {
  const { t } = useLanguage()
  const options = useMemo(() => data?.options || [], [data])
  const byId = useMemo(
    () => new Map(options.map((o) => [o.productId, o])),
    [options]
  )
  const selectedNames = productIds.map((id) => byId.get(id)?.name || '')
  const combined = combine && productIds.length > 1
  const line = combined ? productLineName(selectedNames.filter(Boolean)) : ''

  // First visit: start with the product made most recently.
  useEffect(() => {
    if (!productIds.length && data?.needsProduct && options.length)
      onProductIdsChange([options[0].productId])
  }, [data, options, productIds.length, onProductIdsChange])

  const addable = options
    .filter((o) => !productIds.includes(o.productId))
    .map((o) => ({
      value: o.productId,
      label: o.name,
      sublabel: [
        o.sku,
        o.unit,
        `${o.orders} ${t(o.orders === 1 ? 'order' : 'orders')}`,
      ]
        .filter(Boolean)
        .join(' · '),
    }))
  const first = selectedNames[0]
  const related = first
    ? relatedTo(first, options).filter((o) => !productIds.includes(o.productId))
    : []
  const registers = data && !data.needsProduct ? data.registers : []
  // A pack size states its own content, so only other packs ask for a weight.
  const packs = registers.flatMap((r) =>
    r.packs.filter((p) => !p.byWeight && p.weightSource !== 'pack')
  )

  return (
    <div className='space-y-3 border-t pt-3'>
      <div className='flex flex-col gap-2 lg:flex-row lg:items-end'>
        <div className='min-w-0 flex-1 space-y-1'>
          <Label className='text-muted-foreground text-xs'>
            {t('Products')}
            {productIds.length > 1
              ? ` — ${combined ? t('added up as one product line') : t('each on its own register, one below the other')}`
              : ''}
          </Label>
          <div className='flex flex-wrap items-center gap-1.5'>
            {productIds.map((id) => {
              const name = byId.get(id)?.name || t('Product')
              const short =
                line &&
                name !== line &&
                name.toLowerCase().startsWith(line.toLowerCase())
                  ? name.slice(line.length).trim() || name
                  : name
              return (
                <span
                  key={id}
                  className='bg-muted inline-flex max-w-full items-center gap-1 rounded-md border py-1 pr-1 pl-2 text-sm'
                  title={name}
                >
                  <span className='truncate'>
                    {combined && line && short !== name ? (
                      <>
                        <span className='text-muted-foreground'>{line} · </span>
                        {short}
                      </>
                    ) : (
                      name
                    )}
                  </span>
                  <button
                    type='button'
                    aria-label={`${t('Remove')} ${name}`}
                    className='hover:bg-background text-muted-foreground hover:text-foreground rounded p-0.5'
                    onClick={() =>
                      onProductIdsChange(productIds.filter((p) => p !== id))
                    }
                  >
                    <X className='h-3.5 w-3.5' />
                  </button>
                </span>
              )
            })}
            {productIds.length < MAX_PRODUCTS && (
              <div className='w-full sm:w-72'>
                <SearchableSelect
                  options={addable}
                  value=''
                  onValueChange={(id) =>
                    id && onProductIdsChange([...productIds, id])
                  }
                  placeholder={
                    productIds.length
                      ? t('Add another product')
                      : t('Choose a product')
                  }
                  searchPlaceholder={t('Search product')}
                  emptyText={t('No other product has production orders.')}
                />
              </div>
            )}
          </div>
        </div>
        {related.length > 0 &&
          productIds.length + related.length <= MAX_PRODUCTS && (
            <Button
              variant='outline'
              size='sm'
              className='shrink-0'
              onClick={() =>
                onProductIdsChange([
                  ...productIds,
                  ...related.map((o) => o.productId),
                ])
              }
              title={related.map((o) => o.name).join(', ')}
            >
              <Plus className='h-4 w-4' />
              {t('Add related packs')} ({related.length})
            </Button>
          )}
      </div>

      {productIds.length > 1 && (
        <label className='flex items-center gap-2 text-sm'>
          <Switch checked={combine} onCheckedChange={onCombineChange} />
          <span>
            {t('Add up as one product line')}
            <span className='text-muted-foreground'>
              {' '}
              — {t('for pack sizes kept as separate products')}
            </span>
          </span>
        </label>
      )}

      {packs.length > 0 && (
        <div className='space-y-1.5'>
          <p className='text-muted-foreground text-xs'>
            {t(
              'kg per pack — used to weigh finished goods. Leave empty to use the product’s own unit conversion or recipe.'
            )}
          </p>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4'>
            {packs.map((p) => (
              <KgInput
                key={p.key}
                label={
                  line && p.name.toLowerCase().startsWith(line.toLowerCase())
                    ? p.name.slice(line.length).trim() || p.name
                    : p.name
                }
                per={p.unit}
                auto={p.weightSource === 'manual' ? null : p.kgPerUnit}
                typed={packWeights[p.key]}
                missing={p.kgPerUnit == null}
                onChange={(kg) => onPackWeightChange(p.key, kg)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function KgInput({
  label,
  per,
  auto,
  typed,
  missing,
  onChange,
}: {
  label: string
  per: string
  auto: number | null
  typed?: number
  missing: boolean
  onChange: (kg: number | null) => void
}) {
  const { t } = useLanguage()
  const [text, setText] = useState(typed ? String(typed) : '')
  useEffect(() => setText(typed ? String(typed) : ''), [typed])
  const commit = () => {
    const n = Number(text)
    onChange(text.trim() && Number.isFinite(n) && n > 0 ? n : null)
  }
  return (
    <label className='flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5'>
      <span className='min-w-0 flex-1 truncate text-sm' title={label}>
        {label}
        <span className='text-muted-foreground'> / {per}</span>
      </span>
      <Input
        inputMode='decimal'
        showVoiceInput={false}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder={auto != null ? fmtQty(auto) : t('kg?')}
        aria-invalid={missing && !typed}
        className='h-8 w-20 text-right'
      />
      <span className='text-muted-foreground text-xs'>kg</span>
    </label>
  )
}
