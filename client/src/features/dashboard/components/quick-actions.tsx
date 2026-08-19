import { isPast, isToday } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  ShoppingCart,
  Package,
  BarChart3,
  Users,
  Truck,
  Receipt,
  Smartphone,
  Wallet,
  Wrench,
  Signal,
  Banknote,
  Target,
  AlarmClock,
  ClipboardList,
  HandCoins,
  Landmark,
  ClipboardEdit,
  Handshake,
} from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useNavigate } from '@tanstack/react-router'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { isMobileShopBusiness } from '@/lib/business-types'
import { useRemindersFeed } from '@/hooks/use-reminders-feed'

export function QuickActions() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const isMobileShop = isMobileShopBusiness(org?.businessType || user?.businessType)

  // Reuses the one shared reminders poll (see reminders-nav-badge.tsx) — never call
  // useGetRemindersQuery directly, or this becomes a second independent poll timer.
  const { active: activeReminders } = useRemindersFeed()
  const dueTodayCount = activeReminders.filter((r) => {
    const due = new Date(r.dueAt)
    return isToday(due) || isPast(due)
  }).length

  const mobileShopActions = [
    {
      icon: <Smartphone className='h-5 w-5' />,
      label: t('Load Management'),
      onClick: () => navigate({ to: '/mobile-shop/load' }),
      color: 'bg-purple-500 hover:bg-purple-600',
    },
    {
      icon: <Wallet className='h-5 w-5' />,
      label: t('Cash Management'),
      onClick: () => navigate({ to: '/mobile-shop/cash-management' }),
      color: 'bg-orange-500 hover:bg-orange-600',
    },
    {
      icon: <Signal className='h-5 w-5' />,
      label: t('Sim Sale'),
      onClick: () => navigate({ to: '/mobile-shop/sim-sale' }),
      color: 'bg-teal-500 hover:bg-teal-600',
    },
    {
      icon: <Receipt className='h-5 w-5' />,
      label: t('Bill Payments'),
      onClick: () => navigate({ to: '/mobile-shop/bill-payments' }),
      color: 'bg-pink-500 hover:bg-pink-600',
    },
    {
      icon: <Wrench className='h-5 w-5' />,
      label: t('Services'),
      onClick: () => navigate({ to: '/mobile-shop/services' }),
      color: 'bg-cyan-500 hover:bg-cyan-600',
    },
    {
      icon: <Smartphone className='h-5 w-5' />,
      label: t('Mobile Phones'),
      onClick: () => navigate({ to: '/mobile-shop/used-phones' }),
      color: 'bg-indigo-500 hover:bg-indigo-600',
    },
    {
      icon: <Banknote className='h-5 w-5' />,
      label: t('Track Cash'),
      onClick: () => navigate({ to: '/cash-register' }),
      color: 'bg-rose-500 hover:bg-rose-600',
    },
  ]

  const defaultActions = [
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

  const usefulActions = [
    {
      icon: <Target className='h-5 w-5' />,
      label: t('Leads'),
      onClick: () => navigate({ to: '/leads' }),
      color: 'bg-violet-500 hover:bg-violet-600',
    },
    {
      icon: <AlarmClock className='h-5 w-5' />,
      label: t('Tasks & Reminders'),
      onClick: () => navigate({ to: '/reminders' }),
      color: 'bg-amber-500 hover:bg-amber-600',
      badge: dueTodayCount > 0 ? dueTodayCount : undefined,
    },
    {
      icon: <ClipboardList className='h-5 w-5' />,
      label: t('Purchase Orders'),
      onClick: () => navigate({ to: '/purchase-orders' }),
      color: 'bg-sky-500 hover:bg-sky-600',
    },
    {
      icon: <HandCoins className='h-5 w-5' />,
      label: t('Payments & Receipts'),
      onClick: () => navigate({ to: '/payment-vouchers' }),
      color: 'bg-emerald-500 hover:bg-emerald-600',
    },
    {
      icon: <Landmark className='h-5 w-5' />,
      label: t('Bank Accounts'),
      onClick: () => navigate({ to: '/mobile-shop/wallet' }),
      color: 'bg-fuchsia-500 hover:bg-fuchsia-600',
    },
    {
      icon: <ClipboardEdit className='h-5 w-5' />,
      label: t('Stock Adjustments'),
      onClick: () => navigate({ to: '/stock-adjustments' }),
      color: 'bg-slate-500 hover:bg-slate-600',
    },
    {
      icon: <Handshake className='h-5 w-5' />,
      label: t('Salesmen'),
      onClick: () => navigate({ to: '/salesmen' }),
      color: 'bg-lime-500 hover:bg-lime-600',
    },
  ]

  const renderRow = (actions: (typeof defaultActions[number] & { badge?: number })[]) => (
    <div className='flex flex-wrap gap-3 sm:gap-4'>
      {actions.map((action, index) => (
        <Button
          key={index}
          onClick={action.onClick}
          className={`h-auto min-h-24 flex-[1_1_6.5rem] flex-col gap-2 py-3 text-white ${action.color}`}
          variant='default'
        >
          {action.icon}
          <span className='flex items-center justify-center gap-1.5 text-wrap text-center text-sm font-medium'>
            {action.label}
            {!!action.badge && (
              <Badge className='rounded-full border border-white/40 bg-red-500 px-1.5 py-0 text-[10px] font-semibold text-white hover:bg-red-500'>
                {action.badge > 99 ? '99+' : action.badge}
              </Badge>
            )}
          </span>
        </Button>
      ))}
    </div>
  )

  return (
    <Card>
      <CardContent className='flex flex-col gap-4 pt-6'>
        {renderRow(defaultActions)}
        {isMobileShop && renderRow(mobileShopActions)}
        {renderRow(usefulActions)}
      </CardContent>
    </Card>
  )
}
