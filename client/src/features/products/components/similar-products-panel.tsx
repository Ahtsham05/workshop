import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Package, PencilLine, SearchCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useFormatMoney } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { productSourceMeta } from '@/lib/product-source'
import {
  isLikelyDuplicate,
  prepareCandidates,
  rankSimilarProducts,
  type SimilarMatch,
} from '@/lib/product-similarity'
import { useGetProductNameIndexQuery, type ProductNameIndexEntry } from '@/stores/product.api'

export type SimilarProductMatch = SimilarMatch<ProductNameIndexEntry>

/**
 * Live "already in this branch?" matches for the name (and barcode) being typed on Add
 * Product. The branch's name index loads once when the dialog opens (re-checked if it is
 * over a minute old); ranking runs in the browser, behind a deferred value so typing never
 * waits on it.
 */
export function useSimilarProducts({ name, code, enabled }: { name: string; code?: string; enabled: boolean }) {
  const { data, isFetching } = useGetProductNameIndexQuery(undefined, { skip: !enabled, refetchOnMountOrArgChange: 60 })
  const prepared = useMemo(() => prepareCandidates(data ?? []), [data])
  const deferredName = useDeferredValue(name)
  const deferredCode = useDeferredValue(code)
  const matches = useMemo(
    () => (enabled ? rankSimilarProducts(deferredName, prepared, { code: deferredCode, limit: 8 }) : []),
    [enabled, deferredName, deferredCode, prepared],
  )
  /** Save-time check on the exact values being saved (not the deferred ones): likely duplicates only. */
  const findDuplicates = useCallback(
    (forName: string, forCode?: string) =>
      rankSimilarProducts(forName, prepared, { code: forCode, limit: 8 }).filter(isLikelyDuplicate),
    [prepared],
  )
  return { matches, findDuplicates, loading: isFetching && !data, indexSize: data?.length ?? 0 }
}

const KIND_LABEL: Record<SimilarProductMatch['kind'], string> = {
  exact: 'Same name',
  code: 'Same barcode',
  same_words: 'Same words',
  different_size: 'Other size / model',
  similar: 'Similar',
}

function MatchBadge({ match }: { match: SimilarProductMatch }) {
  const dup = isLikelyDuplicate(match)
  const text = match.kind === 'similar' ? `${Math.round(match.score * 100)}% match` : KIND_LABEL[match.kind]
  return (
    <Badge
      variant='outline'
      className={cn(
        'text-[10px]',
        dup
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
          : match.kind === 'different_size'
            ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300'
            : 'text-muted-foreground',
      )}
    >
      {text}
    </Badge>
  )
}

export function SourceBadge({ source, className }: { source: string | null | undefined; className?: string }) {
  const meta = productSourceMeta(source)
  if (!meta) return null
  const Icon = meta.icon
  return (
    <Badge variant='outline' title={meta.label} className={cn('gap-1 text-[10px]', meta.className, className)}>
      <Icon className='h-3 w-3' />
      {meta.short}
    </Badge>
  )
}

function MatchRow({ match, onOpen }: { match: SimilarProductMatch; onOpen?: (product: ProductNameIndexEntry) => void }) {
  const formatMoney = useFormatMoney()
  const p = match.item
  return (
    <li className='flex items-center gap-2.5 px-3 py-2'>
      {p.imageUrl ? (
        <img src={p.imageUrl} alt='' className='h-8 w-8 shrink-0 rounded-md border object-cover' />
      ) : (
        <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted'>
          <Package className='h-4 w-4 text-muted-foreground' />
        </span>
      )}
      <div className='min-w-0 flex-1'>
        <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
          <span className='truncate text-sm font-medium' title={p.name}>{p.name}</span>
          <MatchBadge match={match} />
          {!p.isActive && (
            <Badge variant='outline' className='text-[10px] text-muted-foreground'>Inactive</Badge>
          )}
          <SourceBadge source={p.source} />
        </div>
        <div className='mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground'>
          {p.barcode && <span className='font-mono'>{p.barcode}</span>}
          <span>Stock {p.hasVariants ? 'in variants' : p.stockQuantity.toLocaleString()}</span>
          <span>{formatMoney(p.price)}</span>
          {p.brandName && <span>{p.brandName}</span>}
          {p.createdAt && <span>Added {formatAppDate(p.createdAt)}</span>}
        </div>
      </div>
      {onOpen && (
        <Button type='button' variant='outline' size='sm' className='h-7 shrink-0 gap-1 px-2 text-xs' onClick={() => onOpen(p)}>
          <PencilLine className='h-3 w-3' />
          Open
        </Button>
      )}
    </li>
  )
}

/** A 409 DUPLICATE_PRODUCT_NAME's `details.product` (server findSameNameProduct) as a match row. */
export function matchFromDuplicateError(error: unknown): SimilarProductMatch | null {
  type DuplicateProduct = {
    id?: string
    name?: string
    barcode?: string
    sku?: string
    isActive?: boolean
    stockQuantity?: number
    price?: number
    image?: { url?: string }
    source?: ProductNameIndexEntry['source']
    createdAt?: string
  }
  const data = (error as { response?: { data?: { errorCode?: string; details?: { product?: DuplicateProduct } } } })?.response?.data
  const p = data?.errorCode === 'DUPLICATE_PRODUCT_NAME' ? data.details?.product : null
  if (!p?.id) return null
  return {
    kind: 'exact',
    score: 1,
    item: {
      id: String(p.id),
      name: String(p.name ?? ''),
      barcode: p.barcode || undefined,
      sku: p.sku || undefined,
      isActive: p.isActive !== false,
      stockQuantity: Number(p.stockQuantity) || 0,
      price: Number(p.price) || 0,
      imageUrl: p.image?.url || undefined,
      source: p.source ?? null,
      createdAt: p.createdAt,
      hasVariants: false,
      categoryNames: [],
    },
  }
}

const COLLAPSED_ROWS = 3

/** Shown under Product Name while typing; renders nothing until there is a match. */
export function SimilarProductsPanel({
  matches,
  onOpen,
}: {
  matches: SimilarProductMatch[]
  onOpen: (product: ProductNameIndexEntry) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (matches.length === 0) return null
  const duplicates = matches.filter(isLikelyDuplicate)
  const shown = expanded ? matches : matches.slice(0, COLLAPSED_ROWS)
  const hidden = matches.length - shown.length
  return (
    <div
      role='status'
      aria-live='polite'
      className={cn(
        'overflow-hidden rounded-lg border',
        duplicates.length ? 'border-red-200 dark:border-red-900' : 'border-amber-200 dark:border-amber-900',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-xs font-medium',
          duplicates.length
            ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
            : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
        )}
      >
        {duplicates.length ? <AlertTriangle className='h-3.5 w-3.5 shrink-0' /> : <SearchCheck className='h-3.5 w-3.5 shrink-0' />}
        <span className='flex-1'>
          {duplicates.length
            ? 'This product may already exist — open it instead of adding it again'
            : `${matches.length} similar product${matches.length === 1 ? '' : 's'} already in this branch`}
        </span>
      </div>
      <ul className='divide-y bg-background'>
        {shown.map((m) => (
          <MatchRow key={m.item.id} match={m} onOpen={onOpen} />
        ))}
      </ul>
      {(hidden > 0 || expanded) && matches.length > COLLAPSED_ROWS && (
        <button
          type='button'
          onClick={() => setExpanded((v) => !v)}
          className='flex w-full items-center justify-center gap-1 border-t bg-muted/30 py-1 text-xs text-muted-foreground hover:bg-muted/60'
        >
          {expanded ? <ChevronUp className='h-3 w-3' /> : <ChevronDown className='h-3 w-3' />}
          {expanded ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  )
}

/** Save-time stop for a likely duplicate: open the existing one, or create anyway. */
export function DuplicateProductDialog({
  matches,
  onOpenExisting,
  onCreateAnyway,
  onCancel,
}: {
  matches: SimilarProductMatch[] | null
  onOpenExisting: (product: ProductNameIndexEntry) => void
  onCreateAnyway: () => void
  onCancel: () => void
}) {
  return (
    <AlertDialog open={!!matches} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className='sm:max-w-xl'>
        <AlertDialogHeader>
          <AlertDialogTitle className='flex items-center gap-2'>
            <AlertTriangle className='h-5 w-5 text-red-600' />
            This product may already exist
          </AlertDialogTitle>
          <AlertDialogDescription>
            {matches && matches.length === 1
              ? 'A product with this name is already in this branch.'
              : 'These products in this branch look the same.'}{' '}
            Open it to update its stock or price, or create a separate product anyway.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className='max-h-72 divide-y overflow-y-auto rounded-lg border'>
          {(matches ?? []).map((m) => (
            <MatchRow key={m.item.id} match={m} onOpen={onOpenExisting} />
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep editing</AlertDialogCancel>
          <Button type='button' variant='destructive' onClick={onCreateAnyway}>
            Create anyway
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
