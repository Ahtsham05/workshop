import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { useProductColumns } from './components/users-columns' // Updated to use hook
import ProductDialogs from './components/users-dialogs' // Adjusted for products
import ProductPrimaryButtons from './components/users-primary-buttons' // Adjusted for products
import { ProductTable } from './components/users-table' // Adjusted for products
import ProductsProvider from './context/users-context' // Adjusted for products
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { useEffect, useState, useCallback } from 'react'
import { fetchProducts, bulkUpdateProducts } from '@/stores/product.slice'
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/context/language-context'
import { LanguageSwitch } from '@/components/language-switch'
import { Button } from '@/components/ui/button'
import { Edit } from 'lucide-react'
import { toast } from 'sonner'

export default function Products() {
  // Parse product list
  const [products, setProducts] = useState<any[]>([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<any[]>([])
  const [inlineEditMode, setInlineEditMode] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, { price?: number; cost?: number; stockQuantity?: number }>>({})

  const dispatch = useDispatch<AppDispatch>()
  const { t, language } = useLanguage()
  const columns = useProductColumns() // Get columns with translations

  useEffect(() => {
    setLoading(true)
    const params = {
      page: currentPage,
      limit: limit,
      sortBy: 'createdAt:desc',
      ...(search && { search: search }), // Only include 'name' if search exists
      ...(search && { fieldName: 'name' })
    };
    
    dispatch(fetchProducts(params))
      .then((data) => {
        console.log('Products fetched:', data)
        if (data.payload?.results) {
          setProducts(data.payload.results)
          setTotalPage(data.payload.totalPages || 1)
        } else {
          setProducts([])
          setTotalPage(1)
        }
        setLoading(false)
      })
      .catch((error) => {
        console.error('Error fetching products:', error)
        setProducts([])
        setTotalPage(1)
        setLoading(false)
        toast.error('Failed to fetch products')
      })
  }, [currentPage, limit, fetch, search, dispatch])

  // Handle bulk product update with individual values
  const handleBulkUpdate = useCallback(async () => {
    try {
      const hasUpdates = Object.values(editValues).some(values => 
        values.price !== undefined || values.cost !== undefined || values.stockQuantity !== undefined
      )
      
      if (!hasUpdates) {
        toast.error(t('enter_at_least_one_value'))
        return
      }

      // Prepare products array for bulk update API
      const productsToUpdate = selectedProducts.map((product: any) => {
        const productId = product._id || product.id || ''
        const updates = editValues[productId] || {}
        
        if (Object.keys(updates).length === 0) return null
        
        return {
          id: productId,
          ...(updates.price !== undefined && { price: updates.price }),
          ...(updates.cost !== undefined && { cost: updates.cost }),
          ...(updates.stockQuantity !== undefined && { stockQuantity: updates.stockQuantity }),
        }
      }).filter(Boolean) // Remove null entries

      if (productsToUpdate.length === 0) {
        toast.error(t('no_changes_to_update'))
        return
      }

      console.log('Sending bulk update for products:', productsToUpdate)

      // Call the bulk update API
      const result = await dispatch(bulkUpdateProducts({ products: productsToUpdate }))
      
      if (result.meta.requestStatus === 'fulfilled') {
        // Reset edit mode and values
        setInlineEditMode(false)
        setEditValues({})
        setSelectedProducts([])
        
        // Refresh the products list
        setFetch(!fetch)
        
        toast.success(`${t('bulk_update_success')} ${productsToUpdate.length} products updated`)
      } else {
        throw new Error(result.payload || 'Bulk update failed')
      }
      
    } catch (error) {
      console.error('Bulk update error:', error)
      toast.error('Failed to update products')
    }
  }, [editValues, selectedProducts, t, fetch, dispatch])

  const handleSelectedRowsChange = useCallback((selectedRows: any[]) => {
    setSelectedProducts(selectedRows)
  }, [])

  const handleEditValueChange = useCallback((productId: string, field: string, value: number) => {
    setEditValues(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }))
  }, [])

  const startInlineEdit = useCallback(() => {
    if (selectedProducts.length === 0) {
      toast.error(t('no_products_selected'))
      return
    }
    setInlineEditMode(true)
  }, [selectedProducts.length, t])

  const cancelInlineEdit = useCallback(() => {
    setInlineEditMode(false)
    setEditValues({})
  }, [])

  return (
    <ProductsProvider>
      <div dir={language === 'ur' ? 'ltr' : 'ltr'}>
        <Header fixed>
          <Search />
          <div className='ml-auto flex items-center space-x-4'>
            <LanguageSwitch />
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </Header>

        <Main>
          <div className='mb-2 flex flex-wrap items-center justify-between space-y-2'>
            <div>
              <h2 className='text-2xl font-bold mb-5 tracking-tight'>{t('products_list')}</h2>
              <p className='text-muted-foreground'>
                {t('manage_products')}
              </p>
            </div>
            <div className='flex gap-2'>
              {selectedProducts.length > 0 && !inlineEditMode && (
                <Button 
                  variant="outline" 
                  onClick={startInlineEdit}
                  className='space-x-1'
                >
                  <Edit size={16} />
                  <span>{t('bulk_edit_selected')} ({selectedProducts.length})</span>
                </Button>
              )}
              {inlineEditMode && (
                <>
                  <Button 
                    onClick={handleBulkUpdate}
                    className='space-x-1'
                  >
                    <span>{t('update_products')} ({selectedProducts.length})</span>
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={cancelInlineEdit}
                    className='space-x-1'
                  >
                    <span>{t('cancel')}</span>
                  </Button>
                </>
              )}
              <ProductPrimaryButtons />
            </div>
          </div>
          <Input
            placeholder={t('search_products')}
            className='h-8 w-[150px] lg:w-[250px]'
            value={search ?? ''}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
            {
              loading ? (
                <div className='flex h-[50vh] items-center justify-center'><Loader2 className='animate-spin size-8' /></div>
              ) : (
                <ProductTable
                  data={products}
                  columns={columns}
                  paggination={{ totalPage, currentPage, setCurrentPage, limit, setLimit }}
                  onSelectedRowsChange={handleSelectedRowsChange}
                  inlineEditMode={inlineEditMode}
                  editValues={editValues}
                  onEditValueChange={handleEditValueChange}
                />
              )
            }
          </div>
        </Main>

        <ProductDialogs setFetch={setFetch} />
      </div>
    </ProductsProvider>
  )
}
