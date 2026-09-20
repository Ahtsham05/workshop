import { Link } from '@tanstack/react-router'
import { ChevronRight, PackageSearch, Store } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/context/language-context'
import type { OwnProductResult } from '@/stores/priceChecker.api'

interface OwnProductResultsProps {
  products: OwnProductResult[]
  formatMoney: (amount: number) => string
}

export function OwnProductResults({ products, formatMoney }: OwnProductResultsProps) {
  const { t } = useLanguage()

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 space-y-0 px-4 sm:px-6'>
        <CardTitle className='flex items-center gap-2.5 text-base'>
          <span className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400'>
            <Store className='h-4 w-4' />
          </span>
          {t('In Your Catalog')}
        </CardTitle>
        <Link to='/products' className='inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline'>
          {t('View All Products')}
          <ChevronRight className='h-3.5 w-3.5' />
        </Link>
      </CardHeader>
      <CardContent className='px-4 sm:px-6'>
        {products.length === 0 ? (
          <div className='flex flex-col items-center gap-1 py-8 text-center text-sm text-muted-foreground'>
            <PackageSearch className='mb-1 h-6 w-6' />
            <p>{t('No matching product in your catalog')}</p>
            <p className='text-xs'>{t('Try searching with a different name, SKU or barcode.')}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Name')}</TableHead>
                <TableHead className='hidden sm:table-cell'>{t('Barcode')}</TableHead>
                <TableHead className='text-right'>{t('Price')}</TableHead>
                <TableHead className='text-right'>{t('Stock')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product._id || product.id}>
                  <TableCell className='whitespace-normal font-medium'>
                    {product.name}
                    {product.barcode && (
                      <span className='block font-mono text-[11px] font-normal text-muted-foreground sm:hidden'>{product.barcode}</span>
                    )}
                  </TableCell>
                  <TableCell className='hidden font-mono text-xs text-muted-foreground sm:table-cell'>{product.barcode || '—'}</TableCell>
                  <TableCell className='text-right font-semibold'>{formatMoney(product.price)}</TableCell>
                  <TableCell className='text-right'>
                    <Badge variant={product.stockQuantity > 0 ? 'secondary' : 'destructive'}>
                      {product.stockQuantity}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
