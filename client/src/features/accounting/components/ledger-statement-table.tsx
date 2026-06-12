import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  formatLedgerBalanceLabel,
  getLedgerBalanceTone,
  isSettledCashRow,
  type LedgerParty,
} from '@/features/accounting/utils/ledger-display';

export interface LedgerStatementEntry {
  id?: string;
  _id?: string;
  transactionDate: string;
  transactionType: string;
  description: string;
  reference?: string;
  referenceId?: string;
  invoiceType?: string;
  paymentMethod?: string;
  debit: number;
  credit: number;
  balance: number;
}

interface Props {
  party: LedgerParty;
  entries: LedgerStatementEntry[];
  balanceBeforePage?: number;
  pageOffset?: number;
  showOpeningBalance?: boolean;
  openingBalanceLabel?: string;
  t: (key: string) => string;
  getTypeLabel: (entry: LedgerStatementEntry) => string;
  getTypeBadgeVariant: (type: string) => 'default' | 'secondary' | 'destructive' | 'outline';
  formatInvoiceType: (entry: LedgerStatementEntry) => string;
  renderReference?: (entry: LedgerStatementEntry) => ReactNode;
  renderActions: (entry: LedgerStatementEntry) => ReactNode;
}

export function LedgerStatementTable({
  party,
  entries,
  balanceBeforePage = 0,
  pageOffset = 0,
  showOpeningBalance = false,
  openingBalanceLabel,
  t,
  getTypeLabel,
  getTypeBadgeVariant,
  formatInvoiceType,
  renderReference,
  renderActions,
}: Props) {
  const pageDebit = entries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
  const pageCredit = entries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
  const closingBalance =
    entries.length > 0 ? entries[entries.length - 1].balance : balanceBeforePage;

  return (
    <div className='overflow-x-auto rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow className='bg-muted/40'>
            <TableHead className='w-10 text-center'>#</TableHead>
            <TableHead>{t('Date')}</TableHead>
            <TableHead>{t('Type')}</TableHead>
            <TableHead className='min-w-[180px]'>{t('Description')}</TableHead>
            <TableHead>{t('Reference')}</TableHead>
            <TableHead>{t('Invoice Type')}</TableHead>
            <TableHead className='text-right'>{t('Debit')}</TableHead>
            <TableHead className='text-right'>{t('Credit')}</TableHead>
            <TableHead className='text-right min-w-[120px]'>{t('Balance')}</TableHead>
            <TableHead className='text-right whitespace-nowrap w-[1%]'>{t('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(pageOffset > 0 || showOpeningBalance) && (
            <TableRow className='bg-muted/30 font-medium'>
              <TableCell colSpan={8} className='text-sm text-muted-foreground'>
                {openingBalanceLabel || t('Balance brought forward')}
              </TableCell>
              <TableCell className={`text-right tabular-nums ${getLedgerBalanceTone(party, balanceBeforePage)}`}>
                {formatLedgerBalanceLabel(party, balanceBeforePage, t)}
              </TableCell>
              <TableCell />
            </TableRow>
          )}

          {entries.map((entry, index) => {
            const rowNumber = pageOffset + index + 1;
            const settledCash = isSettledCashRow(entry.debit, entry.credit);

            return (
              <TableRow
                key={entry.id || entry._id}
                className={cn(
                  index % 2 === 1 && 'bg-muted/15',
                  settledCash && 'bg-sky-50/70 dark:bg-sky-950/20',
                )}
              >
                <TableCell className='text-center text-xs text-muted-foreground tabular-nums'>
                  {rowNumber}
                </TableCell>
                <TableCell className='whitespace-nowrap text-sm tabular-nums'>
                  {format(new Date(entry.transactionDate), 'MMM dd, yyyy')}
                </TableCell>
                <TableCell>
                  <Badge variant={getTypeBadgeVariant(entry.transactionType)} className='whitespace-nowrap'>
                    {getTypeLabel(entry)}
                  </Badge>
                </TableCell>
                <TableCell className='max-w-[240px] truncate text-sm' title={entry.description}>
                  {entry.description}
                </TableCell>
                <TableCell className='text-sm'>
                  {renderReference ? renderReference(entry) : entry.reference || '—'}
                </TableCell>
                <TableCell>
                  <span className='text-sm'>{formatInvoiceType(entry)}</span>
                </TableCell>
                <TableCell className='text-right tabular-nums text-red-600'>
                  {entry.debit > 0 ? `Rs${entry.debit.toFixed(2)}` : '—'}
                </TableCell>
                <TableCell className='text-right tabular-nums text-green-600'>
                  {entry.credit > 0 ? `Rs${entry.credit.toFixed(2)}` : '—'}
                </TableCell>
                <TableCell className={`text-right tabular-nums text-sm ${getLedgerBalanceTone(party, entry.balance)}`}>
                  {formatLedgerBalanceLabel(party, entry.balance, t)}
                </TableCell>
                <TableCell className='text-right whitespace-nowrap align-middle'>
                  {renderActions(entry)}
                </TableCell>
              </TableRow>
            );
          })}

          {entries.length > 0 && (
            <TableRow className='border-t-2 bg-muted/40 font-semibold'>
              <TableCell colSpan={6} className='text-sm'>
                {t('Page totals')}
              </TableCell>
              <TableCell className='text-right tabular-nums text-red-700'>
                Rs{pageDebit.toFixed(2)}
              </TableCell>
              <TableCell className='text-right tabular-nums text-green-700'>
                Rs{pageCredit.toFixed(2)}
              </TableCell>
              <TableCell className={`text-right tabular-nums ${getLedgerBalanceTone(party, closingBalance)}`}>
                {formatLedgerBalanceLabel(party, closingBalance, t)}
              </TableCell>
              <TableCell />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
