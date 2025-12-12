import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, ShoppingCart, Package, BarChart3, Users, Truck, Receipt } from 'lucide-react'
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
      onClick: () => navigate({ to: '/reports' }),
      color: 'bg-orange-500 hover:bg-orange-600',
    },
    {
      icon: <Users className='h-5 w-5' />,
      label: t('Customer Ledgers'),
      onClick: () => navigate({ to: '/accounting', search: { tab: 'customers' } }),
      color: 'bg-cyan-500 hover:bg-cyan-600',
    },
    {
      icon: <Truck className='h-5 w-5' />,
      label: t('Supplier Ledgers'),
      onClick: () => navigate({ to: '/accounting', search: { tab: 'suppliers' } }),
      color: 'bg-teal-500 hover:bg-teal-600',
    },
    {
      icon: <Receipt className='h-5 w-5' />,
      label: t('Expense Management'),
      onClick: () => navigate({ to: '/accounting', search: { tab: 'expenses' } }),
      color: 'bg-pink-500 hover:bg-pink-600',
    },
  ]

  return (
    <Card>
      <CardContent className='pt-6'>
        <div className='grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4'>
          {actions.map((action, index) => (
            <Button
              key={index}
              onClick={action.onClick}
              className={`h-24 flex-col gap-2 text-white ${action.color}`}
              variant='default'
            >
              {action.icon}
              <span className='text-sm font-medium text-wrap text-center'>{action.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
