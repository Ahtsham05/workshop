import { useState, useEffect, useMemo, type ReactNode } from 'react';
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
import { getDisplayStock, getStockStatus } from '@/lib/product-stock-display';

export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

interface LowStockAlertProps {
  products: Product[];
  /** Store-wide defaults, owned by the Products page (index.tsx) — this component only
   *  edits them via onThresholdsSave, it doesn't keep its own copy, so every other view
   *  reading the same state (table badges, stat cards) stays in sync the moment Save is
   *  clicked, no page reload needed. */
  lowStockThreshold: number;
  criticalStockThreshold: number | null;
  onThresholdsSave: (values: { lowStockThreshold: number; criticalStockThreshold: number | null }) => void;
  loading?: boolean;
}

export function LowStockAlert({
  products,
  lowStockThreshold,
  criticalStockThreshold,
  onThresholdsSave,
  loading = false,
}: LowStockAlertProps) {
  const { t } = useLanguage();
  const [showSettings, setShowSettings] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [tempLow, setTempLow] = useState(String(lowStockThreshold));
  const [tempCritical, setTempCritical] = useState(criticalStockThreshold != null ? String(criticalStockThreshold) : '');

  // Load the notifications toggle (the one setting still local to this banner) from
  // localStorage — thresholds themselves are owned/persisted by the parent page.
  useEffect(() => {
    const savedAlertsEnabled = localStorage.getItem('lowStockAlertsEnabled');
    if (savedAlertsEnabled !== null) {
      setAlertsEnabled(savedAlertsEnabled === 'true');
    }
  }, []);

  const defaultCriticalPreview = Math.floor(lowStockThreshold / 2);

  const openSettings = () => {
    setTempLow(String(lowStockThreshold));
    setTempCritical(criticalStockThreshold != null ? String(criticalStockThreshold) : '');
    setShowSettings(true);
  };

  // Calculate low stock products (covers both the Low Stock and Critical Stock tiers —
  // this banner only distinguishes "out of stock" from "needs attention").
  const lowStockProducts = useMemo(() => {
    return products.filter(product => {
      const status = getStockStatus(product, lowStockThreshold, criticalStockThreshold)
      return status === 'low_stock' || status === 'critical_stock'
    });
  }, [products, lowStockThreshold, criticalStockThreshold]);

  // Calculate out of stock products
  const outOfStockProducts = useMemo(() => {
    return products.filter(product => getDisplayStock(product) === 0);
  }, [products]);

  const tempLowValue = tempLow.trim() === '' ? NaN : Number(tempLow);
  const tempCriticalValue = tempCritical.trim() === '' ? null : Number(tempCritical);
  const isTempInvalid = !Number.isFinite(tempLowValue) || tempLowValue < 1 ||
    (tempCriticalValue != null && tempCriticalValue > tempLowValue);

  const handleSaveSettings = () => {
    if (isTempInvalid) return;
    onThresholdsSave({ lowStockThreshold: tempLowValue, criticalStockThreshold: tempCriticalValue });
    localStorage.setItem('lowStockAlertsEnabled', alertsEnabled.toString());
    setShowSettings(false);
  };

  const handleResetToDefault = () => {
    onThresholdsSave({ lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD, criticalStockThreshold: null });
    setTempLow(String(DEFAULT_LOW_STOCK_THRESHOLD));
    setTempCritical('');
  };

  const toggleAlerts = () => {
    const newState = !alertsEnabled;
    setAlertsEnabled(newState);
    localStorage.setItem('lowStockAlertsEnabled', newState.toString());
  };

  const hasCustomDefaults = lowStockThreshold !== DEFAULT_LOW_STOCK_THRESHOLD || criticalStockThreshold != null;

  // Settings dialog is mounted once regardless of which banner variant renders below —
  // each variant's gear icon just flips `showSettings`, so every state (well-stocked,
  // low-stock-only, out-of-stock) can actually open it.
  const settingsDialog = (
    // Radix portals the Dialog's overlay/content straight to document.body, but React
    // still walks the *component* tree (not the DOM tree) for event bubbling — so
    // without this wrapper, every click in the dialog (typing in an input, clicking the
    // backdrop to close, hitting Save) bubbles up through LowStockAlert to the "click
    // card to view details" wrapper around it in index.tsx and immediately navigates
    // away mid-edit.
    <div onClick={(e) => e.stopPropagation()}>
    <Dialog open={showSettings} onOpenChange={setShowSettings}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('low_stock_alert_settings')}</DialogTitle>
          <DialogDescription>
            {t('Set the store-wide default used for every product that has no threshold of its own.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="threshold">{t('low_stock_threshold')}</Label>
            <Input
              id="threshold"
              type="number"
              min="1"
              value={tempLow}
              onChange={(e) => setTempLow(e.target.value)}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('alert_when_stock_below_threshold')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="critical-threshold">{t('Critical Stock Threshold')}</Label>
            <Input
              id="critical-threshold"
              type="number"
              min="0"
              placeholder={`${t('Auto')}: ${defaultCriticalPreview}`}
              value={tempCritical}
              onChange={(e) => setTempCritical(e.target.value)}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('Leave blank to use half of the low stock threshold automatically.')}
            </p>
            {tempCriticalValue != null && Number.isFinite(tempLowValue) && tempCriticalValue > tempLowValue && (
              <p className="text-sm text-destructive">
                {t('Critical threshold cannot be higher than the low stock threshold.')}
              </p>
            )}
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
        <div className="flex items-center justify-between gap-2">
          {hasCustomDefaults ? (
            <Button variant="outline" onClick={handleResetToDefault}>
              {t('Reset to default')}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSaveSettings} disabled={isTempInvalid}>
              {t('save_settings')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </div>
  );

  let banner: ReactNode;

  if (loading) {
    banner = (
      <Card className="border-gray-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-gray-500">
            <Package className="w-5 h-5 animate-pulse" />
            <span>{t('Loading Stock Information...') || 'Loading stock information...'}</span>
          </div>
        </CardContent>
      </Card>
    );
  } else if (!alertsEnabled) {
    banner = (
      <Card className="border-gray-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-500">
              <BellOff className="w-5 h-5" />
              <span>{t('low_stock_alerts_disabled')}</span>
            </div>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); toggleAlerts() }}>
              <Bell className="w-4 h-4 mr-2" />
              {t('enable_alerts')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  } else if (lowStockProducts.length === 0 && outOfStockProducts.length === 0) {
    banner = (
      <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <Package className="w-5 h-5" />
              <span>{t('all_products_well_stocked')}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openSettings() }}>
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  } else if (outOfStockProducts.length === 0) {
    // Counts (Out of Stock / Low Stock / Critical Stock) already surface as their own
    // stat cards above this banner — see ProductStatCards — so this banner's only job now
    // is to call out the most urgent case (out-of-stock products) with a "View All" link
    // into the fuller LowStockDetails breakdown, rather than repeating every count here.
    banner = (
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
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openSettings() }}>
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  } else {
    banner = (
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
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openSettings() }}>
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
    );
  }

  return (
    <>
      {banner}
      {settingsDialog}
    </>
  );
}
