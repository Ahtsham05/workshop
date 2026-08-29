import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/context/language-context';
import { AlertTriangle, Package, Bell, BellOff, Settings } from 'lucide-react';
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
import { getDisplayStock } from '@/lib/product-stock-display';

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
    return products.filter(product => {
      const stock = getDisplayStock(product)
      return stock <= threshold && stock > 0
    });
  }, [products, threshold]);

  // Calculate out of stock products
  const outOfStockProducts = useMemo(() => {
    return products.filter(product => getDisplayStock(product) === 0);
  }, [products]);

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
      <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
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

  // Counts (Out of Stock / Low Stock / Critical Stock) already surface as their own
  // stat cards above this banner — see ProductStatCards — so this banner's only job now
  // is to call out the most urgent case (out-of-stock products) with a "View All" link
  // into the fuller LowStockDetails breakdown, rather than repeating every count here.
  if (outOfStockProducts.length === 0) {
    if (lowStockProducts.length === 0) return null
    return (
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">
              {lowStockProducts.length} {t('low_stock_products')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-primary">{t('View All')}</span>
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setShowSettings(true) }}>
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <CardTitle className="text-lg text-red-700 dark:text-red-400">{t('out_of_stock_products')}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-primary">{t('View All')}</span>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); toggleAlerts() }}>
                <BellOff className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setShowSettings(true) }}>
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {outOfStockProducts.slice(0, 3).map((product) => (
              <Badge key={product._id || product.id} variant="destructive">
                {product.name}
              </Badge>
            ))}
            {outOfStockProducts.length > 3 && (
              <span className="text-sm italic text-red-600 dark:text-red-400">
                {`${t('and')} ${outOfStockProducts.length - 3} ${t('more')}...`}
              </span>
            )}
          </div>
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
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('alert_when_stock_below_threshold')}
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/40 rounded-lg">
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
