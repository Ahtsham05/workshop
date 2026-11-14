import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Clock,
  CreditCard,
  Download,
  Loader2,
  Percent,
  Plus,
  Scale,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Target,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLazyExportCustomersForExcelQuery, type BulkCreditAction } from '@/stores/creditControl.api'
import { downloadCustomersWorkbook } from '../utils/customer-excel'
import { useContactLocation } from '@/hooks/use-contact-location'
import { BulkCreditDialog, type BulkCreditCustomer } from './bulk-credit-dialog'
import { OverdueReviewDialog } from './overdue-review-dialog'
import { getBusinessToday } from '@/lib/business-timezone'

/**
 * Customers page header: Export Excel (re-importable layout) and the Credit menu — bulk
 * limit changes for the selected rows or a whole group, overdue review, settings.
 */
export function CustomerCreditTools({ selected, onChanged }: { selected: BulkCreditCustomer[]; onChanged?: () => void }) {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('manageCreditLimits')
  const [bulkAction, setBulkAction] = useState<BulkCreditAction | null>(null)
  const [overdueOpen, setOverdueOpen] = useState(false)
  const [fetchExport, { isFetching: exporting }] = useLazyExportCustomersForExcelQuery()
  const contactLocation = useContactLocation()

  const exportExcel = async () => {
    try {
      const { results } = await fetchExport().unwrap()
      downloadCustomersWorkbook(results, `customers-${getBusinessToday()}.xlsx`, {
        withLocation: contactLocation.enabled,
      })
      toast.success(t('{{n}} customers exported', { n: results.length }))
    } catch (error) {
      toast.error(getErrorMessage(error, t('Could not export customers')))
    }
  }

  // Open a dialog only once the menu has closed and handed focus back — opened in the same
  // tick, the menu's outside-click layer swallowed the first click inside the dialog.
  const openAfterMenu = (open: () => void) => window.setTimeout(open, 0)

  const item = (action: BulkCreditAction, label: string, Icon: typeof Plus, danger = false) => (
    <DropdownMenuItem onSelect={() => openAfterMenu(() => setBulkAction(action))} className={danger ? 'text-red-600 focus:text-red-600' : ''}>
      <Icon className='mr-2 h-4 w-4' />
      {t(label)}
    </DropdownMenuItem>
  )

  return (
    <>
      <Button type='button' variant='outline' onClick={exportExcel} disabled={exporting} className='space-x-1 max-sm:flex-1'>
        {exporting ? <Loader2 className='h-4 w-4 animate-spin' /> : <Download size={16} />}
        <span>{t('Export Excel')}</span>
      </Button>

      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type='button' variant={selected.length ? 'default' : 'outline'} className='gap-1.5 max-sm:flex-1'>
              <CreditCard size={16} />
              {selected.length ? t('Credit ({{n}} selected)', { n: selected.length }) : t('Credit tools')}
              <ChevronDown className='h-4 w-4 opacity-70' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-64'>
            <DropdownMenuLabel className='text-xs text-muted-foreground'>
              {selected.length
                ? t('For the {{n}} selected customers', { n: selected.length })
                : t('Pick customers in the table, or apply to a group')}
            </DropdownMenuLabel>
            {item('set', 'Set credit limit', Target)}
            {item('increase', 'Increase by amount', Plus)}
            {item('increase_percent', 'Increase / decrease by %', Percent)}
            {item('temporary', 'Temporary increase', CalendarClock)}
            {item('payment_terms', 'Set payment terms', Clock)}
            <DropdownMenuSeparator />
            {item('hold', 'Put on credit hold', ShieldAlert, true)}
            {item('release', 'Release credit hold', ShieldCheck)}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openAfterMenu(() => setBulkAction('match_balance'))}>
              <Scale className='mr-2 h-4 w-4' />
              <span>
                {t('Set limits from balances')}
                <span className='block text-xs text-muted-foreground'>{t('Owed now + buffer — switch limits on without blocking anyone')}</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openAfterMenu(() => setOverdueOpen(true))}>
              <AlertTriangle className='mr-2 h-4 w-4 text-amber-600' />
              {t('Overdue review & hold')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to='/settings/credit-control'>
                <Settings2 className='mr-2 h-4 w-4' />
                {t('Credit control settings')}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {bulkAction && (
        <BulkCreditDialog
          open
          onOpenChange={(open) => !open && setBulkAction(null)}
          selected={selected}
          initialAction={bulkAction}
          onDone={onChanged}
        />
      )}
      <OverdueReviewDialog open={overdueOpen} onOpenChange={setOverdueOpen} onDone={onChanged} />
    </>
  )
}
