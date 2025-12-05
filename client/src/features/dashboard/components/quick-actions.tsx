import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, ShoppingCart, Package, BarChart3 } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useNavigate } from '@tanstack/react-router'

export function QuickActions() {
  const { t } = useLanguage()
  const navigate = useNavigate()

  const actions = [
    {
      icon: <FileText className='h-5 w-5' />,
      label: t('Create Invoice'),
      onClick: () => navigate({ to: '/invoice' }),
      color: 'bg-blue-500 hover:bg-blue-600',
    },
    {
      icon: <ShoppingCart className='h-5 w-5' />,
      label: t('Add Purchase'),
      onClick: () => navigate({ to: '/purchase-invoice' }),
      color: 'bg-green-500 hover:bg-green-600',
    },
    {
      icon: <Package className='h-5 w-5' />,
      label: t('Add Product'),
      onClick: () => navigate({ to: '/products' }),
      color: 'bg-purple-500 hover:bg-purple-600',
    },
    {
      icon: <BarChart3 className='h-5 w-5' />,
      label: t('View Reports'),
      onClick: () => navigate({ to: '/' }),
      color: 'bg-orange-500 hover:bg-orange-600',
    },
  ]

  return (
    <Card>
      <CardContent className='pt-6'>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
          {actions.map((action, index) => (
            <Button
              key={index}
              onClick={action.onClick}
              className={`h-24 flex-col gap-2 text-white ${action.color}`}
              variant='default'
            >
              {action.icon}
              <span className='text-sm font-medium'>{action.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
