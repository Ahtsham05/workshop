import { RestaurantShell } from '@/features/restaurant/shell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@tanstack/react-router'
import { Tags, Package } from 'lucide-react'

export default function RestaurantMenuHubPage() {
  return (
    <RestaurantShell
      title='Menu & inventory'
      description='Manage categories, selling prices, and recipe-linked stock items for your menu.'
    >
      <div className='grid max-w-3xl gap-4 md:grid-cols-2'>
        <Card className='transition-colors hover:border-primary/40'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <Tags className='h-5 w-5' />
              Categories
            </CardTitle>
            <CardDescription>
              Starters, mains, beverages, modifiers — keep your menu organised for POS and QR ordering.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to='/categories'
              className='text-sm font-medium text-primary underline-offset-4 hover:underline'
            >
              Open categories →
            </Link>
          </CardContent>
        </Card>
        <Card className='transition-colors hover:border-primary/40'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <Package className='h-5 w-5' />
              Menu items (products)
            </CardTitle>
            <CardDescription>
              Each dish or drink is a product with price, tax behaviour, and optional recipe costing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to='/products'
              className='text-sm font-medium text-primary underline-offset-4 hover:underline'
            >
              Open products →
            </Link>
          </CardContent>
        </Card>
      </div>
    </RestaurantShell>
  )
}
