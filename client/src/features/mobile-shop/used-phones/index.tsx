import { Link } from '@tanstack/react-router'
import { RefreshCw, Sparkles, ArrowRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { MobilePageShell } from '@/features/mobile-shop/components/mobile-page-shell'

export default function UsedPhonesHubPage() {
  return (
    <MobilePageShell
      title='Mobile Phones'
      description='Choose whether you want to work with old (used) phones or brand-new phone stock.'
    >
      <div className='grid max-w-3xl gap-4 sm:grid-cols-2'>
        <Link to='/mobile-shop/used-phones/old-phones' className='block'>
          <Card className='h-full transition-colors hover:border-primary/40 hover:shadow-sm'>
            <CardHeader>
              <span className='mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400'>
                <RefreshCw className='h-5 w-5' />
              </span>
              <CardTitle className='flex items-center justify-between gap-2 text-lg'>
                Old Phones
                <ArrowRight className='h-4 w-4 text-muted-foreground' />
              </CardTitle>
              <CardDescription>
                Buy old/used phones from customers and walk-in sellers, grade their condition, and track them
                through to resale.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link to='/mobile-shop/used-phones/new-phones' className='block'>
          <Card className='h-full transition-colors hover:border-primary/40 hover:shadow-sm'>
            <CardHeader>
              <span className='mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'>
                <Sparkles className='h-5 w-5' />
              </span>
              <CardTitle className='flex items-center justify-between gap-2 text-lg'>
                New Phones
                <ArrowRight className='h-4 w-4 text-muted-foreground' />
              </CardTitle>
              <CardDescription>
                Stock brand-new phones from suppliers and sell them to customers, with full inventory and profit
                tracking.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </MobilePageShell>
  )
}
