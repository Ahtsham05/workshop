import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LedgerStatementTable,
  type LedgerStatementEntry,
} from '@/features/accounting/components/ledger-statement-table';
import {
  groupCustomerLedgerEntries,
  type CustomerLedgerCategoryGroup,
} from '@/features/accounting/utils/customer-ledger-categories';
import type { LedgerParty } from '@/features/accounting/utils/ledger-display';

interface Props {
  party: LedgerParty;
  entries: LedgerStatementEntry[];
  openingBalance: number;
  showOpeningBalance: boolean;
  t: (key: string) => string;
  getTypeLabel: (entry: LedgerStatementEntry) => string;
  getTypeBadgeVariant: (type: string) => 'default' | 'secondary' | 'destructive' | 'outline';
  formatInvoiceType: (entry: LedgerStatementEntry) => string;
  renderReference?: (entry: LedgerStatementEntry) => ReactNode;
  renderActions: (entry: LedgerStatementEntry) => ReactNode;
}

function CategorySection({
  group,
  rowOffset,
  showOpeningBalance,
  openingBalance,
  openingBalanceLabel,
  ...tableProps
}: {
  group: CustomerLedgerCategoryGroup;
  rowOffset: number;
  showOpeningBalance: boolean;
  openingBalance: number;
  openingBalanceLabel?: string;
} & Omit<Props, 'entries' | 'openingBalance' | 'showOpeningBalance'>) {
  const { t } = tableProps;

  return (
    <Card className='overflow-hidden shadow-sm'>
      <CardHeader className='border-b bg-muted/20 py-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle className='text-base font-semibold'>{t(group.category.labelKey)}</CardTitle>
          <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
            <span>
              {group.entries.length} {t('entries')}
            </span>
            {group.totalDebit > 0 && (
              <Badge variant='outline' className='font-normal text-red-700 border-red-200'>
                {t('Debit')}: Rs{group.totalDebit.toFixed(2)}
              </Badge>
            )}
            {group.totalCredit > 0 && (
              <Badge variant='outline' className='font-normal text-green-700 border-green-200'>
                {t('Credit')}: Rs{group.totalCredit.toFixed(2)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className='p-0'>
        <LedgerStatementTable
          {...tableProps}
          entries={group.entries}
          balanceBeforePage={openingBalance}
          pageOffset={rowOffset}
          showOpeningBalance={showOpeningBalance}
          openingBalanceLabel={openingBalanceLabel}
        />
      </CardContent>
    </Card>
  );
}

export function LedgerStatementGrouped(props: Props) {
  const groups = groupCustomerLedgerEntries(props.entries);

  if (groups.length <= 1) {
    return (
      <LedgerStatementTable
        party={props.party}
        entries={props.entries}
        balanceBeforePage={props.openingBalance}
        pageOffset={0}
        showOpeningBalance={props.showOpeningBalance}
        openingBalanceLabel={props.t('Opening Balance')}
        t={props.t}
        getTypeLabel={props.getTypeLabel}
        getTypeBadgeVariant={props.getTypeBadgeVariant}
        formatInvoiceType={props.formatInvoiceType}
        renderReference={props.renderReference}
        renderActions={props.renderActions}
      />
    );
  }

  let rowOffset = 0;
  return (
    <div className='space-y-4'>
      {groups.map((group) => {
        const section = (
          <CategorySection
            key={group.category.key}
            group={group}
            rowOffset={rowOffset}
            showOpeningBalance={rowOffset === 0 && props.showOpeningBalance}
            openingBalance={props.openingBalance}
            openingBalanceLabel={props.t('Opening Balance')}
            party={props.party}
            t={props.t}
            getTypeLabel={props.getTypeLabel}
            getTypeBadgeVariant={props.getTypeBadgeVariant}
            formatInvoiceType={props.formatInvoiceType}
            renderReference={props.renderReference}
            renderActions={props.renderActions}
          />
        );
        rowOffset += group.entries.length;
        return section;
      })}
    </div>
  );
}

export { groupCustomerLedgerEntries };
