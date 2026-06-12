import type { CustomerLedgerCategory } from './customer-ledger-categories';

export type LedgerCashAction = 'send' | 'receive';

export interface CustomerLedgerEntryAction {
  id: string;
  labelKey: string;
  cashAction?: LedgerCashAction;
  to: '/mobile-shop/load' | '/mobile-shop/cash-management' | '/mobile-shop/sim-sale' | '/invoice';
  search: Record<string, string | undefined>;
}

const WALLET_TYPE_BY_CATEGORY: Record<string, string> = {
  jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa',
  nagad: 'Nagad',
};

function cashManagementSearch(
  customerId: string,
  cashAction: LedgerCashAction,
  walletType?: string,
): Record<string, string | undefined> {
  return {
    customerId,
    action: cashAction === 'send' ? 'withdrawal' : 'deposit',
    walletType: walletType || undefined,
  };
}

export function getCustomerLedgerEntryActions(
  category: CustomerLedgerCategory,
  customerId: string,
): CustomerLedgerEntryAction[] {
  const key = category.key;

  if (key === 'load') {
    return [
      {
        id: 'load-sale',
        labelKey: 'Sell Load',
        to: '/mobile-shop/load',
        search: { tab: 'sell', customerId },
      },
    ];
  }

  if (key === 'sim_sale') {
    return [
      {
        id: 'sim-sale',
        labelKey: 'New Sim Sale',
        to: '/mobile-shop/sim-sale',
        search: { customerId },
      },
    ];
  }

  if (key === 'sale') {
    return [
      {
        id: 'invoice-sale',
        labelKey: 'New Sale Invoice',
        to: '/invoice',
        search: { view: 'create', customerId },
      },
    ];
  }

  if (key === 'cash_management') {
    return [
      {
        id: 'cash-send',
        labelKey: 'Send',
        cashAction: 'send',
        to: '/mobile-shop/cash-management',
        search: cashManagementSearch(customerId, 'send'),
      },
      {
        id: 'cash-receive',
        labelKey: 'Receive',
        cashAction: 'receive',
        to: '/mobile-shop/cash-management',
        search: cashManagementSearch(customerId, 'receive'),
      },
    ];
  }

  const walletType = WALLET_TYPE_BY_CATEGORY[key];
  if (walletType || ['wallet', 'cash', 'bank'].includes(key)) {
    return [
      {
        id: `${key}-send`,
        labelKey: 'Send',
        cashAction: 'send',
        to: '/mobile-shop/cash-management',
        search: cashManagementSearch(customerId, 'send', walletType),
      },
      {
        id: `${key}-receive`,
        labelKey: 'Receive',
        cashAction: 'receive',
        to: '/mobile-shop/cash-management',
        search: cashManagementSearch(customerId, 'receive', walletType),
      },
    ];
  }

  return [];
}

export function supportsLedgerEntryForm(categoryKey: string): boolean {
  return getCustomerLedgerEntryActions(
    { key: categoryKey, labelKey: '', sortOrder: 0 },
    '',
  ).length === 0;
}

export function getLedgerFormPreset(categoryKey: string): {
  transactionType: string;
  paymentMethod?: string;
} | null {
  switch (categoryKey) {
    case 'opening_balance':
      return { transactionType: 'opening_balance' };
    case 'payment_received':
    case 'cash_received':
      return { transactionType: 'payment_received', paymentMethod: 'Cash' };
    case 'payment_made':
      return { transactionType: 'payment_made', paymentMethod: 'Cash' };
    case 'sales_return':
      return { transactionType: 'sales_return' };
    case 'credit_note':
      return { transactionType: 'credit_note' };
    case 'debit_note':
      return { transactionType: 'debit_note' };
    case 'adjustment':
      return { transactionType: 'adjustment' };
    case 'refund':
      return { transactionType: 'refund' };
    default:
      return { transactionType: 'sale', paymentMethod: 'Cash' };
  }
}
