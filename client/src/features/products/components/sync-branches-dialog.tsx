import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, CheckCircle2, Info, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import {
  usePreviewBranchSyncMutation,
  type BranchSyncBranchResult,
  type BranchSyncPreview,
  type SyncSkippedProduct,
} from '@/stores/productBranchSync.api'
import {
  summarizeBranchSync,
  useBranchSyncRunner,
  type BranchSyncRun,
} from '../hooks/use-branch-sync'

type Source = 'selected' | 'addedToday'
type Phase = 'choose' | 'running' | 'done'

interface SyncBranchesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Rows ticked in the Products list; may be empty. */
  selectedProducts: { _id?: string; id?: string }[]
  /** How many products this branch added today — a second thing that can be synced. */
  addedTodayCount: number
  /** What to start on; otherwise the ticked rows if any, else everything added today. */
  initialSource?: Source
}

const idOf = (product: { _id?: string; id?: string }) => product._id || product.id || ''

/**
 * "Sync Across Branches": copies products to the user's other branches. The choice is made
 * with the facts in front of the user — a per-branch preview says how many products each
 * branch is missing and how many it already has — and the result is reported per branch.
 * Nothing here can overwrite a product a branch already carries, so running it twice, or
 * for a branch that is half up to date, is safe.
 */
export function SyncBranchesDialog({ open, onOpenChange, selectedProducts, addedTodayCount, initialSource }: SyncBranchesDialogProps) {
  const { t } = useLanguage()
  const [previewBranchSync] = usePreviewBranchSyncMutation()
  const runSync = useBranchSyncRunner()

  const selectedIds = useMemo(() => selectedProducts.map(idOf).filter(Boolean), [selectedProducts])
  const hasSelection = selectedIds.length > 0
  const hasAddedToday = addedTodayCount > 0

  const [source, setSource] = useState<Source>('selected')
  const [phase, setPhase] = useState<Phase>('choose')
  const [preview, setPreview] = useState<BranchSyncPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [chosenBranchIds, setChosenBranchIds] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [run, setRun] = useState<BranchSyncRun | null>(null)
  const previewSeq = useRef(0)

  // Opening the dialog starts from what is most likely wanted: the rows the user ticked,
  // else everything added today.
  useEffect(() => {
    if (!open) return
    const preferred = initialSource ?? (hasSelection ? 'selected' : 'addedToday')
    setSource(preferred === 'addedToday' && !hasAddedToday ? 'selected' : preferred)
    setPhase('choose')
    setRun(null)
    setPreview(null)
    setPreviewError(null)
    setChosenBranchIds(new Set())
    // Only when the dialog opens — later changes to the selection are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sourceIsAvailable = source === 'selected' ? hasSelection : hasAddedToday

  const loadPreview = useCallback(async () => {
    const seq = ++previewSeq.current
    setIsPreviewing(true)
    setPreviewError(null)
    try {
      const result = await previewBranchSync(source === 'selected' ? { productIds: selectedIds } : { scope: 'addedToday' }).unwrap()
      if (seq !== previewSeq.current) return
      setPreview(result)
      // Every branch that is missing something starts ticked — the point of opening this.
      setChosenBranchIds(new Set(result.targets.filter((row) => row.missingCount > 0).map((row) => row.branchId)))
    } catch (error) {
      if (seq !== previewSeq.current) return
      setPreview(null)
      setPreviewError(getErrorMessage(error, t("Couldn't check your other branches")))
    } finally {
      if (seq === previewSeq.current) setIsPreviewing(false)
    }
  }, [previewBranchSync, source, selectedIds, t])

  // Re-check whenever the thing being synced changes.
  useEffect(() => {
    if (!open || phase !== 'choose') return
    if (!sourceIsAvailable) {
      previewSeq.current++
      setPreview(null)
      setIsPreviewing(false)
      return
    }
    void loadPreview()
    // loadPreview is rebuilt whenever its inputs change, which is exactly when to re-check.
  }, [open, phase, sourceIsAvailable, loadPreview])

  const branchesWithWork = preview?.targets.filter((row) => row.missingCount > 0) ?? []
  const allTicked = branchesWithWork.length > 0 && branchesWithWork.every((row) => chosenBranchIds.has(row.branchId))
  const toggleBranch = (branchId: string, checked: boolean) =>
    setChosenBranchIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(branchId)
      else next.delete(branchId)
      return next
    })

  const startSync = async () => {
    if (!preview || chosenBranchIds.size === 0 || preview.productIds.length === 0) return
    setPhase('running')
    setProgress({ processed: 0, total: preview.productIds.length })
    const outcome = await runSync({
      productIds: preview.productIds,
      branchIds: [...chosenBranchIds],
      onProgress: (processed, total) => setProgress({ processed, total }),
    })
    setRun(outcome)
    setPhase('done')
  }

  const handleOpenChange = (next: boolean) => {
    // A request in flight cannot be recalled — closing would only lose track of how far it got.
    if (!next && phase === 'running') return
    onOpenChange(next)
  }

  const tickedCount = chosenBranchIds.size
  // The preview already leaves out what cannot be synced (so a run never sees it), and the
  // run can add its own — show both, each product once, before and after the run.
  const skipped: SyncSkippedProduct[] = [...new Map([...(preview?.skipped ?? []), ...(run?.result.skipped ?? [])].map((item) => [item.productId, item])).values()]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-[min(96vw,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl'>
        <DialogHeader className='shrink-0 gap-1 border-b px-4 py-4 text-left sm:px-6'>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <RefreshCw className='h-4 w-4 text-blue-600' />
            {t('Sync Across Branches')}
          </DialogTitle>
          <DialogDescription>
            {t('Copy products to your other branches so they can sell them straight away. A branch that already has a product is never changed.')}
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6'>
          {phase === 'choose' && (
            <>
              {hasSelection && hasAddedToday ? (
                <RadioGroup value={source} onValueChange={(v) => setSource(v as Source)} className='grid gap-2 sm:grid-cols-2' aria-label={t('What to sync')}>
                  {(
                    [
                      { value: 'selected', label: t('Selected products'), hint: t('{{count}} selected', { count: selectedIds.length }) },
                      { value: 'addedToday', label: t('Added today'), hint: t('{{count}} product(s) added today', { count: addedTodayCount }) },
                    ] as const
                  ).map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`sync-source-${option.value}`}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal',
                        source === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      )}
                    >
                      <RadioGroupItem id={`sync-source-${option.value}`} value={option.value} className='mt-0.5' />
                      <span>
                        <span className='block text-sm font-medium'>{option.label}</span>
                        <span className='block text-xs text-muted-foreground'>{option.hint}</span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              ) : sourceIsAvailable ? (
                <p className='text-sm font-medium'>
                  {source === 'selected'
                    ? t('Syncing {{count}} selected product(s)', { count: selectedIds.length })
                    : t('Syncing all {{count}} product(s) added today', { count: addedTodayCount })}
                </p>
              ) : null}

              {!sourceIsAvailable ? (
                <div className='flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-10 text-center'>
                  <RefreshCw className='mb-1 h-7 w-7 text-muted-foreground/50' />
                  <p className='text-sm font-medium'>{t('Nothing to sync yet')}</p>
                  <p className='max-w-sm text-xs text-muted-foreground'>
                    {t('Tick products in the list, or add new ones — everything added today can be synced from here.')}
                  </p>
                </div>
              ) : isPreviewing && !preview ? (
                <div className='space-y-2' aria-busy='true' aria-label={t('Checking your other branches…')}>
                  <Skeleton className='h-14 w-full' />
                  <Skeleton className='h-14 w-full' />
                </div>
              ) : previewError ? (
                <Alert variant='destructive'>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle>{t("Couldn't check your other branches")}</AlertTitle>
                  <AlertDescription className='flex flex-wrap items-center gap-2'>
                    {previewError}
                    <Button type='button' size='sm' variant='outline' className='h-7' onClick={() => void loadPreview()}>
                      {t('Try again')}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : preview ? (
                <>
                  <div className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <p className='text-sm font-medium'>{t('Sync to')}</p>
                      {branchesWithWork.length > 1 ? (
                        <Button
                          type='button'
                          variant='link'
                          size='sm'
                          className='h-auto p-0 text-xs'
                          onClick={() => setChosenBranchIds(allTicked ? new Set() : new Set(branchesWithWork.map((row) => row.branchId)))}
                        >
                          {allTicked ? t('Clear all') : t('Select all')}
                        </Button>
                      ) : null}
                    </div>
                    <ul className='divide-y rounded-lg border'>
                      {preview.targets.map((row) => {
                        const upToDate = row.missingCount === 0
                        return (
                          <li key={row.branchId}>
                            <Label
                              htmlFor={`sync-branch-${row.branchId}`}
                              className={cn('flex items-center gap-3 px-3 py-2.5 font-normal', upToDate ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-muted/40')}
                            >
                              <Checkbox
                                id={`sync-branch-${row.branchId}`}
                                checked={!upToDate && chosenBranchIds.has(row.branchId)}
                                disabled={upToDate}
                                onCheckedChange={(checked) => toggleBranch(row.branchId, checked === true)}
                              />
                              <span className='min-w-0 flex-1 truncate text-sm font-medium'>{row.name}</span>
                              {upToDate ? (
                                <Badge variant='outline' className='gap-1 font-normal'>
                                  <CheckCircle2 className='h-3 w-3 text-emerald-600' />
                                  {t('Up to date')}
                                </Badge>
                              ) : (
                                <span className='flex flex-wrap items-center justify-end gap-1.5'>
                                  <Badge className='font-normal'>{t('{{count}} new', { count: row.missingCount })}</Badge>
                                  {row.presentCount > 0 ? (
                                    <Badge variant='secondary' className='font-normal'>
                                      {t('{{count}} already there', { count: row.presentCount })}
                                    </Badge>
                                  ) : null}
                                </span>
                              )}
                            </Label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>

                  {branchesWithWork.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>{t('Every branch already has these products — nothing to do.')}</p>
                  ) : null}
                </>
              ) : null}

              {skipped.length > 0 ? <SkippedList skipped={skipped} /> : null}

              <div className='flex gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground'>
                <Info className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                <p>
                  {t('Copied: name, barcode, price, cost, tax, category, brand, image and variants. Not copied: stock — new products start at 0 (use Stock Transfer to move stock).')}
                </p>
              </div>
            </>
          )}

          {phase === 'running' && (
            <div className='space-y-3 py-6'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <Loader2 className='h-4 w-4 animate-spin' />
                {t('Syncing…')}
              </div>
              <Progress
                value={progress.total ? (progress.processed / progress.total) * 100 : 0}
                aria-label={t('Sync progress')}
              />
              <p className='text-xs text-muted-foreground'>
                {t('{{processed}} of {{total}} product(s) done. Keep this window open until it finishes.', progress)}
              </p>
            </div>
          )}

          {phase === 'done' && run && <SyncResult run={run} skipped={skipped} />}
        </div>

        <DialogFooter className='shrink-0 gap-2 border-t px-4 py-3 sm:px-6'>
          {phase === 'choose' && (
            <>
              <Button type='button' variant='outline' onClick={() => handleOpenChange(false)}>
                {t('Cancel')}
              </Button>
              <Button
                type='button'
                disabled={!preview || isPreviewing || tickedCount === 0 || preview.syncableCount === 0}
                onClick={() => void startSync()}
              >
                {tickedCount > 0 && preview
                  ? t('Sync {{products}} product(s) to {{branches}} branch(es)', { products: preview.syncableCount, branches: tickedCount })
                  : t('Sync')}
              </Button>
            </>
          )}
          {phase === 'running' && (
            <Button type='button' disabled>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              {t('Syncing…')}
            </Button>
          )}
          {phase === 'done' && (
            <>
              {run?.stoppedEarly ? (
                <Button type='button' variant='outline' onClick={() => { setPhase('choose'); setRun(null) }}>
                  {t('Try again')}
                </Button>
              ) : null}
              <Button type='button' onClick={() => handleOpenChange(false)}>
                {t('Done')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Products that could not be synced, with the reason — kept out of sight until asked for. */
function SkippedList({ skipped }: { skipped: SyncSkippedProduct[] }) {
  const { t } = useLanguage()
  return (
    <details className='rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/30'>
      <summary className='cursor-pointer font-medium text-amber-900 dark:text-amber-200'>
        {t("{{count}} product(s) can't be synced", { count: skipped.length })}
      </summary>
      <ul className='mt-2 space-y-1 text-xs text-amber-900/90 dark:text-amber-200/90'>
        {skipped.slice(0, 20).map((item) => (
          <li key={item.productId}>
            <span className='font-medium'>{item.name}</span> — {item.reason}
          </li>
        ))}
        {skipped.length > 20 ? <li>{t('…and {{count}} more', { count: skipped.length - 20 })}</li> : null}
      </ul>
    </details>
  )
}

function SyncResult({ run, skipped }: { run: BranchSyncRun; skipped: SyncSkippedProduct[] }) {
  const { t } = useLanguage()
  const summary = summarizeBranchSync(run.result)
  const hasProblems = summary.failed > 0 || run.stoppedEarly || run.result.branches.some((b) => b.error)
  const Icon = hasProblems ? AlertCircle : CheckCircle2

  return (
    <div className='space-y-4'>
      <div className='flex items-start gap-3'>
        <Icon className={cn('mt-0.5 h-6 w-6 shrink-0', hasProblems ? 'text-amber-600' : 'text-emerald-600')} />
        <div>
          <p className='text-sm font-semibold'>
            {run.stoppedEarly
              ? t('Sync stopped')
              : hasProblems
                ? t('Sync finished with problems')
                : summary.created > 0
                  ? t('Sync complete')
                  : t('Nothing new to sync')}
          </p>
          <p className='text-sm text-muted-foreground'>
            {summary.created > 0
              ? t('{{created}} new product(s) added across {{branches}} branch(es).', { created: summary.created, branches: summary.branchesReached })
              : t('Every chosen branch already had these products.')}
          </p>
        </div>
      </div>

      {run.stoppedEarly ? (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>{t('{{processed}} of {{total}} product(s) were processed', { processed: run.processed, total: run.total })}</AlertTitle>
          <AlertDescription className='space-y-1'>
            <p>{run.errorMessage}</p>
            <p>{t('Nothing is lost — run the sync again and it will carry on where it stopped.')}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      <ul className='divide-y rounded-lg border'>
        {run.result.branches.map((branch) => (
          <BranchResultRow key={branch.branchId} branch={branch} />
        ))}
      </ul>

      {skipped.length > 0 ? <SkippedList skipped={skipped} /> : null}
    </div>
  )
}

function BranchResultRow({ branch }: { branch: BranchSyncBranchResult }) {
  const { t } = useLanguage()
  return (
    <li className='space-y-1.5 px-3 py-2.5'>
      <div className='flex items-center justify-between gap-2'>
        <span className='truncate text-sm font-medium'>{branch.branchName}</span>
        <span className='flex flex-wrap items-center justify-end gap-1.5'>
          {branch.syncedCount > 0 ? <Badge className='font-normal'>{t('{{count}} new', { count: branch.syncedCount })}</Badge> : null}
          {branch.alreadyPresentCount > 0 ? (
            <Badge variant='secondary' className='font-normal'>
              {t('{{count}} already there', { count: branch.alreadyPresentCount })}
            </Badge>
          ) : null}
          {branch.failedCount > 0 ? (
            <Badge variant='destructive' className='font-normal'>
              {t('{{count}} failed', { count: branch.failedCount })}
            </Badge>
          ) : null}
        </span>
      </div>
      {branch.error ? <p className='text-xs text-destructive'>{branch.error}</p> : null}
      {branch.failed.length > 0 && !branch.error ? (
        <ul className='space-y-0.5 text-xs text-destructive'>
          {branch.failed.slice(0, 5).map((failure, index) => (
            <li key={`${failure.productId ?? 'x'}-${index}`}>
              <span className='font-medium'>{failure.name ?? t('A product')}</span> — {failure.error}
            </li>
          ))}
          {branch.failed.length > 5 ? <li>{t('…and {{count}} more', { count: branch.failed.length - 5 })}</li> : null}
        </ul>
      ) : null}
    </li>
  )
}
