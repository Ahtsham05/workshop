import { formatDistanceToNow } from 'date-fns'
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money'
import { ChevronRight, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ContactMediaNameCell } from '@/components/contact-media-name-cell'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { SmsSendButton } from '@/components/sms/sms-send-button'
import { useBranchName } from '@/hooks/use-branch-name'
import { buildCustomerBalanceMessage, getCustomerBalanceTemplate } from '@/utils/sms-messages'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { CustomerListPagination } from '@/features/customers/components/customer-list-pagination'
import { useLanguage } from '@/context/language-context'
import type { CustomerWithBalance } from './customer-ledger-card-grid'
import { useLedgerStatus } from '@/features/ledger-alerts/hooks/use-ledger-alerts'
import { AgingChip } from '@/features/ledger-alerts/components/aging-chip'
import { CreditCell } from '@/features/customers/credit/credit-cell'

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
  // Overdue colour per customer (Settings → Due Dates & Ledger Colours).
  const { rowStyleFor, agingFor, settings: ledgerSettings, colorsOn } = useLedgerStatus()

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return 'text-red-600'
    if (balance < 0) return 'text-green-600'
    return 'text-gray-600'
  }

  const formatMoney = useFormatMoney()
  const { symbol: currencySymbol } = useCurrencyMeta()
  const formatBalance = (balance: number) => formatMoney(Math.abs(balance))

  return (
    <div className='space-y-4'>
      <TableLoadingOverlay loading={loading}>
        {customers.length === 0 ? (
          <div className='text-center py-8 text-muted-foreground'>
            {t('No customers available')}
          </div>
        ) : (
          <>
          {/* Phones: a tappable list — the 7-column table can't fit and was clipped. */}
          <div className='divide-y overflow-hidden rounded-lg border sm:hidden'>
            {customers.map((customer) => {
              const aging = colorsOn ? agingFor(customer._id) : null
              const credit = customer.credit
              return (
                // A div, not a <button>: the name cell holds its own photo-preview buttons.
                <div
                  key={customer._id}
                  role='button'
                  tabIndex={0}
                  style={rowStyleFor(customer._id)}
                  className='flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left active:bg-muted/60'
                  onClick={() => onSelectCustomer(customer)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectCustomer(customer)
                    }
                  }}
                >
                  <div className='min-w-0 flex-1 space-y-1'>
                    <ContactMediaNameCell
                      compact
                      name={customer.name}
                      nameUrdu={customer.nameUrdu}
                      picture={customer.picture}
                      idCardFront={customer.idCardFront}
                      idCardBack={customer.idCardBack}
                    />
                    <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
                      {customer.phone ? <span className='tabular-nums'>{customer.phone}</span> : null}
                      {customer.lastTransactionDate ? (
                        <span>· {formatDistanceToNow(new Date(customer.lastTransactionDate), { addSuffix: true })}</span>
                      ) : null}
                    </div>
                    {aging || credit?.hasLimit || credit?.onHold ? (
                      <div className='flex flex-wrap items-center gap-2'>
                        {aging ? <AgingChip aging={aging} settings={ledgerSettings} size='xs' /> : null}
                        {credit?.hasLimit || credit?.onHold ? (
                          <CreditCell credit={credit} className='min-w-0 max-w-[15rem] basis-full' />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className='shrink-0 text-right'>
                    <div className={`font-semibold tabular-nums ${getBalanceColor(customer.balance)}`}>
                      {formatBalance(customer.balance)}
                    </div>
                    <div className={`text-[11px] font-medium ${getBalanceColor(customer.balance)}`}>
                      {customer.balance > 0 ? t('Receivable') : customer.balance < 0 ? t('Payable') : t('Settled')}
                    </div>
                  </div>
                  <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
                </div>
              )
            })}
          </div>
          <div className='border rounded-lg overflow-hidden max-sm:hidden'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Customer Name')}</TableHead>
                  <TableHead>{t('Balance')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Credit Limit')}</TableHead>
                  <TableHead>{t('Phone')}</TableHead>
                  <TableHead>{t('Last Transaction')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow
                    key={customer._id}
                    style={rowStyleFor(customer._id)}
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
                      {formatBalance(customer.balance)}
                    </TableCell>
                    <TableCell>
                      {customer.balance > 0 ? (
                        <Badge variant='destructive'>{t('Receivable')}</Badge>
                      ) : customer.balance < 0 ? (
                        <Badge variant='default' className='bg-green-600'>{t('Payable')}</Badge>
                      ) : (
                        <Badge variant='secondary'>{t('Settled')}</Badge>
                      )}
                      {colorsOn ? <AgingChip aging={agingFor(customer._id)} settings={ledgerSettings} size='xs' className='mt-1 block' /> : null}
                    </TableCell>
                    <TableCell>
                      <CreditCell credit={customer.credit} />
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
                              message={buildCustomerBalanceMessage({ branchName, name: customer.name, balance: customer.balance, currency: currencySymbol })}
                              {...getCustomerBalanceTemplate({ name: customer.name, balance: customer.balance })}
                            />
                            <SmsSendButton
                              phone={customer.phone}
                              name={customer.name}
                              defaultMessage={buildCustomerBalanceMessage({ branchName, name: customer.name, balance: customer.balance, currency: currencySymbol })}
                            />
                          </>
                        )}
                      </div>
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
          </>
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
