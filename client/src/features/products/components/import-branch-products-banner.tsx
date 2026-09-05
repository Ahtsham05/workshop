import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { Can } from '@/context/permission-context'
import { useGetImportableMasterProductsQuery } from '@/stores/masterProduct.api'
import { useUsers } from '../context/users-context'

/**
 * Shown only when this branch's product list is empty — the "branch 2 has zero
 * products, branch 1 has 10" scenario. Silent no-op (renders nothing) once the branch
 * has any products, or once there's nothing importable, so it never competes with the
 * always-visible toolbar button once a branch's catalog has real content.
 */
export function ImportBranchProductsBanner({ productCount, loading }: { productCount: number; loading: boolean }) {
  const { t } = useLanguage()
  const { setOpen } = useUsers()
  const shouldCheck = !loading && productCount === 0
  // Only needs the count, not the rows — limit: 1 so this stays a cheap existence-check
  // even for an org catalog running into the thousands (see
  // masterProduct.service.js#getImportableMasterProducts, which reports totalResults
  // without having to fetch every matching document).
  const { data } = useGetImportableMasterProductsQuery({ page: 1, limit: 1 }, { skip: !shouldCheck })
  const totalResults = data?.totalResults ?? 0

  if (!shouldCheck || totalResults === 0) return null

  return (
    <Can permission='createProducts'>
      <div className='mb-4 flex items-center justify-between rounded-lg border border-dashed border-blue-300 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/30'>
        <div className='flex items-center gap-2 text-sm text-blue-800 dark:text-blue-300'>
          <Building2 className='h-4 w-4 shrink-0' />
          {t('products_found_at_other_branches', { count: String(totalResults) })}
        </div>
        <Button size='sm' onClick={() => setOpen('import-master-products')}>
          {t('import_from_other_branches')}
        </Button>
      </div>
    </Can>
  )
}
