import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/context/language-context';
import { AlertTriangle, Package, Search, ArrowLeft, TrendingDown, Download } from 'lucide-react';
import { Product } from '../data/schema';
import { getDisplayStock, formatDisplayPrice } from '@/lib/product-stock-display';
import { useExpiringBatchesByProduct, daysUntil } from '../hooks/use-expiring-batches-by-product';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LowStockDetailsProps {
  products: Product[];
  onBack?: () => void;
  threshold?: number;
}

export function LowStockDetails({ products, onBack, threshold = 10 }: LowStockDetailsProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'out_of_stock' | 'critical' | 'low'>('all');
  const expiringByProduct = useExpiringBatchesByProduct();

  // Calculate stock levels
  const stockLevels = useMemo(() => {
    const outOfStock = products.filter(p => getDisplayStock(p) === 0);
    const critical = products.filter(p => getDisplayStock(p) > 0 && getDisplayStock(p) <= Math.floor(threshold / 2));
    const low = products.filter(p => getDisplayStock(p) > Math.floor(threshold / 2) && getDisplayStock(p) <= threshold);

    return { outOfStock, critical, low };
  }, [products, threshold]);

  // Filter and search products
  const filteredProducts = useMemo(() => {
    let filtered: Product[] = [];
    
    switch (filterType) {
      case 'out_of_stock':
        filtered = stockLevels.outOfStock;
        break;
      case 'critical':
        filtered = stockLevels.critical;
        break;
      case 'low':
        filtered = stockLevels.low;
        break;
      default:
        filtered = [...stockLevels.outOfStock, ...stockLevels.critical, ...stockLevels.low];
    }

    if (search) {
      filtered = filtered.filter(product =>
        (product.name || '').toLowerCase().includes(search.toLowerCase()) ||
        product.barcode?.toLowerCase().includes(search.toLowerCase())
      );
    }

    return filtered.sort((a, b) => getDisplayStock(a) - getDisplayStock(b));
  }, [stockLevels, filterType, search]);

  const getStockBadge = (quantity: number) => {
    if (quantity === 0) {
      return <Badge variant="destructive">{t('out_of_stock')}</Badge>;
    }
    if (quantity <= Math.floor(threshold / 2)) {
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{t('critical')}</Badge>;
    }
    return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">{t('low_stock')}</Badge>;
  };

  const exportToCSV = () => {
    const headers = ['Product Name', 'Barcode', 'Current Stock', 'Sale Price', 'Purchase Price', 'Status'];
    const rows = filteredProducts.map(product => [
      product.name,
      product.barcode || '-',
      getDisplayStock(product),
      formatDisplayPrice(product, 'price'),
      formatDisplayPrice(product, 'cost'),
      getDisplayStock(product) === 0 ? 'Out of Stock' :
        getDisplayStock(product) <= Math.floor(threshold / 2) ? 'Critical' : 'Low Stock'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `low-stock-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('back')}
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="outline" onClick={exportToCSV}>
          <Download className="w-4 h-4 mr-2" />
          {t('export_csv')}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-700 flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              {t('out_of_stock')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stockLevels.outOfStock.length}</div>
            <p className="text-xs text-gray-500 mt-1">{t('products_need_immediate_restock')}</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {t('critical_stock')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stockLevels.critical.length}</div>
            <p className="text-xs text-gray-500 mt-1">{`${t('less_than')} ${Math.floor(threshold / 2)} ${t('units')}`}</p>
          </CardContent>
        </Card>

        <Card className="border-yellow-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-yellow-700 flex items-center gap-2">
              <Package className="w-4 h-4" />
              {t('low_stock')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{stockLevels.low.length}</div>
            <p className="text-xs text-gray-500 mt-1">{t('below_threshold')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>{t('low_stock_products')}</CardTitle>
          <CardDescription>{t('products_requiring_restock')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={t('search_by_name_or_barcode')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('filter_by_status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="out_of_stock">{t('out_of_stock')}</SelectItem>
                <SelectItem value="critical">{t('critical')}</SelectItem>
                <SelectItem value="low">{t('low_stock')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Products Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('product')}</TableHead>
                  <TableHead>{t('barcode')}</TableHead>
                  <TableHead className="text-right">{t('current_stock')}</TableHead>
                  <TableHead className="text-right">{t('price')}</TableHead>
                  <TableHead className="text-right">{t('cost')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('expiry') || 'Expiry'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                      {search ? t('no_products_found') : t('no_low_stock_products')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => {
                    const expiry = expiringByProduct.get((product._id || product.id || '').toString())
                    return (
                    <TableRow key={product._id || product.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {product.image?.url && (
                            <img
                              src={product.image.url}
                              alt={product.name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          )}
                          <span className="font-medium">{product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600">{product.barcode || '-'}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold ${
                          getDisplayStock(product) === 0 ? 'text-red-600' :
                          getDisplayStock(product) <= Math.floor(threshold / 2) ? 'text-orange-600' :
                          'text-yellow-600'
                        }`}>
                          {getDisplayStock(product)} {product.unit || 'pcs'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">Rs{formatDisplayPrice(product, 'price')}</TableCell>
                      <TableCell className="text-right">Rs{formatDisplayPrice(product, 'cost')}</TableCell>
                      <TableCell>{getStockBadge(getDisplayStock(product))}</TableCell>
                      <TableCell>
                        {expiry ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            {daysUntil(expiry)}d
                          </Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {filteredProducts.length > 0 && (
            <div className="text-sm text-gray-500 text-center">
              {`${t('showing')} ${filteredProducts.length} ${t('products')}`}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
