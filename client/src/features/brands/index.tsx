import { useCallback, useEffect, useState } from 'react'
import { BrandsProvider } from './context/brands-context'
import { BrandsTable } from './components/brands-table'
import { BrandsActionDialog } from './components/brands-action-dialog'
import { BrandsDeleteDialog } from './components/brands-delete-dialog'
import { BrandImportDialog } from './components/brand-import-dialog'
import { BulkDeleteDialog } from './components/bulk-delete-dialog'
import BrandsPrimaryButtons from './components/brands-primary-buttons'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Can } from '@/context/permission-context'
import { Trash2 } from 'lucide-react'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useGetBrandsQuery, type Brand } from '@/stores/brand.api'

const SEARCH_DEBOUNCE_MS = 400

export default function BrandsIndex() {
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const [selectedBrands, setSelectedBrands] = useState<Brand[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const handleSelectedRowsChange = useCallback((rows: Brand[]) => {
    setSelectedBrands(rows)
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch])

  const q = debouncedSearch.trim()
  const { data, isFetching } = useGetBrandsQuery({
    page: currentPage,
    limit,
    sortBy: 'createdAt:desc',
    ...(q ? { search: q, fieldName: 'name' } : {}),
  })

  return (
    <BrandsProvider>
      <div>
        <div className='mb-2 flex flex-wrap items-center justify-between space-y-2'>
          <div>
            <h2 className='text-2xl font-bold mb-5 tracking-tight'>Brands</h2>
            <p className='text-muted-foreground'>Manage the brands your products belong to.</p>
          </div>
          <BrandsPrimaryButtons />
        </div>

        <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
          <BrandsTable
            brands={data?.results || []}
            loading={isFetching}
            toolbarLeading={
              <Input
                autoFocus
                placeholder='Search brands...'
                className='h-9 w-full'
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label='Search brands'
              />
            }
            toolbarTrailing={
              selectedBrands.length > 0 && (
                <Can permission='deleteBrands'>
                  <Button
                    variant='destructive'
                    size='sm'
                    onClick={() => setBulkDeleteOpen(true)}
                    className='h-8 space-x-1'
                  >
                    <Trash2 size={16} />
                    <span>Delete Selected ({selectedBrands.length})</span>
                  </Button>
                </Can>
              )
            }
            onSelectedRowsChange={handleSelectedRowsChange}
            paggination={{
              totalPage: data?.totalPages || 1,
              currentPage,
              setCurrentPage,
              limit,
              setLimit: (n: number) => {
                setLimit(n)
                setCurrentPage(1)
              },
            }}
          />
        </div>

        <BrandsActionDialog />
        <BrandsDeleteDialog />
        <BrandImportDialog />
        <BulkDeleteDialog
          open={bulkDeleteOpen}
          onOpenChange={setBulkDeleteOpen}
          brands={selectedBrands}
          onDeleted={() => setSelectedBrands([])}
        />
      </div>
    </BrandsProvider>
  )
}
