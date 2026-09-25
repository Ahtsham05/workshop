'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  ImageIcon,
  ImageOff,
  Info,
  Link2,
  Loader2,
  Maximize2,
  ScanBarcode,
  Search,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useImportWebImagesMutation,
  useSearchWebImagesMutation,
  type ImageSearchContext,
  type StoredImage,
  type WebImageProviderStatus,
  type WebImageResult,
} from '@/stores/imageSearch.api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Decides the Cloudinary folder the picked images land in. */
  context?: ImageSearchContext
  /** Name to search for, read fresh each time the dialog opens. */
  defaultQuery?: string
  /** Barcode/UPC/EAN, if the record has one — unlocks the exact-product providers. */
  defaultBarcode?: string
  /** How many images the caller can still accept. 1 = single-image caller. */
  maxSelectable?: number
  /** Called with the uploaded, ready-to-save images once the user confirms. */
  onSelect: (images: StoredImage[]) => void
  title?: string
}

/** Tiles shown while the first page loads — same count as a typical first response. */
const SKELETON_TILES = 12

const isLikelyBarcode = (value: string) => /^[0-9]{6,20}$/.test(value.replace(/\s+/g, ''))

/** One rounded pill in the row under the search box. */
function Chip({
  children,
  tone = 'default',
  onClick,
  title,
  active,
}: {
  children: React.ReactNode
  tone?: 'default' | 'success' | 'warning'
  onClick?: () => void
  title?: string
  active?: boolean
}) {
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        tone === 'success' &&
          'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
        tone === 'warning' &&
          'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
        tone === 'default' && 'border-border bg-muted/50 text-muted-foreground',
        tone === 'default' && active && 'border-primary/40 bg-primary/10 text-primary',
        onClick && 'hover:bg-muted cursor-pointer',
      )}
    >
      {children}
    </Tag>
  )
}

/**
 * "Find from web" image picker.
 *
 * Browsing is free: the grid renders remote URLs straight from the providers and
 * nothing touches Cloudinary until the user presses Add, at which point only the
 * selected images are downloaded and stored server-side.
 */
export default function WebImageSearchDialog({
  open,
  onOpenChange,
  context = 'product',
  defaultQuery = '',
  defaultBarcode = '',
  maxSelectable = 8,
  onSelect,
  title,
}: Props) {
  const [term, setTerm] = useState('')
  const [barcode, setBarcode] = useState('')
  const [useBarcode, setUseBarcode] = useState(true)
  const [results, setResults] = useState<WebImageResult[]>([])
  const [providers, setProviders] = useState<WebImageProviderStatus[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<WebImageResult[]>([])
  const [broken, setBroken] = useState<Record<string, true>>({})
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [pasteUrl, setPasteUrl] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  /** Index into `visible` of the image being shown full size, or null. */
  const [preview, setPreview] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [runSearch, { isLoading: searching }] = useSearchWebImagesMutation()
  const [runImport, { isLoading: importing }] = useImportWebImagesMutation()

  const single = maxSelectable === 1

  const doSearch = useCallback(
    async (nextPage: number, overrides?: { term?: string; barcode?: string }) => {
      const q = (overrides?.term ?? term).trim()
      const code = (overrides?.barcode ?? (useBarcode ? barcode : '')).trim()
      if (!q && !code) {
        setError('Type a product name (or scan a barcode) to search for.')
        return
      }
      setError(null)
      try {
        const response = await runSearch({
          query: q || undefined,
          barcode: code || undefined,
          page: nextPage,
          context,
        }).unwrap()
        setSearched(true)
        setPage(nextPage)
        setProviders(response.providers)
        setHasMore(response.hasMore)
        setResults((prev) => {
          if (nextPage === 1) return response.results
          // "Load more" appends — keep what the user is already looking at, and never
          // show the same photo twice if two pages overlap.
          const seen = new Set(prev.map((r) => r.id))
          return [...prev, ...response.results.filter((r) => !seen.has(r.id))]
        })
      } catch (e: unknown) {
        const message =
          (e as { data?: { message?: string } })?.data?.message ||
          'Image search failed. Check your connection and try again.'
        setError(message)
        if (nextPage === 1) setResults([])
      }
    },
    [barcode, context, runSearch, term, useBarcode],
  )

  // Opening the dialog re-reads the record's current name/barcode (they change while
  // the form is being filled in) and searches once, so the grid is already populated
  // rather than showing an empty box the user has to prod.
  useEffect(() => {
    if (!open) return
    const nextTerm = defaultQuery.trim()
    const nextBarcode = defaultBarcode.trim()
    setTerm(nextTerm)
    setBarcode(nextBarcode)
    setUseBarcode(Boolean(nextBarcode))
    setSelected([])
    setResults([])
    setProviders([])
    setBroken({})
    setError(null)
    setSearched(false)
    setPage(1)
    setHasMore(false)
    setShowPaste(false)
    setPasteUrl('')
    setPreview(null)
    if (nextTerm.length >= 2 || isLikelyBarcode(nextBarcode)) {
      void doSearch(1, { term: nextTerm, barcode: nextBarcode })
    } else {
      window.setTimeout(() => inputRef.current?.focus(), 80)
    }
    // doSearch is intentionally omitted: it closes over the live term/barcode state this
    // effect is itself resetting, and re-running on every keystroke would re-search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultQuery, defaultBarcode])

  const visible = useMemo(() => results.filter((r) => !broken[r.id]), [results, broken])
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected])

  const toggle = useCallback(
    (result: WebImageResult) => {
      setSelected((prev) => {
        const exists = prev.some((s) => s.id === result.id)
        if (exists) return prev.filter((s) => s.id !== result.id)
        if (single) return [result]
        if (prev.length >= maxSelectable) {
          toast.error(`You can add ${maxSelectable} more image${maxSelectable === 1 ? '' : 's'}.`)
          return prev
        }
        return [...prev, result]
      })
    },
    [maxSelectable, single],
  )

  // Full-view navigation. Rendered as an in-dialog overlay rather than a nested Dialog:
  // one portal, one focus trap, and no chance of the two closing each other on Escape.
  useEffect(() => {
    if (preview === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setPreview(null)
      }
      if (e.key === 'ArrowRight') setPreview((i) => (i === null ? i : (i + 1) % visible.length))
      if (e.key === 'ArrowLeft') setPreview((i) => (i === null ? i : (i - 1 + visible.length) % visible.length))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [preview, visible.length])

  const confirm = async () => {
    if (!selected.length) return
    try {
      const response = await runImport({
        context,
        images: selected.map((s) => ({
          url: s.url,
          token: s.token,
          provider: s.provider,
          sourceUrl: s.sourceUrl,
        })),
      }).unwrap()

      if (!response.images?.length) {
        // The server refuses an import where every candidate failed, so this only
        // happens if something upstream answered oddly — closing the dialog on it
        // would look like the photos were added when they were not.
        toast.error('None of the selected images could be added. Try different ones.')
        return
      }
      if (response.failures?.length) {
        toast.warning(
          `${response.images.length} image${response.images.length === 1 ? '' : 's'} added — ${response.failures.length} could not be downloaded.`,
        )
      }
      onSelect(response.images)
      onOpenChange(false)
    } catch (e: unknown) {
      toast.error(
        (e as { data?: { message?: string } })?.data?.message || 'Could not add the selected images.',
      )
    }
  }

  const addPastedUrl = async () => {
    const url = pasteUrl.trim()
    if (!url) return
    try {
      const response = await runImport({ context, images: [{ url }] }).unwrap()
      onSelect(response.images)
      onOpenChange(false)
    } catch (e: unknown) {
      toast.error((e as { data?: { message?: string } })?.data?.message || 'That image link could not be used.')
    }
  }

  const busy = searching || importing
  const previewed = preview !== null ? visible[preview] : null
  const okProviders = providers.filter((p) => p.status === 'ok' && p.count > 0)
  const failedProviders = providers.filter((p) => p.status === 'failed')
  const googleMissing = providers.some((p) => p.key === 'google' && p.status === 'not_configured')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // sm:max-w-5xl is load-bearing: the base DialogContent ships `sm:max-w-lg`, and
        // a plain `max-w-5xl` loses to it at every breakpoint above sm (they're
        // different variants, so tailwind-merge keeps both) — which capped this picker
        // at 512px and squeezed the grid down to two tiny columns.
        className='flex h-[92dvh] max-h-[92dvh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:h-[88dvh] sm:max-w-5xl'
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className='shrink-0 space-y-3 border-b border-border/60 px-4 pt-4 pb-3 text-left sm:px-6'>
          <div className='flex items-start gap-3 pr-8'>
            <span className='mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400'>
              <ImageIcon className='h-5 w-5' />
            </span>
            <div className='min-w-0'>
              <DialogTitle className='text-base sm:text-lg'>{title || 'Find images from the web'}</DialogTitle>
              <DialogDescription className='text-xs sm:text-sm'>
                {single
                  ? 'Search by name or barcode, then pick the photo you want. Nothing is saved until you press Add.'
                  : `Search by name or barcode, then pick up to ${maxSelectable} photo${maxSelectable === 1 ? '' : 's'}. Nothing is saved until you press Add.`}
              </DialogDescription>
            </div>
          </div>

          {/* Search bar */}
          <div className='flex gap-2'>
            <div className='relative flex-1'>
              <Search className='pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                ref={inputRef}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void doSearch(1)
                  }
                }}
                placeholder='e.g. Samsung Galaxy A15 black'
                className='h-11 pl-9 pr-9'
                autoComplete='off'
              />
              {term ? (
                <button
                  type='button'
                  aria-label='Clear search'
                  onClick={() => {
                    setTerm('')
                    inputRef.current?.focus()
                  }}
                  className='absolute top-1/2 right-2.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground'
                >
                  <X className='h-3 w-3' />
                </button>
              ) : null}
            </div>
            <Button type='button' onClick={() => void doSearch(1)} disabled={busy} className='h-11 px-5'>
              {searching ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Search className='mr-2 h-4 w-4' />}
              Search
            </Button>
          </div>

          {/* Status / action chips */}
          <div className='flex flex-wrap items-center gap-1.5'>
            {barcode ? (
              <Chip
                tone={useBarcode ? 'success' : 'default'}
                onClick={() => {
                  const next = !useBarcode
                  setUseBarcode(next)
                  void doSearch(1, { barcode: next ? barcode : '' })
                }}
                title={useBarcode ? 'Barcode lookup is on — tap to turn off' : 'Also look this barcode up'}
              >
                <ScanBarcode className='h-3.5 w-3.5' />
                {barcode}
                {useBarcode ? <Check className='h-3 w-3' /> : null}
              </Chip>
            ) : null}
            <Chip onClick={() => setShowPaste((v) => !v)} active={showPaste}>
              <Link2 className='h-3.5 w-3.5' />
              Paste image link
            </Chip>
            {okProviders.map((p) => (
              <Chip key={p.key}>
                <Globe className='h-3.5 w-3.5' />
                {p.label} ({p.count})
              </Chip>
            ))}
            {failedProviders.length ? (
              <Chip tone='warning' title='These sources did not answer — the rest still did'>
                <AlertCircle className='h-3.5 w-3.5' />
                {failedProviders.map((p) => p.label).join(', ')} unavailable
              </Chip>
            ) : null}
          </div>

          {showPaste ? (
            <div className='flex gap-2'>
              <Input
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void addPastedUrl()
                  }
                }}
                placeholder='https://…/photo.jpg'
                className='h-9 text-sm'
                autoComplete='off'
              />
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-9'
                disabled={!pasteUrl.trim() || busy}
                onClick={() => void addPastedUrl()}
              >
                {importing ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Add'}
              </Button>
            </div>
          ) : null}
        </DialogHeader>

        {/* Results */}
        <div className='@container min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6'>
          {error ? (
            <div className='mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center'>
              <AlertCircle className='h-10 w-10 text-destructive/70' />
              <p className='text-sm font-medium text-destructive'>{error}</p>
              <Button type='button' variant='outline' size='sm' onClick={() => void doSearch(1)}>
                Try again
              </Button>
            </div>
          ) : searching && page === 1 ? (
            <div className='grid grid-cols-2 gap-3 @[30rem]:grid-cols-3 @[44rem]:grid-cols-4 @[60rem]:grid-cols-5'>
              {Array.from({ length: SKELETON_TILES }).map((_, i) => (
                <Skeleton key={i} className='aspect-square rounded-xl' />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className='mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center'>
              <ImageOff className='h-10 w-10 text-muted-foreground/60' />
              <p className='text-sm font-medium'>
                {searched ? 'No images found for that search' : 'Search to see images'}
              </p>
              <p className='text-xs text-muted-foreground'>
                {searched
                  ? 'Try the brand plus the model (e.g. “Infinix Hot 40i”), or scan the barcode for an exact match.'
                  : 'Type the product name above and press Enter.'}
              </p>
              {searched && googleMissing ? (
                <p className='rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground'>
                  Tip for your administrator: adding <code className='font-mono'>GOOGLE_CSE_API_KEY</code> and{' '}
                  <code className='font-mono'>GOOGLE_CSE_CX</code> to the server gives far better results for typed
                  product names.
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <div className='grid grid-cols-2 gap-3 @[30rem]:grid-cols-3 @[44rem]:grid-cols-4 @[60rem]:grid-cols-5'>
                {visible.map((result, index) => {
                  const isSelected = selectedIds.has(result.id)
                  return (
                    <div
                      key={result.id}
                      role='button'
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={result.title || 'Search result'}
                      onClick={() => toggle(result)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggle(result)
                        }
                      }}
                      className={cn(
                        'group relative aspect-square overflow-hidden rounded-xl border bg-muted/40 text-left outline-none transition-all',
                        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        isSelected
                          ? 'border-primary ring-2 ring-primary'
                          : 'border-border/70 hover:border-primary/40 hover:shadow-md',
                      )}
                    >
                      <img
                        src={result.thumbUrl}
                        alt=''
                        loading='lazy'
                        referrerPolicy='no-referrer'
                        onError={() => setBroken((prev) => ({ ...prev, [result.id]: true }))}
                        className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]'
                      />

                      {/* Dim only while selected, so the check reads clearly on any photo */}
                      <span
                        className={cn(
                          'pointer-events-none absolute inset-0 transition-colors',
                          isSelected ? 'bg-primary/15' : 'bg-transparent',
                        )}
                        aria-hidden
                      />

                      {/* Selection marker */}
                      <span
                        className={cn(
                          'absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm transition-all',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-white/90 bg-black/15 text-white/0 backdrop-blur-[2px] group-hover:bg-black/30 group-hover:text-white/90',
                        )}
                      >
                        <Check className='h-3.5 w-3.5' strokeWidth={3} />
                      </span>

                      {/* Full view — on every tile, and never selects the image */}
                      <button
                        type='button'
                        aria-label='View full size'
                        title='View full size'
                        onClick={(e) => {
                          e.stopPropagation()
                          setPreview(index)
                        }}
                        className='absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white opacity-0 shadow-sm backdrop-blur-sm transition-all hover:bg-black/70 focus:opacity-100 focus:outline-none group-hover:opacity-100 max-md:opacity-100'
                      >
                        <Maximize2 className='h-3 w-3' />
                      </button>

                      {/* Provenance strip */}
                      <div className='pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-5 opacity-0 transition-opacity group-hover:opacity-100'>
                        <span className='flex min-w-0 items-center gap-1 text-[10px] font-medium text-white/90'>
                          {result.exactMatch ? <BadgeCheck className='h-3 w-3 shrink-0 text-emerald-400' /> : null}
                          <span className='truncate'>{result.providerLabel}</span>
                        </span>
                        {result.width && result.height ? (
                          <span className='shrink-0 text-[10px] tabular-nums text-white/70'>
                            {result.width}×{result.height}
                          </span>
                        ) : null}
                      </div>

                      {result.exactMatch ? (
                        <span className='pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm transition-opacity group-hover:opacity-0'>
                          <BadgeCheck className='h-2.5 w-2.5' />
                          Exact
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {hasMore ? (
                <div className='mt-5 flex justify-center'>
                  <Button type='button' variant='outline' disabled={busy} onClick={() => void doSearch(page + 1)}>
                    {searching ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
                    Load more images
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className='shrink-0 flex-row items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6'>
          <div className='flex min-w-0 items-center gap-2 text-xs'>
            {selected.length > 0 ? (
              <>
                <span className='inline-flex items-center gap-1.5 font-medium text-foreground'>
                  <Info className='h-3.5 w-3.5 text-primary' />
                  {selected.length} image{selected.length === 1 ? '' : 's'} selected
                </span>
                <button
                  type='button'
                  onClick={() => setSelected([])}
                  className='rounded px-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'
                >
                  Clear
                </button>
              </>
            ) : (
              <span className='inline-flex items-center gap-1.5 text-muted-foreground'>
                <Info className='h-3.5 w-3.5' />
                <span className='hidden sm:inline'>Tap an image to select it · ⤢ to view full size</span>
                <span className='sm:hidden'>Tap to select</span>
              </span>
            )}
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={importing}>
              Cancel
            </Button>
            <Button type='button' onClick={() => void confirm()} disabled={!selected.length || importing}>
              {importing ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
              {importing ? 'Adding…' : single ? 'Use this image' : 'Add images'}
            </Button>
          </div>
        </DialogFooter>

        {/* Full-size preview, layered over the picker rather than in a nested dialog */}
        {previewed ? (
          <div className='absolute inset-0 z-30 flex flex-col bg-zinc-950/95 backdrop-blur-sm'>
            <div className='flex items-center justify-between gap-3 px-4 py-3 text-white'>
              <div className='min-w-0'>
                <p className='truncate text-sm font-medium'>{previewed.title || previewed.providerLabel}</p>
                <p className='truncate text-[11px] text-white/60'>
                  {previewed.providerLabel}
                  {previewed.width && previewed.height ? ` · ${previewed.width}×${previewed.height}` : ''}
                  {previewed.author ? ` · ${previewed.author}` : ''}
                </p>
              </div>
              <button
                type='button'
                aria-label='Close preview'
                onClick={() => setPreview(null)}
                className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20'
              >
                <X className='h-4 w-4' />
              </button>
            </div>

            <div className='relative flex min-h-0 flex-1 items-center justify-center px-4'>
              <img
                src={previewed.url}
                alt={previewed.title || 'Full size preview'}
                referrerPolicy='no-referrer'
                onError={(e) => {
                  // Some hosts block hotlinking the full-size file but not the thumb.
                  const img = e.currentTarget
                  if (img.src !== previewed.thumbUrl) img.src = previewed.thumbUrl
                }}
                className='max-h-full max-w-full object-contain'
              />
              {visible.length > 1 ? (
                <>
                  <button
                    type='button'
                    aria-label='Previous image'
                    onClick={() => setPreview((i) => (i === null ? i : (i - 1 + visible.length) % visible.length))}
                    className='absolute left-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25'
                  >
                    <ChevronLeft className='h-5 w-5' />
                  </button>
                  <button
                    type='button'
                    aria-label='Next image'
                    onClick={() => setPreview((i) => (i === null ? i : (i + 1) % visible.length))}
                    className='absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25'
                  >
                    <ChevronRight className='h-5 w-5' />
                  </button>
                </>
              ) : null}
            </div>

            <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'>
              <div className='flex items-center gap-3 text-[11px] text-white/70'>
                <span className='tabular-nums'>
                  {preview! + 1} of {visible.length}
                </span>
                {previewed.sourceUrl ? (
                  <a
                    href={previewed.sourceUrl}
                    target='_blank'
                    rel='noreferrer noopener'
                    className='inline-flex items-center gap-1 hover:text-white hover:underline'
                  >
                    <ExternalLink className='h-3 w-3' />
                    Open source page
                  </a>
                ) : null}
              </div>
              <Button
                type='button'
                size='sm'
                variant={selectedIds.has(previewed.id) ? 'secondary' : 'default'}
                onClick={() => toggle(previewed)}
              >
                {selectedIds.has(previewed.id) ? (
                  <>
                    <Check className='mr-1.5 h-4 w-4' />
                    Selected — tap to remove
                  </>
                ) : (
                  'Select this image'
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
