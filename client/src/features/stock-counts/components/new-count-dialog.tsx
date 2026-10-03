import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import {
  useCreateStockCountMutation,
  useGetCountCategoriesQuery,
  type AbcClass,
  type CreateStockCountRequest,
  type StockCountPolicy,
  type StockCountType,
} from '@/stores/stockCount.api'
import { apiError, COUNT_TYPE_META } from '../lib/labels'
import { CategoryPicker } from './category-picker'
import { ClassBadge } from './count-badges'

interface NewCountDialogProps {
  type: StockCountType | null
  onOpenChange: (open: boolean) => void
  policy?: StockCountPolicy
}

/** Starts a surprise audit, an initial (opening) count or a custom count. */
export function NewCountDialog({ type, onOpenChange, policy }: NewCountDialogProps) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [createCount, { isLoading }] = useCreateStockCountMutation()
  // Its own fast query (not the slow cycle plan), fetched only while a dialog is open.
  const { data: categories = [], isLoading: categoriesLoading, isError: categoriesFailed, refetch } = useGetCountCategoriesQuery(undefined, { skip: !type })

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [blind, setBlind] = useState(true)
  const [classes, setClasses] = useState<AbcClass[]>([])
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [sampleSize, setSampleSize] = useState('20')
  const [includeZeroStock, setIncludeZeroStock] = useState(false)

  useEffect(() => {
    if (!type) return
    setTitle('')
    setNotes('')
    setClasses([])
    setCategoryIds([])
    setIncludeZeroStock(type === 'initial')
    setBlind(type === 'surprise' ? true : type === 'initial' ? false : (policy?.blindByDefault ?? true))
    setSampleSize(String(policy?.surpriseSampleSize ?? 20))
  }, [type, policy?.blindByDefault, policy?.surpriseSampleSize])

  if (!type) return null
  const meta = COUNT_TYPE_META[type]
  const Icon = meta.icon

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  const submit = async () => {
    const body: CreateStockCountRequest = {
      type,
      title: title.trim() || undefined,
      notes: notes.trim() || undefined,
      categoryIds: categoryIds.length ? categoryIds : undefined,
    }
    if (type !== 'surprise') body.blind = blind
    if (type === 'surprise') body.sampleSize = Math.max(1, Math.min(500, Number(sampleSize) || 20))
    if (type === 'custom') body.classes = classes.length ? classes : undefined
    if (type !== 'initial') body.includeZeroStock = includeZeroStock
    try {
      const count = await createCount(body).unwrap()
      if (count.skippedOpen > 0) {
        toast.info(t('{{n}} item(s) skipped — they are already on another open count').replace('{{n}}', String(count.skippedOpen)))
      }
      onOpenChange(false)
      navigate({ to: '/stock-counts/$countId', params: { countId: count.id } })
    } catch (err) {
      toast.error(apiError(err, t('Could not start the count')))
    }
  }

  return (
    <Dialog open={Boolean(type)} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg'>
        <DialogHeader className='shrink-0 border-b px-6 py-4 text-left'>
          <DialogTitle className='flex items-center gap-2'>
            <Icon className='size-4 text-primary' />
            {t(meta.label)}
          </DialogTitle>
          <DialogDescription>{t(meta.description)}</DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4'>
          {type === 'surprise' && (
            <div className='space-y-1.5'>
              <Label htmlFor='sc-sample'>{t('How many items to audit')}</Label>
              <Input
                id='sc-sample'
                type='number'
                inputMode='numeric'
                min={1}
                max={500}
                value={sampleSize}
                onChange={(e) => setSampleSize(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => e.key === 'Enter' && !isLoading && void submit()}
                showVoiceInput={false}
                className='w-32'
              />
              <p className='text-xs text-muted-foreground'>
                {t('Picked at random each time; A items are six times and B items three times as likely as C items.')}
              </p>
            </div>
          )}

          {type === 'custom' && (
            <div className='space-y-1.5'>
              <Label>{t('Classes')}</Label>
              <div className='flex gap-2'>
                {(['A', 'B', 'C'] as const).map((cls) => (
                  <button
                    key={cls}
                    type='button'
                    onClick={() => setClasses((list) => toggle(list, cls))}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                      classes.includes(cls) ? 'border-primary bg-primary/10' : 'hover:bg-accent'
                    )}
                    aria-pressed={classes.includes(cls)}
                  >
                    <ClassBadge cls={cls} />
                    {t('Class {{c}}').replace('{{c}}', cls)}
                  </button>
                ))}
              </div>
              <p className='text-xs text-muted-foreground'>{t('None selected = all classes.')}</p>
            </div>
          )}

          <CategoryPicker
            categories={categories}
            loading={categoriesLoading}
            failed={categoriesFailed}
            value={categoryIds}
            onChange={setCategoryIds}
            onRetry={refetch}
          />

          {type !== 'initial' && (
            <label className='flex items-center justify-between gap-3'>
              <span className='text-sm'>
                {t('Include items with zero stock')}
                <span className='block text-xs text-muted-foreground'>{t('Finds stock the system thinks is gone.')}</span>
              </span>
              <Switch checked={includeZeroStock} onCheckedChange={setIncludeZeroStock} />
            </label>
          )}

          {type === 'surprise' ? (
            <p className='flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>
              <EyeOff className='size-3.5 shrink-0' />
              {t('Surprise audits are always blind: counters never see the expected quantity.')}
            </p>
          ) : (
            <label className='flex items-center justify-between gap-3'>
              <span className='text-sm'>
                {t('Blind count')}
                <span className='block text-xs text-muted-foreground'>
                  {t('Hide the expected quantity from counters until the count is submitted — they count what is really there.')}
                </span>
              </span>
              <Switch checked={blind} onCheckedChange={setBlind} />
            </label>
          )}

          {type === 'initial' && (
            <p className='rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200'>
              {t(
                'Every product in this branch goes on the sheet. Items you don’t get to can be left unchanged or set to zero when you post, and you can enter a cost for items that have none.'
              )}
            </p>
          )}

          <div className='space-y-1.5'>
            <Label htmlFor='sc-title'>{t('Title (optional)')}</Label>
            <Input id='sc-title' showVoiceInput={false} onKeyDown={(e) => e.key === 'Enter' && !isLoading && void submit()} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(meta.label)} maxLength={120} />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='sc-notes'>{t('Notes (optional)')}</Label>
            <Textarea id='sc-notes' value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
          </div>
        </div>

        <DialogFooter className='shrink-0 gap-2 border-t px-6 py-3'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={isLoading}>
            {isLoading && <Loader2 className='mr-1 size-4 animate-spin' />}
            {t('Start count')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
