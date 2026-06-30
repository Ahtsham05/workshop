import { formatDistanceToNow } from 'date-fns'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ContactMediaNameCell } from '@/components/contact-media-name-cell'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { SmsSendButton } from '@/components/sms/sms-send-button'
import { useBranchName } from '@/hooks/use-branch-name'
import { buildSupplierBalanceMessage } from '@/utils/sms-messages'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { CustomerListPagination } from '@/features/customers/components/customer-list-pagination'
import { useLanguage } from '@/context/language-context'
import type { SupplierWithBalance } from './supplier-ledger-card-grid'

type Props = {
  suppliers: SupplierWithBalance[]
  loading?: boolean
  onSelectSupplier: (supplier: SupplierWithBalance) => void
  pagination: {
    totalPage: number
    currentPage: number
    setCurrentPage: (page: number) => void
    limit: number
    setLimit: (limit: number) => void
  }
}

export function SupplierLedgerTable({ suppliers, loading, onSelectSupplier, pagination }: Props) {
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
        {suppliers.length === 0 ? (
          <div className='text-center py-8 text-muted-foreground'>
            {t('No suppliers available')}
          </div>
        ) : (
          <div className='border rounded-lg overflow-hidden'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Supplier Name')}</TableHead>
                  <TableHead>{t('Balance')}</TableHead>
                  <TableHead>{t('Phone')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Last Transaction')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow
                    key={supplier._id}
                    className='cursor-pointer hover:bg-muted/50'
                    onClick={() => onSelectSupplier(supplier)}
                  >
                    <TableCell>
                      <ContactMediaNameCell
                        compact
                        name={supplier.name}
                        nameUrdu={supplier.nameUrdu}
                        picture={supplier.picture}
                        idCardFront={supplier.idCardFront}
                        idCardBack={supplier.idCardBack}
                      />
                    </TableCell>
                    <TableCell className={getBalanceColor(supplier.balance)}>
                      Rs{formatBalance(supplier.balance)}
                    </TableCell>
                    <TableCell className='text-gray-600 text-sm'>
                      <div className='flex items-center gap-1'>
                        <span>{supplier.phone || '-'}</span>
                        {(supplier.phone || supplier.whatsapp) && (
                          <>
                            <WhatsAppSendButton
                              phone={supplier.phone}
                              whatsapp={supplier.whatsapp}
                              name={supplier.name}
                            />
                            <SmsSendButton
                              phone={supplier.phone}
                              name={supplier.name}
                              defaultMessage={buildSupplierBalanceMessage({ branchName, name: supplier.name, balance: supplier.balance })}
                            />
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {supplier.balance > 0 ? (
                        <Badge variant='destructive'>{t('Payable')}</Badge>
                      ) : supplier.balance < 0 ? (
                        <Badge variant='default' className='bg-green-600'>{t('Receivable')}</Badge>
                      ) : (
                        <Badge variant='secondary'>{t('Settled')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-gray-500 text-sm'>
                      {supplier.lastTransactionDate
                        ? formatDistanceToNow(new Date(supplier.lastTransactionDate), { addSuffix: true })
                        : '-'}
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectSupplier(supplier)
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

      {suppliers.length > 0 ? (
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
