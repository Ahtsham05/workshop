import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLanguage } from '@/context/language-context';
import { AlertTriangle, Package, TrendingDown, Bell, BellOff, Settings } from 'lucide-react';
import { Product } from '../data/schema';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LowStockAlertProps {
  products: Product[];
  defaultThreshold?: number;
  loading?: boolean;
}

export function LowStockAlert({ products, defaultThreshold = 10, loading = false }: LowStockAlertProps) {
  const { t } = useLanguage();
  const [threshold, setThreshold] = useState(defaultThreshold);
  const [showSettings, setShowSettings] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [tempThreshold, setTempThreshold] = useState(defaultThreshold);

  // Load settings from localStorage
  useEffect(() => {
    const savedThreshold = localStorage.getItem('lowStockThreshold');
    const savedAlertsEnabled = localStorage.getItem('lowStockAlertsEnabled');
    
    if (savedThreshold) {
      const parsedThreshold = parseInt(savedThreshold);
      setThreshold(parsedThreshold);
      setTempThreshold(parsedThreshold);
    }
    
    if (savedAlertsEnabled !== null) {
      setAlertsEnabled(savedAlertsEnabled === 'true');
    }
  }, []);

  // Calculate low stock products
  const lowStockProducts = useMemo(() => {
    return products.filter(product => 
      product.stockQuantity <= threshold && product.stockQuantity > 0
    );
  }, [products, threshold]);

  // Calculate out of stock products
  const outOfStockProducts = useMemo(() => {
    return products.filter(product => product.stockQuantity === 0);
  }, [products]);

  // Calculate critical stock products (< 50% of threshold)
  const criticalStockProducts = useMemo(() => {
    return products.filter(product => 
      product.stockQuantity > 0 && product.stockQuantity <= Math.floor(threshold / 2)
    );
  }, [products, threshold]);

  const handleSaveSettings = () => {
    setThreshold(tempThreshold);
    localStorage.setItem('lowStockThreshold', tempThreshold.toString());
    localStorage.setItem('lowStockAlertsEnabled', alertsEnabled.toString());
    setShowSettings(false);
  };

  const toggleAlerts = () => {
    const newState = !alertsEnabled;
    setAlertsEnabled(newState);
    localStorage.setItem('lowStockAlertsEnabled', newState.toString());
  };

  // Show loading state
  if (loading) {
    return (
      <Card className="border-gray-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-gray-500">
            <Package className="w-5 h-5 animate-pulse" />
            <span>{t('Loading Stock Information...') || 'Loading stock information...'}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!alertsEnabled) {
    return (
      <Card className="border-gray-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-500">
              <BellOff className="w-5 h-5" />
              <span>{t('low_stock_alerts_disabled')}</span>
            </div>
            <Button variant="outline" size="sm" onClick={toggleAlerts}>
              <Bell className="w-4 h-4 mr-2" />
              {t('enable_alerts')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (lowStockProducts.length === 0 && outOfStockProducts.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-700">
              <Package className="w-5 h-5" />
              <span>{t('all_products_well_stocked')}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <CardTitle className="text-lg">{t('low_stock_alert')}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={toggleAlerts}>
                <BellOff className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <CardDescription>
            {t('products_need_attention')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-3 border border-orange-200">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <TrendingDown className="w-4 h-4" />
                <span className="text-xs font-medium">{t('out_of_stock')}</span>
              </div>
              <div className="text-2xl font-bold">{outOfStockProducts.length}</div>
            </div>
            
            <div className="bg-white rounded-lg p-3 border border-orange-200">
              <div className="flex items-center gap-2 text-orange-600 mb-1">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-medium">{t('critical_stock')}</span>
              </div>
              <div className="text-2xl font-bold">{criticalStockProducts.length}</div>
            </div>
            
            <div className="bg-white rounded-lg p-3 border border-orange-200">
              <div className="flex items-center gap-2 text-yellow-600 mb-1">
                <Package className="w-4 h-4" />
                <span className="text-xs font-medium">{t('low_stock')}</span>
              </div>
              <div className="text-2xl font-bold">{lowStockProducts.length}</div>
            </div>
          </div>

          {/* Out of Stock Products */}
          {outOfStockProducts.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="font-semibold mb-2">{t('out_of_stock_products')}:</div>
                <div className="space-y-1">
                  {outOfStockProducts.slice(0, 3).map((product) => (
                    <div key={product._id || product.id} className="flex items-center justify-between">
                      <span className="text-sm">{product.name}</span>
                      <Badge variant="destructive">{t('out_of_stock')}</Badge>
                    </div>
                  ))}
                  {outOfStockProducts.length > 3 && (
                    <div className="text-sm italic">
                      {`${t('and')} ${outOfStockProducts.length - 3} ${t('more')}...`}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Critical Stock Products */}
          {criticalStockProducts.length > 0 && (
            <Alert>
              <AlertDescription>
                <div className="font-semibold mb-2 text-orange-700">{t('critical_stock_products')}:</div>
                <div className="space-y-1">
                  {criticalStockProducts.slice(0, 3).map((product) => (
                    <div key={product._id || product.id} className="flex items-center justify-between">
                      <span className="text-sm">{product.name}</span>
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        {product.stockQuantity} {t('left')}
                      </Badge>
                    </div>
                  ))}
                  {criticalStockProducts.length > 3 && (
                    <div className="text-sm italic text-gray-600">
                      {`${t('and')} ${criticalStockProducts.length - 3} ${t('more')}...`}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Low Stock Products */}
          {lowStockProducts.length > 0 && criticalStockProducts.length !== lowStockProducts.length && (
            <div>
              <div className="font-medium text-sm mb-2 text-orange-700">{t('low_stock_products')}:</div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {lowStockProducts
                  .filter(p => p.stockQuantity > Math.floor(threshold / 2))
                  .slice(0, 5)
                  .map((product) => (
                    <div key={product._id || product.id} className="flex items-center justify-between bg-white p-2 rounded border border-orange-100">
                      <span className="text-sm">{product.name}</span>
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        {product.stockQuantity} {t('left')}
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('low_stock_alert_settings')}</DialogTitle>
            <DialogDescription>
              {t('configure_low_stock_threshold')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="threshold">{t('low_stock_threshold')}</Label>
              <Input
                id="threshold"
                type="number"
                min="1"
                value={tempThreshold}
                onChange={(e) => setTempThreshold(parseInt(e.target.value) || 1)}
              />
              <p className="text-sm text-gray-500">
                {t('alert_when_stock_below_threshold')}
              </p>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                <span className="text-sm font-medium">{t('enable_notifications')}</span>
              </div>
              <Button
                variant={alertsEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setAlertsEnabled(!alertsEnabled)}
              >
                {alertsEnabled ? t('enabled') : t('disabled')}
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSaveSettings}>
              {t('save_settings')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
