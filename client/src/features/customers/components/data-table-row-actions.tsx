import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { Row } from '@tanstack/react-table'
import { IconEdit, IconTrash } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCustomers } from '../context/users-context'
import { User } from '../data/schema'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useState } from 'react'
import { CalendarClock, History, ShieldAlert, TrendingUp } from 'lucide-react'
import { CustomerCreditQuickDialog, type CreditQuickAction } from '../credit/customer-credit-quick-dialog'

interface DataTableRowActionsProps {
  row: Row<User>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const { setOpen, setCurrentRow } = useCustomers()
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  
  const canEdit = hasPermission('editCustomers' as any)
  const canDelete = hasPermission('deleteCustomers' as any)
  const canManageCredit = hasPermission('manageCreditLimits')
  const canSeeCredit = canManageCredit || hasPermission('viewCustomers')
  const [creditAction, setCreditAction] = useState<CreditQuickAction | null>(null)
  const customerId = String(row.original._id || row.original.id || '')

  // Don't show actions menu if user has no permissions
  if (!canEdit && !canDelete && !canSeeCredit) {
    return null
  }
  
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='data-[state=open]:bg-muted flex h-8 w-8 p-0'
            onClick={(e) => e.stopPropagation()}
          >
            <DotsHorizontalIcon className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[210px]'>
          {canEdit && (
            <DropdownMenuItem
              onClick={() => {
                setCurrentRow(row.original)
                setOpen('edit')
              }}
            >
              {t('edit')}
              <DropdownMenuShortcut>
                <IconEdit size={16} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          {canManageCredit && (
            <>
              {canEdit && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={() => setCreditAction('increase')}>
                {t('Increase credit limit')}
                <DropdownMenuShortcut>
                  <TrendingUp size={16} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreditAction('temporary')}>
                {t('Temporary limit')}
                <DropdownMenuShortcut>
                  <CalendarClock size={16} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreditAction('hold')}>
                {row.original.creditHold ? t('Release credit hold') : t('Credit hold')}
                <DropdownMenuShortcut>
                  <ShieldAlert size={16} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            </>
          )}
          {canSeeCredit && (
            <DropdownMenuItem onClick={() => setCreditAction('history')}>
              {t('Credit history')}
              <DropdownMenuShortcut>
                <History size={16} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          {(canEdit || canSeeCredit) && canDelete && <DropdownMenuSeparator />}
          {canDelete && (
            <DropdownMenuItem
              onClick={() => {
                setCurrentRow(row.original)
                setOpen('delete')
              }}
              className='text-red-500!'
            >
              {t('delete')}
              <DropdownMenuShortcut>
                <IconTrash size={16} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {creditAction && customerId && (
        <CustomerCreditQuickDialog
          customerId={customerId}
          customerName={row.original.name}
          action={creditAction}
          onClose={() => setCreditAction(null)}
        />
      )}
    </>
  )
}
