import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useLanguage } from '@/context/language-context'
import { Package, Zap, ShoppingCart, BarChart3 } from 'lucide-react'
import BarcodeSearch from '@/components/barcode-search'
import BarcodeInput from '@/components/barcode-input'
import SimpleBarcodeScanner from '@/components/simple-barcode-scanner'
import { Product } from '@/features/products/data/schema'

// Extend Product type to include quantity for cart functionality
type CartProduct = Product & {
  quantity?: number
}

export default function BarcodeDemo() {
  const { t } = useLanguage()
  const [scannedProducts, setScannedProducts] = useState<CartProduct[]>([])
  const [currentBarcode, setCurrentBarcode] = useState<string>('')

  const handleProductFound = (product: Product) => {
    setScannedProducts(prev => {
      const exists = prev.find(p => p.id === product.id)
      if (exists) {
        return prev.map(p => 
          p.id === product.id 
            ? { ...p, quantity: (p.quantity || 1) + 1 }
            : p
        )
      }
      return [...prev, { ...product, quantity: 1 }]
    })
  }

  const handleProductNotFound = (barcode: string) => {
    console.log('Product not found for barcode:', barcode)
  }

  const handleBarcodeScanned = (barcode: string) => {
    setCurrentBarcode(barcode)
    // Auto-search when barcode is scanned
    // The BarcodeSearch component will handle the search
  }

  const totalValue = scannedProducts.reduce((sum, product) => 
    sum + (product.price * (product.quantity || 1)), 0
  )

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Package className="h-8 w-8" />
          {t('barcode_inventory_system')}
        </h1>
        <p className="text-gray-600">
          Complete barcode scanning solution for inventory management
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Barcode Scanning Section */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                {t('barcode_scanning_options')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Method 1: Hardware Barcode Scanner */}
              <div className="space-y-2">
                <h3 className="font-semibold">{t('hardware_scanner')}</h3>
                <p className="text-sm text-gray-600">{t('use_dedicated_scanner_gun')}</p>
                <BarcodeInput
                  onBarcodeEntered={handleBarcodeScanned}
                  placeholder={t('scan_with_barcode_gun')}
                />
              </div>

              <Separator />

              {/* Method 2: Camera Scanner */}
              <div className="space-y-2">
                <h3 className="font-semibold">{t('camera_scanner')}</h3>
                <p className="text-sm text-gray-600">{t('use_device_camera')}</p>
                <SimpleBarcodeScanner
                  onScanResult={handleBarcodeScanned}
                  trigger={
                    <Button className="w-full">
                      <Zap className="h-4 w-4 mr-2" />
                      {t('scan_with_camera')}
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Product Search */}
          <BarcodeSearch
            onProductFound={handleProductFound}
            onProductNotFound={handleProductNotFound}
          />
        </div>

        {/* Scanned Products Section */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                {t('scanned_products')} ({scannedProducts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {scannedProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('no_products_scanned_yet')}</p>
                  <p className="text-sm">{t('scan_barcode_to_add_products')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {scannedProducts.map((product, index) => (
                    <div
                      key={`${product.id}-${index}`}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium">{product.name}</h4>
                        <p className="text-sm text-gray-600">{product.description}</p>
                        {product.barcode && (
                          <p className="text-xs font-mono text-blue-600">
                            {t('barcode')}: {product.barcode}
                          </p>
                        )}
                      </div>
                      <div className="text-right space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            Qty: {product.quantity || 1}
                          </Badge>
                          <span className="font-medium">
                            ${(product.price * (product.quantity || 1)).toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          ${product.price} {t('each')}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  <Separator />
                  
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                    <span className="font-semibold">{t('total_value')}:</span>
                    <span className="text-xl font-bold text-blue-600">
                      ${totalValue.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Current Barcode Display */}
          {currentBarcode && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  {t('last_scanned_barcode')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">{t('barcode')}:</p>
                  <p className="text-xl font-mono font-bold text-green-700">
                    {currentBarcode}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Implementation Guide */}
      <Card>
        <CardHeader>
          <CardTitle>{t('implementation_guide')}</CardTitle>
        </CardHeader>
        <CardContent className="prose max-w-none">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h3 className="font-semibold text-blue-600">{t('hardware_solution')}</h3>
              <ul className="text-sm space-y-1 text-gray-600">
                <li>• USB/Bluetooth barcode scanners</li>
                <li>• Works like keyboard input</li>
                <li>• No additional software needed</li>
                <li>• Most reliable option</li>
                <li>• Best for high-volume scanning</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold text-green-600">{t('camera_solution')}</h3>
              <ul className="text-sm space-y-1 text-gray-600">
                <li>• Uses device camera</li>
                <li>• Works on mobile devices</li>
                <li>• No additional hardware</li>
                <li>• Good for occasional scanning</li>
                <li>• Requires good lighting</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold text-purple-600">{t('manual_entry')}</h3>
              <ul className="text-sm space-y-1 text-gray-600">
                <li>• Type barcodes manually</li>
                <li>• Backup option</li>
                <li>• Works everywhere</li>
                <li>• Good for damaged barcodes</li>
                <li>• Slowest method</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
