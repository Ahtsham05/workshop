import { useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import { Loader2, PowerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import type { AppDispatch } from '@/stores/store'
import { bulkUpdateProducts } from '@/stores/product.slice'
import { useGetInactiveCatalogQuery, type InactiveCatalogItem } from '@/stores/purchaseCatalog.api'
import { filterAndRankBySearch } from '@/utils/urdu-text-utils'

type LangFn = (key: string, vars?: Record<string, string | number>) => string

const MAX_SHOWN = 5

/**
 * The branch's inactive products matching a picker search. Product pickers only list
 * active products, so a search for a deactivated one used to end in a bare "No products
 * found". Pass '' while the picker is closed — the list is only fetched once a search is
 * typed, and it refreshes with the catalog after any product write (same cache tag).
 */
export function useInactiveProductMatches(query: string): InactiveCatalogItem[] {
  const q = query.trim()
  const { data } = useGetInactiveCatalogQuery(undefined, { skip: !q })
  return useMemo(() => {
    if (!q || !data?.length) return []
    return filterAndRankBySearch(data, q, (p) => [p.name, p.nameUrdu, p.barcode, p.sku, p.brandName])
  }, [data, q])
}

/**
 * The text for a picker's empty state.
 * - no search typed → `emptyListMessage` (e.g. "All products are already on this transfer")
 * - search matches only inactive products → says so (they're listed below the message)
 * - search matches only products hidden for another reason (`otherStatusCount`, e.g.
 *   already added) → "No other matching products"
 * - nothing at all → "No products found" + a reminder that inactive products are hidden
 */
export function pickerEmptyMessage(
  t: LangFn,
  query: string,
  {
    inactiveCount = 0,
    otherStatusCount = 0,
    emptyListMessage,
  }: { inactiveCount?: number; otherStatusCount?: number; emptyListMessage?: string } = {},
): string {
  if (!query.trim()) return emptyListMessage ?? t('no_products_found')
  if (inactiveCount > 0) return t('No active products found — matching inactive products are below')
  if (otherStatusCount > 0) return t('No other matching products')
  return `${t('no_products_found')}. ${t('check_product_is_active')}`
}

/**
 * Lists inactive matches under a picker's results, with Activate for users who can edit
 * products. Activating refreshes the catalog, so the product then shows up in the picker.
 */
export function InactiveProductMatches({ matches }: { matches: InactiveCatalogItem[] }) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const canActivate = usePermissions().hasExplicitPermission('editProducts')
  const [activatingId, setActivatingId] = useState<string | null>(null)

  if (matches.length === 0) return null

  const activate = async (product: InactiveCatalogItem) => {
    setActivatingId(product.id)
    try {
      const result = await dispatch(bulkUpdateProducts({ products: [{ id: product.id, isActive: true }] }))
      // A failed thunk already toasts its error (utils/errorHandler.ts).
      if (result.meta.requestStatus === 'fulfilled') {
        toast.success(t('{{name}} is active again', { name: product.name }))
      }
    } finally {
      setActivatingId(null)
    }
  }

  return (
    <div className='border-t px-3 py-2'>
      <p className='mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-500'>
        <PowerOff className='h-3.5 w-3.5' aria-hidden />
        {t('Inactive products')}
      </p>
      <ul className='space-y-1'>
        {matches.slice(0, MAX_SHOWN).map((product) => (
          <li key={product.id} className='flex items-center gap-2 text-sm'>
            <div className='min-w-0 flex-1'>
              <p className='truncate text-muted-foreground'>{product.name}</p>
              {product.barcode || product.brandName ? (
                <p className='truncate text-xs text-muted-foreground/80'>
                  {[product.brandName, product.barcode].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>
            {canActivate ? (
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-7 shrink-0 px-2 text-xs'
                disabled={activatingId !== null}
                onClick={() => activate(product)}
              >
                {activatingId === product.id ? <Loader2 className='h-3.5 w-3.5 animate-spin' aria-hidden /> : t('Activate')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {matches.length > MAX_SHOWN ? (
        <p className='mt-1 text-xs text-muted-foreground'>
          {t('+{{count}} more inactive', { count: matches.length - MAX_SHOWN })}
        </p>
      ) : null}
    </div>
  )
}
