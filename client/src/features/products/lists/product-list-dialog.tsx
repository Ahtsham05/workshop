import { useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ColorSwatchPicker } from '@/components/color-swatch-picker'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import type { AppDispatch } from '@/stores/store'
import { fetchAllCategories } from '@/stores/category.slice'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  useCreateProductListMutation,
  useUpdateProductListMutation,
  type ProductListPurpose,
  type ProductListRuleType,
  type ProductListSummary,
} from '@/stores/productList.api'
import { PURPOSE_META, PURPOSE_ORDER, RULE_META } from './list-meta'

const NO_CATEGORY = 'all'

interface ProductListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing this list; omitted = create. */
  list?: ProductListSummary | null
  onSaved?: (list: ProductListSummary) => void
}

/** Create or edit a product list — a preset purpose, a name/colour, and (smart) its rule. */
export function ProductListDialog({ open, onOpenChange, list, onSaved }: ProductListDialogProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  // The whole catalogue's categories — the shared slice only holds the first 100.
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [createList, { isLoading: creating }] = useCreateProductListMutation()
  const [updateList, { isLoading: updating }] = useUpdateProductListMutation()
  const isEdit = !!list

  const [purpose, setPurpose] = useState<ProductListPurpose>('to_order')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<string | null>(PURPOSE_META.to_order.color)
  const [smart, setSmart] = useState(false)
  const [ruleType, setRuleType] = useState<ProductListRuleType>('top_stock_value')
  const [limit, setLimit] = useState('50')
  const [threshold, setThreshold] = useState('')
  const [categoryId, setCategoryId] = useState(NO_CATEGORY)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    if (!open) return
    if (list) {
      setPurpose(list.purpose)
      setName(list.name)
      setNameTouched(true)
      setDescription(list.description || '')
      setColor(list.color)
      setSmart(list.kind === 'smart')
      setRuleType(list.rule?.type || 'top_stock_value')
      setLimit(String(list.rule?.limit ?? 50))
      setThreshold(list.rule?.threshold != null ? String(list.rule.threshold) : '')
      setCategoryId(list.rule?.categoryId || NO_CATEGORY)
      setPinned(list.pinned)
    } else {
      pickPurpose('to_order', true)
      setDescription('')
      setLimit('50')
      setThreshold('')
      setCategoryId(NO_CATEGORY)
      setPinned(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list])

  // Choosing a purpose fills in its name/colour (until the name is typed by hand) and,
  // for "High value", switches to a smart list on stock value.
  function pickPurpose(next: ProductListPurpose, reset = false) {
    setPurpose(next)
    if (reset || !nameTouched) {
      setName(next === 'custom' ? '' : PURPOSE_META[next].label)
      if (reset) setNameTouched(false)
    }
    setColor(PURPOSE_META[next].color)
    setSmart(next === 'high_value')
    if (next === 'high_value') setRuleType('top_stock_value')
  }

  useEffect(() => {
    if (!open || !smart || categories.length) return
    dispatch(fetchAllCategories({}))
      .unwrap()
      .then((data: { results?: { id?: string; _id?: string; name: string }[] } | { id?: string; _id?: string; name: string }[]) => {
        const rows = Array.isArray(data) ? data : data?.results || []
        setCategories(rows.map((c) => ({ id: String(c.id || c._id), name: c.name })))
      })
      .catch(() => {})
  }, [open, smart, categories.length, dispatch])

  const categoryOptions = useMemo(
    () => [
      { value: NO_CATEGORY, label: t('All categories') },
      ...[...categories].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories, t],
  )

  const saving = creating || updating
  const canSave = name.trim().length > 0 && !saving

  const handleSave = async () => {
    if (!canSave) return
    const body = {
      name: name.trim(),
      description: description.trim(),
      purpose,
      color,
      pinned,
      kind: smart ? ('smart' as const) : ('manual' as const),
      rule: smart
        ? {
            type: ruleType,
            limit: Math.min(1000, Math.max(1, parseInt(limit, 10) || 50)),
            threshold: RULE_META[ruleType].usesThreshold && threshold.trim() !== '' ? Number(threshold) : null,
            categoryId: categoryId === NO_CATEGORY ? null : categoryId,
          }
        : null,
    }
    try {
      const saved = isEdit && list ? await updateList({ id: list.id, ...body }).unwrap() : await createList(body).unwrap()
      toast.success(isEdit ? t('List updated') : t('List "{{name}}" created', { name: saved.name }))
      onSaved?.(saved)
      onOpenChange(false)
    } catch (err) {
      toast.error((err as { data?: { message?: string } })?.data?.message || t('Could not save the list'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Header and footer stay put; only the form between them scrolls. */}
      <DialogContent className='flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-xl'>
        <DialogHeader className='shrink-0 border-b px-6 pb-4 pt-6 pr-12 text-left'>
          <DialogTitle>{isEdit ? t('Edit list') : t('New product list')}</DialogTitle>
          <DialogDescription>
            {t('Group products into lists like “To order” or “Online” — or let a smart list fill itself from a rule.')}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4'>
          <div className='space-y-1.5'>
            <Label>{t('What is this list for?')}</Label>
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
              {PURPOSE_ORDER.map((p) => {
                const meta = PURPOSE_META[p]
                const Icon = meta.icon
                const active = purpose === p
                return (
                  <button
                    key={p}
                    type='button'
                    onClick={() => pickPurpose(p)}
                    aria-pressed={active}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent',
                      active && 'border-primary bg-primary/5 ring-1 ring-primary',
                    )}
                  >
                    <span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md' style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>
                      <Icon className='h-4 w-4' />
                    </span>
                    <span className='min-w-0'>
                      <span className='block text-sm font-medium'>{t(meta.label)}</span>
                      <span className='block text-xs text-muted-foreground'>{t(meta.hint)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='list-name'>{t('Name')}</Label>
            <Input
              id='list-name'
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value)
                setNameTouched(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleSave()
                }
              }}
              placeholder={t('e.g. Eid stock, Clearance, Website')}
            />
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Colour')}</Label>
            <ColorSwatchPicker value={color} onChange={setColor} clearable />
          </div>

          <div className='space-y-1.5'>
            <Label htmlFor='list-description'>
              {t('Notes')} <span className='text-muted-foreground'>({t('optional')})</span>
            </Label>
            <Textarea id='list-description' rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className='rounded-lg border p-3'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <p className='flex items-center gap-1.5 text-sm font-medium'>
                  <Sparkles className='h-4 w-4 text-amber-500' />
                  {t('Smart list')}
                </p>
                <p className='text-xs text-muted-foreground'>{t('Fills itself from a rule and is always up to date — no adding by hand.')}</p>
              </div>
              <Switch checked={smart} onCheckedChange={setSmart} aria-label={t('Smart list')} />
            </div>
            {smart && (
              <div className='mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2'>
                <div className='space-y-1.5 sm:col-span-2'>
                  <Label>{t('Rule')}</Label>
                  <Select value={ruleType} onValueChange={(v) => setRuleType(v as ProductListRuleType)}>
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(RULE_META) as ProductListRuleType[]).map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(RULE_META[type].label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>{t(RULE_META[ruleType].hint)}</p>
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='list-limit'>{t('Show at most')}</Label>
                  <Input id='list-limit' type='number' min={1} max={1000} value={limit} onChange={(e) => setLimit(e.target.value)} />
                </div>
                {RULE_META[ruleType].usesThreshold && (
                  <div className='space-y-1.5'>
                    <Label htmlFor='list-threshold'>{t('Low stock at or below')}</Label>
                    <Input id='list-threshold' type='number' min={0} value={threshold} placeholder='10' onChange={(e) => setThreshold(e.target.value)} />
                  </div>
                )}
                <div className='space-y-1.5 sm:col-span-2'>
                  <Label>{t('Only in category')}</Label>
                  <SearchableSelect
                    options={categoryOptions}
                    value={categoryId}
                    onValueChange={(v) => setCategoryId(v || NO_CATEGORY)}
                    placeholder={t('All categories')}
                    searchPlaceholder={t('Search categories...')}
                    emptyText={t('No categories found')}
                    className='w-full'
                  />
                </div>
              </div>
            )}
          </div>

          <label className='flex items-center gap-2 text-sm'>
            <Switch checked={pinned} onCheckedChange={setPinned} />
            {t('Pin to the front')}
          </label>
        </div>

        <DialogFooter className='shrink-0 border-t px-6 py-3'>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {isEdit ? t('Save') : t('Create list')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
