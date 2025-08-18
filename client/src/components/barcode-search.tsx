import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, Package, AlertCircle, CheckCircle } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useSelector, useDispatch } from 'react-redux'
import { RootState, AppDispatch } from '@/stores/store'
import { fetchProducts } from '@/stores/product.slice'
import { Product } from '@/features/products/data/schema'
import BarcodeInput from './barcode-input'
import { toast } from 'sonner'

interface BarcodeSearchProps {
  onProductFound?: (product: Product) => void
  onProductNotFound?: (barcode: string) => void
}

export function BarcodeSearch({ onProductFound, onProductNotFound }: BarcodeSearchProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const { products } = useSelector((state: RootState) => state.product)
  const [searchResult, setSearchResult] = useState<Product | null>(null)
  const [searchedBarcode, setSearchedBarcode] = useState<string>('')
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(false)

  const searchByBarcode = async (barcode: string) => {
    setSearchedBarcode(barcode)
    setNotFound(false)
    setSearchResult(null)
    setLoading(true)

    // First try to find in current loaded products
    const foundProduct = products.find(p => p.barcode === barcode)
    
    if (foundProduct) {
      setSearchResult(foundProduct)
      onProductFound?.(foundProduct)
      toast.success(`${t('product_found')}: ${foundProduct.name}`)
      setLoading(false)
      return
    }

    // If not found in current products, fetch all products and search
    try {
      const result = await dispatch(fetchProducts({ page: 1, pageSize: 1000 })).unwrap()
      const allProducts = result.results || []
      const product = allProducts.find((p: Product) => p.barcode === barcode)
      
      if (product) {
        setSearchResult(product)
        onProductFound?.(product)
        toast.success(`${t('product_found')}: ${product.name}`)
      } else {
        setNotFound(true)
        onProductNotFound?.(barcode)
        toast.error(`${t('product_not_found')}: ${barcode}`)
      }
    } catch (error) {
      console.error('Error searching products:', error)
      toast.error(t('search_error'))
    } finally {
      setLoading(false)
    }
  }

  const handleManualSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const barcode = formData.get('barcode') as string
    if (barcode?.trim()) {
      searchByBarcode(barcode.trim())
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t('barcode_product_search')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Manual Search Form */}
          <form onSubmit={handleManualSearch} className="flex gap-2">
            <Input
              name="barcode"
              placeholder={t('enter_barcode_to_search')}
              className="flex-1 font-mono"
              autoComplete="off"
            />
            <Button type="submit" variant="outline" disabled={loading}>
              <Search className="h-4 w-4" />
            </Button>
            <BarcodeInput
              onBarcodeEntered={searchByBarcode}
              trigger={
                <Button type="button" variant="outline" disabled={loading}>
                  <Package className="h-4 w-4" />
                </Button>
              }
            />
          </form>

          {/* Search Results */}
          {searchResult && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-green-900">{searchResult.name}</h3>
                    <p className="text-sm text-green-700 mt-1">{searchResult.description}</p>
                    <div className="flex gap-4 mt-2 text-sm">
                      <div>
                        <span className="text-green-600">{t('barcode')}:</span>
                        <span className="ml-1 font-mono">{searchResult.barcode}</span>
                      </div>
                      <div>
                        <span className="text-green-600">{t('price')}:</span>
                        <span className="ml-1">${searchResult.price}</span>
                      </div>
                      <div>
                        <span className="text-green-600">{t('stock_quantity')}:</span>
                        <Badge variant="outline" className="ml-1">
                          {searchResult.stockQuantity}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {notFound && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900">{t('product_not_found')}</h3>
                    <p className="text-sm text-red-700 mt-1">
                      {t('no_product_with_barcode')}: <span className="font-mono">{searchedBarcode}</span>
                    </p>
                    <p className="text-xs text-red-600 mt-2">
                      {t('consider_adding_new_product')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default BarcodeSearch
