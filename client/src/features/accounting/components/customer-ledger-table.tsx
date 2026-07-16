import { formatDistanceToNow } from 'date-fns'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ContactMediaNameCell } from '@/components/contact-media-name-cell'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { SmsSendButton } from '@/components/sms/sms-send-button'
import { useBranchName } from '@/hooks/use-branch-name'
import { buildCustomerBalanceMessage } from '@/utils/sms-messages'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { CustomerListPagination } from '@/features/customers/components/customer-list-pagination'
import { useLanguage } from '@/context/language-context'
import type { CustomerWithBalance } from './customer-ledger-card-grid'

type Props = {
  customers: CustomerWithBalance[]
  loading?: boolean
  onSelectCustomer: (customer: CustomerWithBalance) => void
  pagination: {
    totalPage: number
    currentPage: number
    setCurrentPage: (page: number) => void
    limit: number
    setLimit: (limit: number) => void
  }
}

export function CustomerLedgerTable({ customers, loading, onSelectCustomer, pagination }: Props) {
  const { t } = useLanguage()
  const branchName = useBranchName()

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return 'text-red-600'
    if (balance < 0) return 'text-green-600'
    return 'text-gray-600'
  }

  const formatBalance = (balance: number) => Math.abs(balance).toFixed(2)

  return (
    <div className='space-y-4'>
      <TableLoadingOverlay loading={loading}>
        {customers.length === 0 ? (
          <div className='text-center py-8 text-muted-foreground'>
            {t('No customers available')}
          </div>
        ) : (
          <div className='border rounded-lg overflow-hidden'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Customer Name')}</TableHead>
                  <TableHead>{t('Balance')}</TableHead>
                  <TableHead>{t('Phone')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Last Transaction')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow
                    key={customer._id}
                    className='cursor-pointer hover:bg-muted/50'
                    onClick={() => onSelectCustomer(customer)}
                  >
                    <TableCell>
                      <ContactMediaNameCell
                        compact
                        name={customer.name}
                        nameUrdu={customer.nameUrdu}
                        picture={customer.picture}
                        idCardFront={customer.idCardFront}
                        idCardBack={customer.idCardBack}
                      />
                    </TableCell>
                    <TableCell className={getBalanceColor(customer.balance)}>
                      Rs{formatBalance(customer.balance)}
                    </TableCell>
                    <TableCell className='text-gray-600 text-sm'>
                      <div className='flex items-center gap-1'>
                        <span>{customer.phone || '-'}</span>
                        {(customer.phone || customer.whatsapp) && (
                          <>
                            <WhatsAppSendButton
                              phone={customer.phone}
                              whatsapp={customer.whatsapp}
                              name={customer.name}
                              message={buildCustomerBalanceMessage({ branchName, name: customer.name, balance: customer.balance })}
                            />
                            <SmsSendButton
                              phone={customer.phone}
                              name={customer.name}
                              defaultMessage={buildCustomerBalanceMessage({ branchName, name: customer.name, balance: customer.balance })}
                            />
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer.balance > 0 ? (
                        <Badge variant='destructive'>{t('Receivable')}</Badge>
                      ) : customer.balance < 0 ? (
                        <Badge variant='default' className='bg-green-600'>{t('Payable')}</Badge>
                      ) : (
                        <Badge variant='secondary'>{t('Settled')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-gray-500 text-sm'>
                      {customer.lastTransactionDate
                        ? formatDistanceToNow(new Date(customer.lastTransactionDate), { addSuffix: true })
                        : '-'}
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectCustomer(customer)
                        }}
                      >
                        <Eye className='w-4 h-4 mr-1' />
                        {t('View Details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TableLoadingOverlay>

      {customers.length > 0 ? (
        <CustomerListPagination
          currentPage={pagination.currentPage}
          totalPage={pagination.totalPage}
          limit={pagination.limit}
          setCurrentPage={pagination.setCurrentPage}
          setLimit={pagination.setLimit}
        />
      ) : null}
    </div>
  )
}
