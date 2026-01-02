import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
// import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Search,
    //  Plus, 
     Package, Scan, Image as ImageIcon, List, History } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useLanguage } from '@/context/language-context'
import { Category, Product } from '../index'
import { Loader2 } from 'lucide-react'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { getTextClasses } from '@/utils/urdu-text-utils'
import { toast } from 'sonner'
import { ProductHistoryDialog } from './product-history-dialog'

interface ProductCatalogProps {
  categorizedProducts: Category[]
  loading: boolean
  showImages: boolean
  setShowImages: (show: boolean) => void
  searchTerm: string
  setSearchTerm: (term: string) => void
  onAddToInvoice: (product: Product, quantity?: number) => void
  onBarcodeSearch: (barcode: string) => void
  selectedCustomerId?: string
  selectedCustomerName?: string
}

export function ProductCatalog({
  categorizedProducts,
  loading,
  showImages,
  setShowImages,
  searchTerm,
  setSearchTerm,
  onAddToInvoice,
  onBarcodeSearch,
  selectedCustomerId,
  selectedCustomerName
}: ProductCatalogProps) {
  const { t } = useLanguage()
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([])
  const [isBarcodeMode, setIsBarcodeMode] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [historyDialog, setHistoryDialog] = useState<{
    open: boolean
    productId: string
    productName: string
    currentPrice: number
  }>({
    open: false,
    productId: '',
    productName: '',
    currentPrice: 0
  })

  // Get all unique categories for the filter
  const allCategories = categorizedProducts.filter(cat => cat.products.length > 0)

  // Set default selected category to "Other" on first load
  useEffect(() => {
    if (allCategories.length > 0 && !selectedCategoryId) {
      const otherCategory = allCategories.find(cat => cat.name?.toLowerCase() === 'other')
      if (otherCategory) {
        setSelectedCategoryId(otherCategory._id)
      } else {
        setSelectedCategoryId(allCategories[0]._id)
      }
    }
  }, [allCategories, selectedCategoryId])

  // Filter products based on search term and selected category
  useEffect(() => {
    let filtered = categorizedProducts

    // If there's a search term, search globally across all categories
    if (searchTerm.trim()) {
      filtered = categorizedProducts.map(category => ({
        ...category,
        products: category.products.filter(product =>
          (product.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
          (product.barcode?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
          (product.description?.toLowerCase() || '').includes(searchTerm.toLowerCase())
        )
      })).filter(category => category.products.length > 0)
    } else {
      // Only filter by selected category when there's no search term
      if (selectedCategoryId) {
        filtered = categorizedProducts.filter(category => category._id === selectedCategoryId)
      }
    }

    setFilteredCategories(filtered)
  }, [categorizedProducts, searchTerm, selectedCategoryId])

  // Handle search input and barcode detection
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value)
    
    // Auto-detect barcode pattern (typically numbers)
    const isBarcode = /^\d+$/.test(value.trim()) && value.trim().length >= 8
    setIsBarcodeMode(isBarcode)
  }, [setSearchTerm])

  // Handle Enter key for barcode search
  const handleSearchKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchTerm.trim()) {
      // Check if it looks like a barcode
      const isBarcode = /^\d+$/.test(searchTerm.trim())
      if (isBarcode) {
        onBarcodeSearch(searchTerm.trim())
      }
    }
  }, [searchTerm, onBarcodeSearch])

  // Quick add with different quantities
  const handleQuickAdd = useCallback((product: Product, quantity: number = 1) => {
    onAddToInvoice(product, quantity)
  }, [onAddToInvoice])

  const getTotalProducts = () => {
    return filteredCategories.reduce((total, category) => total + category.products.length, 0)
  }

  if (loading) {
    return (
      <Card className='h-full'>
        <CardContent className='flex items-center justify-center h-full'>
          <div className='text-center'>
            <Loader2 className='h-8 w-8 animate-spin mx-auto mb-2' />
            <p>{t('loading_products')}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className='space-y-4 h-full flex flex-col'>
      {/* Header Controls */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Package className='h-5 w-5' />
            {t('product_catalog')}
            <Badge variant="secondary">{getTotalProducts()}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {/* Search Input */}
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              type="text"
              placeholder={isBarcodeMode ? t('scan_or_enter_barcode') : t('search_products')}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyPress={handleSearchKeyPress}
              className={`pl-10 pr-20 ${isBarcodeMode ? 'border-blue-500 bg-blue-50' : ''}`}
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
              <VoiceInputButton 
                onTranscript={(text) => {
                  handleSearchChange(text);
                }}
                size="sm"
              />
              {isBarcodeMode && (
                <Scan className='h-4 w-4 text-blue-500' />
              )}
            </div>
          </div>

          {/* Display Mode Toggle */}
          <div className='flex items-center justify-between'>
            <div className='flex items-center space-x-2'>
              <Switch
                id="show-images"
                checked={showImages}
                onCheckedChange={setShowImages}
              />
              <Label htmlFor="show-images" className='flex items-center gap-2'>
                {showImages ? <ImageIcon className='h-4 w-4' /> : <List className='h-4 w-4' />}
                {showImages ? t('with_images') : t('without_images')}
              </Label>
            </div>
          </div>

          {isBarcodeMode && (
            <div className='bg-blue-50 border border-blue-200 rounded-lg p-3'>
              <p className='text-sm text-blue-700 flex items-center gap-2'>
                <Scan className='h-4 w-4' />
                {t('barcode_mode_active')} - {t('press_enter_to_search')}
              </p>
            </div>
          )}

          {/* Category Filter */}
          <div className='space-y-2'>
            <Label className='text-sm font-medium'>{t('categories')}</Label>
            <div className='flex gap-2 overflow-x-auto pb-2'>
              {allCategories.map((category) => (
                <div
                  key={category._id}
                  onClick={() => setSelectedCategoryId(category._id)}
                  className={`flex-shrink-0 cursor-pointer p-2 rounded-lg border transition-all ${
                    selectedCategoryId === category._id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className='flex flex-col items-center gap-1 min-w-[60px]'>
                    {category.image?.url ? (
                      <img
                        src={category.image.url}
                        alt={category.name}
                        className='w-8 h-8 rounded object-cover'
                      />
                    ) : (
                      <div className='w-8 h-8 rounded bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center'>
                        <Package className='h-4 w-4 text-gray-400' />
                      </div>
                    )}
                    <span className={getTextClasses(category.name, 'text-xs text-center truncate w-full')}>
                      {category.name}
                    </span>
                    <Badge variant="outline" className='text-xs px-1 py-0'>
                      {category.products.length}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Categories */}
      <Card className='flex-1 flex flex-col'>
        <CardContent className='flex-1 overflow-hidden p-3'>
          <div className='h-full overflow-y-auto space-y-4'>
            {filteredCategories.length === 0 ? (
              <div className='text-center text-muted-foreground py-8'>
                <Package className='h-12 w-12 mx-auto mb-4 opacity-50' />
                <p>{searchTerm ? t('no_products_found') : t('no_products_available')}</p>
              </div>
            ) : (
              filteredCategories.map((category) => (
                <div key={category._id} className='space-y-2'>
                  {/* Category Header */}
                  <div className='flex items-center gap-2'>
                    <h3 className={getTextClasses(category.name, 'font-semibold text-base')}>{category.name}</h3>
                    <Badge variant="outline" className='text-xs'>{category.products.length}</Badge>
                  </div>
                  <Separator />

                  {/* Products Grid/List */}
                  <div className={showImages 
                    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2'
                    : 'space-y-1'
                  }>
                    {category.products.map((product) => (
                      <div
                        key={product._id}
                        onClick={() => {
                          if (product.stockQuantity > 0) {
                            handleQuickAdd(product, 1)
                          } else {
                            // Show error toast for out of stock items
                            toast.error(`${product.name} is out of stock`)
                          }
                        }}
                        className={showImages
                          ? `border rounded-lg p-2 space-y-2 transition-shadow bg-white ${
                              product.stockQuantity > 0 
                                ? 'hover:shadow-sm cursor-pointer' 
                                : 'opacity-60 cursor-not-allowed bg-gray-50'
                            }`
                          : `border rounded-lg p-2 flex items-center gap-2 transition-colors ${
                              product.stockQuantity > 0 
                                ? 'hover:bg-muted/30 cursor-pointer' 
                                : 'opacity-60 cursor-not-allowed bg-gray-50'
                            }`
                        }
                      >
                        {/* Product Image */}
                        {showImages && (
                          <div className='aspect-square w-full bg-muted rounded-md overflow-hidden relative'>
                            {product.image?.url ? (
                              <img
                                src={product.image.url}
                                alt={product.name}
                                className='w-full h-full object-cover'
                              />
                            ) : (
                              <div className='w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center'>
                                <Package className='h-8 w-8 text-gray-400' />
                              </div>
                            )}
                            {/* Stock badge overlay */}
                            {product.stockQuantity <= 5 && product.stockQuantity > 0 && (
                              <Badge variant="destructive" className='absolute top-1 right-1 text-xs px-1 py-0'>
                                Low
                              </Badge>
                            )}
                            {product.stockQuantity === 0 && (
                              <Badge variant="secondary" className='absolute top-1 right-1 text-xs px-1 py-0'>
                                Out
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Product Info */}
                        <div className={showImages ? 'space-y-1' : 'flex-1 min-w-0'}>
                          <h4 className={getTextClasses(product.name, `font-medium text-sm ${showImages ? 'text-center truncate' : 'truncate'}`)}>
                            {product.name}
                          </h4>
                          <div className={`flex ${showImages ? 'flex-col items-center gap-0' : 'items-center gap-2'} text-xs text-muted-foreground`}>
                            <span key={`price-${product._id}`} className='font-medium text-foreground text-sm'>
                              Rs{product.price.toFixed(2)}
                            </span>
                            <span key={`stock-${product._id}`}>Stock: {product.stockQuantity}</span>
                            {!showImages && product.barcode && (
                              <span key={`barcode-${product._id}`} className='text-xs bg-muted px-1 py-0.5 rounded'>
                                {product.barcode}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* History Button for selected customer */}
                        {selectedCustomerId && selectedCustomerId !== 'walk-in' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setHistoryDialog({
                                open: true,
                                productId: product._id || product.id,
                                productName: product.name,
                                currentPrice: product.price
                              })
                            }}
                            className={`${showImages ? 'w-full mt-1' : ''} flex items-center justify-center gap-1 p-1.5 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors text-xs`}
                            title={t('view_history')}
                          >
                            <History className="h-3 w-3" />
                            {showImages && <span>{t('view_history')}</span>}
                          </button>
                        )}

                        {/* Action Buttons */}
                        {/* <div 
                          className={showImages 
                            ? 'w-full'
                            : 'flex gap-1'
                          }
                          onClick={(e) => e.stopPropagation()} // Prevent card click when clicking buttons
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleQuickAdd(product, 1)}
                            disabled={product.stockQuantity === 0}
                            className={showImages ? 'w-full h-7 text-xs' : 'h-7 px-2 text-xs'}
                          >
                            <Plus className='h-3 w-3 mr-1' />
                            {showImages ? t('add') : '1'}
                          </Button>
                          
                          {!showImages && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleQuickAdd(product, 5)}
                                disabled={product.stockQuantity < 5}
                                className='h-7 px-2 text-xs'
                              >
                                5
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleQuickAdd(product, 10)}
                                disabled={product.stockQuantity < 10}
                                className='h-7 px-2 text-xs'
                              >
                                10
                              </Button>
                            </>
                          )}
                        </div> */}

                        {/* Stock Warning for list view only */}
                        {!showImages && (
                          <>
                            {product.stockQuantity <= 5 && product.stockQuantity > 0 && (
                              <Badge variant="destructive" className='text-xs px-1 py-0'>
                                {t('low_stock')}
                              </Badge>
                            )}
                            
                            {product.stockQuantity === 0 && (
                              <Badge variant="secondary" className='text-xs px-1 py-0'>
                                {t('out_of_stock')}
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Product History Dialog */}
      {selectedCustomerId && selectedCustomerId !== 'walk-in' && (
        <ProductHistoryDialog
          open={historyDialog.open}
          onOpenChange={(open) => setHistoryDialog(prev => ({ ...prev, open }))}
          customerId={selectedCustomerId}
          productId={historyDialog.productId}
          productName={historyDialog.productName}
          customerName={selectedCustomerName || ''}
          currentPrice={historyDialog.currentPrice}
        />
      )}
    </div>
  )
}
