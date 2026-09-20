import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, Code2, FlaskConical, Globe, Pencil, Plus, Sparkles, Store, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { EntityFormSection } from '@/components/entity-form-section'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import {
  useGetAllSourcesQuery,
  useCreateSourceMutation,
  useUpdateSourceMutation,
  useDeleteSourceMutation,
  useTestSourceMutation,
  useAutoDetectSelectorsMutation,
  type PriceCheckerSource,
} from '@/stores/priceChecker.api'

const sourceFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  searchUrlTemplate: z
    .string()
    .min(1, 'Search URL is required')
    .refine((v) => v.includes('{query}'), 'Must contain the {query} placeholder'),
  priceSelector: z.string().min(1, 'Price selector is required'),
  titleSelector: z.string().optional(),
  imageSelector: z.string().optional(),
  linkSelector: z.string().optional(),
  isActive: z.boolean(),
})

type SourceFormValues = z.infer<typeof sourceFormSchema>

const emptyValues: SourceFormValues = {
  name: '',
  searchUrlTemplate: '',
  priceSelector: '',
  titleSelector: '',
  imageSelector: '',
  linkSelector: '',
  isActive: true,
}

interface ManageSourcesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManageSourcesDialog({ open, onOpenChange }: ManageSourcesDialogProps) {
  const { t } = useLanguage()
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editingSource, setEditingSource] = useState<PriceCheckerSource | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PriceCheckerSource | null>(null)

  const { data: sources = [], isFetching } = useGetAllSourcesQuery(undefined, { skip: !open })
  const [createSource, { isLoading: isCreating }] = useCreateSourceMutation()
  const [updateSource, { isLoading: isUpdating }] = useUpdateSourceMutation()
  const [deleteSource, { isLoading: isDeleting }] = useDeleteSourceMutation()

  useEffect(() => {
    if (!open) {
      setView('list')
      setEditingSource(null)
      setDeleteTarget(null)
    }
  }, [open])

  const openCreateForm = () => {
    setEditingSource(null)
    setView('form')
  }
  const openEditForm = (source: PriceCheckerSource) => {
    setEditingSource(source)
    setView('form')
  }
  const backToList = () => {
    setEditingSource(null)
    setView('list')
  }

  const handleSave = async (values: SourceFormValues) => {
    try {
      if (editingSource) {
        const id = editingSource._id || editingSource.id || ''
        await updateSource({ sourceId: id, body: values }).unwrap()
        toast.success(t(`"${values.name}" updated`))
      } else {
        await createSource(values).unwrap()
        toast.success(t(`"${values.name}" added`))
      }
      backToList()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t('Failed to save this competitor site')))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteSource(deleteTarget._id || deleteTarget.id || '').unwrap()
      toast.success(t(`"${deleteTarget.name}" removed`))
      setDeleteTarget(null)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t('Failed to remove this competitor site')))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='flex max-h-[88vh] w-[calc(100vw-1.25rem)] max-w-[min(94vw,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(94vw,640px)]'>
          <DialogHeader className='shrink-0 flex-row items-start gap-3 space-y-0 border-b border-border/60 px-6 pb-4 pt-6 text-left'>
            <span className='mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
              <Globe className='h-5 w-5' />
            </span>
            <div className='space-y-1'>
              <DialogTitle className='text-xl'>
                {view === 'list'
                  ? t('Manage Competitor Sites')
                  : editingSource
                    ? t('Edit Competitor Site')
                    : t('Add Competitor Site')}
              </DialogTitle>
              <DialogDescription>
                {view === 'list'
                  ? t('Websites the Price Checker looks up alongside your own catalog.')
                  : t('Use the Test button to confirm the selectors work before saving.')}
              </DialogDescription>
            </div>
          </DialogHeader>

          {view === 'list' ? (
            <SourcesList
              sources={sources}
              isLoading={isFetching}
              onAdd={openCreateForm}
              onEdit={openEditForm}
              onDelete={setDeleteTarget}
            />
          ) : (
            <SourceForm
              key={editingSource?._id || editingSource?.id || 'new'}
              initialValues={
                editingSource
                  ? {
                      name: editingSource.name,
                      searchUrlTemplate: editingSource.searchUrlTemplate,
                      priceSelector: editingSource.priceSelector,
                      titleSelector: editingSource.titleSelector || '',
                      imageSelector: editingSource.imageSelector || '',
                      linkSelector: editingSource.linkSelector || '',
                      isActive: editingSource.isActive,
                    }
                  : emptyValues
              }
              isSaving={isCreating || isUpdating}
              onBack={backToList}
              onSave={handleSave}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Remove competitor site?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This stops checking prices on')} <strong>{deleteTarget?.name}</strong>. {t('You can add it back anytime.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? t('Removing...') : t('Remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function SourcesList({
  sources,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
}: {
  sources: PriceCheckerSource[]
  isLoading: boolean
  onAdd: () => void
  onEdit: (source: PriceCheckerSource) => void
  onDelete: (source: PriceCheckerSource) => void
}) {
  const { t } = useLanguage()
  return (
    <>
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='space-y-2 px-6 py-4'>
          {isLoading ? (
            <p className='py-6 text-center text-sm text-muted-foreground'>{t('Loading...')}</p>
          ) : sources.length === 0 ? (
            <p className='py-6 text-center text-sm text-muted-foreground'>
              {t('No competitor sites configured yet — add one to start comparing prices.')}
            </p>
          ) : (
            sources.map((source) => (
              <div
                key={source._id || source.id}
                className='flex items-center justify-between gap-3 rounded-lg border p-3'
              >
                <div className='flex min-w-0 items-center gap-2'>
                  <Store className='h-4 w-4 shrink-0 text-muted-foreground' />
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>{source.name}</p>
                    <p className='truncate text-xs text-muted-foreground'>{source.searchUrlTemplate}</p>
                  </div>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  {source.lastCheckStatus && (
                    <Badge variant={source.lastCheckStatus === 'ok' ? 'secondary' : 'outline'} className='text-[10px]'>
                      {source.lastCheckStatus === 'ok'
                        ? t('working')
                        : source.lastCheckStatus === 'not_found'
                          ? t('no match')
                          : t('failing')}
                    </Badge>
                  )}
                  <Button variant='ghost' size='icon' className='h-7 w-7' onClick={() => onEdit(source)}>
                    <Pencil className='h-3.5 w-3.5' />
                  </Button>
                  <Button variant='ghost' size='icon' className='h-7 w-7' onClick={() => onDelete(source)}>
                    <Trash2 className='h-3.5 w-3.5 text-destructive' />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <DialogFooter className='shrink-0 border-t border-border/60 bg-background/95 px-6 py-4 sm:justify-between'>
        <Button type='button' onClick={onAdd}>
          <Plus className='mr-2 h-4 w-4' />
          {t('Add Competitor Site')}
        </Button>
      </DialogFooter>
    </>
  )
}

function SourceForm({
  initialValues,
  isSaving,
  onBack,
  onSave,
}: {
  initialValues: SourceFormValues
  isSaving: boolean
  onBack: () => void
  onSave: (values: SourceFormValues) => void
}) {
  const { t } = useLanguage()
  // mode: 'onChange' (not RHF's default 'onSubmit') — this form is never actually
  // submitted before the user clicks "Test" mid-fill, and RHF's onChange
  // re-validation only kicks in automatically *after* a real submit attempt. Without
  // this, an error surfaced by the manual form.trigger() call in runTest() below goes
  // stale: it stays on screen even once the user finishes typing a valid value.
  const form = useForm<SourceFormValues>({
    resolver: zodResolver(sourceFormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  })
  const [testQuery, setTestQuery] = useState('')
  const [testSource, { data: testResult, isLoading: isTesting, reset: resetTest }] = useTestSourceMutation()
  const [sampleUrl, setSampleUrl] = useState('')
  const [autoDetect, { data: detectResult, isLoading: isDetecting }] = useAutoDetectSelectorsMutation()

  // Paste a link to one real product page and let the server figure out the CSS
  // selectors — this is the whole point of the feature: nobody configuring a
  // competitor site should have to open devtools and hand-write a CSS selector.
  // Detected values still land in the same editable fields below, so a user who wants
  // to fine-tune (or whose site couldn't be auto-detected) can always override them.
  const runAutoDetect = async () => {
    const trimmed = sampleUrl.trim()
    if (!trimmed) {
      toast.error(t('Paste a link to one product page on this site first'))
      return
    }
    try {
      const res = await autoDetect({ url: trimmed }).unwrap()
      if (res.status !== 'ok') {
        toast.error(res.errorMessage || t('Could not analyze this page'))
        return
      }
      let filledCount = 0
      if (res.searchUrlTemplate) {
        form.setValue('searchUrlTemplate', res.searchUrlTemplate, { shouldValidate: true })
        filledCount += 1
      }
      if (res.priceSelector) {
        form.setValue('priceSelector', res.priceSelector, { shouldValidate: true })
        filledCount += 1
      }
      if (res.titleSelector) {
        form.setValue('titleSelector', res.titleSelector, { shouldValidate: true })
        filledCount += 1
      }
      if (res.imageSelector) {
        form.setValue('imageSelector', res.imageSelector, { shouldValidate: true })
        filledCount += 1
      }
      if (!form.getValues('name')) {
        try {
          form.setValue('name', new URL(trimmed).hostname.replace(/^www\./, ''))
        } catch {
          // Not a fully-qualified URL yet — leave the name field for the user to fill in.
        }
      }
      if (filledCount === 0) {
        toast.error(t("Couldn't detect anything on this page — fill in the fields below manually."))
      } else {
        toast.success(t(`Detected ${filledCount} field(s) — review below, then Save.`))
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t('Could not analyze this page')))
    }
  }

  const runTest = async () => {
    const values = form.getValues()
    const parsed = sourceFormSchema.safeParse(values)
    if (!parsed.success) {
      form.trigger()
      toast.error(t('Fill in the search URL and price selector before testing'))
      return
    }
    if (!testQuery.trim()) {
      toast.error(t('Enter a sample product name to test with'))
      return
    }
    try {
      // The test endpoint's Joi schema only accepts the scraping fields — name/isActive
      // aren't part of it, so sending the full form (as parsed.data has them) fails
      // validation with "name is not allowed". Only forward what it actually expects.
      const { searchUrlTemplate, priceSelector, titleSelector, imageSelector, linkSelector } = parsed.data
      await testSource({ searchUrlTemplate, priceSelector, titleSelector, imageSelector, linkSelector, query: testQuery }).unwrap()
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t('Test failed')))
    }
  }

  return (
    <>
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <Form {...form}>
          <form id='source-form' onSubmit={form.handleSubmit(onSave)} className='space-y-4 px-6 py-4'>
            <EntityFormSection
              icon={<Sparkles />}
              tone='violet'
              title={t('Start here: auto-detect (recommended)')}
              description={t("Paste a link to any one product on this site — we'll find the search URL, price, title and image for you. No CSS knowledge needed.")}
            >
              <div className='flex flex-col gap-2 sm:flex-row'>
                <Textarea
                  placeholder='https://example.com/products/some-item'
                  className='min-h-9 flex-1 resize-none break-all bg-background text-xs sm:text-sm'
                  rows={1}
                  showVoiceInput={false}
                  value={sampleUrl}
                  onChange={(e) => setSampleUrl(e.target.value)}
                />
                <Button type='button' onClick={runAutoDetect} disabled={isDetecting} className='shrink-0'>
                  {isDetecting ? t('Analyzing...') : t('Auto-Detect')}
                </Button>
              </div>
              {detectResult && detectResult.status === 'ok' && (
                <div className='space-y-1.5 rounded-md border bg-background p-3 text-sm'>
                  {detectResult.priceSelector ? (
                    <div className='flex items-baseline justify-between gap-2'>
                      <span className='text-muted-foreground'>{t('Price found')}</span>
                      <span className='font-semibold text-emerald-600'>{detectResult.price}</span>
                    </div>
                  ) : (
                    <p className='text-muted-foreground'>{t("Couldn't detect a price on this page.")}</p>
                  )}
                  {detectResult.titleSelector && (
                    <div className='flex items-baseline justify-between gap-2'>
                      <span className='text-muted-foreground'>{t('Title found')}</span>
                      <span className='truncate text-right font-medium'>{detectResult.title}</span>
                    </div>
                  )}
                  {detectResult.imageSelector && (
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-muted-foreground'>{t('Image found')}</span>
                      <img src={detectResult.image ?? undefined} alt='' className='h-8 w-8 rounded object-cover' />
                    </div>
                  )}
                  <div className='flex items-baseline justify-between gap-2'>
                    <span className='text-muted-foreground'>{t('Search URL')}</span>
                    <span>{detectResult.searchUrlTemplate ? t('detected below') : t("couldn't detect — fill in below")}</span>
                  </div>
                  <p className='pt-1 text-xs text-muted-foreground'>
                    {t('Filled in below — review it, or override manually if needed.')}
                  </p>
                </div>
              )}
            </EntityFormSection>

            <EntityFormSection icon={<Globe />} tone='sky' title={t('Site details')}>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>{t('Site name')} *</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. XYZ Mobiles' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='searchUrlTemplate'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>{t('Search URL')} *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='https://example.com/search?q={query}'
                        className='min-h-9 resize-none break-all bg-background font-mono text-xs'
                        rows={1}
                        showVoiceInput={false}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Must include the literal {query} placeholder — it gets replaced with the searched product name.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='isActive'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between gap-3 rounded-lg border bg-background p-3'>
                    <div className='space-y-0.5'>
                      <FormLabel>{t('Active')}</FormLabel>
                      <FormDescription>{t('Inactive sites are skipped by price checks.')}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </EntityFormSection>

            <EntityFormSection
              icon={<Code2 />}
              tone='slate'
              title={t('Selectors')}
              description={t('Auto-filled above — only touch these if you want to fine-tune or override manually.')}
            >
              <FormField
                control={form.control}
                name='priceSelector'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>{t('Price selector (CSS)')} *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='.product-price, .price'
                        className='min-h-9 resize-none break-all bg-background font-mono text-xs'
                        rows={1}
                        showVoiceInput={false}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className='grid gap-4 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='titleSelector'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>{t('Title selector (optional)')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='.product-title'
                          className='min-h-9 resize-none break-all bg-background font-mono text-xs'
                          rows={1}
                          showVoiceInput={false}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='imageSelector'
                  render={({ field }) => (
                    <FormItem className='gap-1.5'>
                      <FormLabel>{t('Image selector (optional)')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='.product-image img'
                          className='min-h-9 resize-none break-all bg-background font-mono text-xs'
                          rows={1}
                          showVoiceInput={false}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name='linkSelector'
                render={({ field }) => (
                  <FormItem className='gap-1.5'>
                    <FormLabel>{t('Product link selector (optional)')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='.product-title a'
                        className='min-h-9 resize-none break-all bg-background font-mono text-xs'
                        rows={1}
                        showVoiceInput={false}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{t('Defaults to the search results page link if left blank.')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </EntityFormSection>

            <EntityFormSection
              icon={<FlaskConical />}
              tone='emerald'
              title={t('Test before saving')}
              description={t('Runs a real search against the site with the settings above, so you know it works before you save.')}
            >
              <div className='flex gap-2'>
                <Input
                  placeholder={t('Sample product name, e.g. iPhone 13')}
                  className='bg-background'
                  value={testQuery}
                  onChange={(e) => {
                    setTestQuery(e.target.value)
                    resetTest()
                  }}
                />
                <Button type='button' variant='secondary' onClick={runTest} disabled={isTesting} className='shrink-0'>
                  {isTesting ? t('Testing...') : t('Test')}
                </Button>
              </div>
              {testResult && (
                <div className='rounded-md border bg-background p-2 text-sm'>
                  {testResult.status === 'ok' ? (
                    <p>
                      <span className='font-semibold text-emerald-600'>{t('Found')}:</span> {testResult.price}
                      {testResult.title ? ` — ${testResult.title}` : ''}
                    </p>
                  ) : testResult.status === 'not_found' ? (
                    <p className='text-muted-foreground'>{t('No price found with this selector — check it in your browser devtools.')}</p>
                  ) : (
                    <p className='text-destructive'>{testResult.errorMessage || t('Test failed')}</p>
                  )}
                </div>
              )}
            </EntityFormSection>
          </form>
        </Form>
      </div>
      <DialogFooter className='shrink-0 border-t border-border/60 bg-background/95 px-6 py-4 sm:justify-between'>
        <Button type='button' variant='outline' onClick={onBack} disabled={isSaving}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          {t('Back')}
        </Button>
        <Button type='submit' form='source-form' disabled={isSaving}>
          {isSaving ? t('Saving...') : t('Save')}
        </Button>
      </DialogFooter>
    </>
  )
}
