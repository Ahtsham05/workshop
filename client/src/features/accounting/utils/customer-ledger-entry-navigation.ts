import type { CustomerLedgerCategory } from './customer-ledger-categories';

export type LedgerCashAction = 'send' | 'receive';

export interface CustomerLedgerEntryAction {
  id: string;
  labelKey: string;
  cashAction?: LedgerCashAction;
  to: '/mobile-shop/load' | '/mobile-shop/cash-management' | '/mobile-shop/sim-sale' | '/mobile-shop/services' | '/invoice';
  search: Record<string, string | undefined>;
}

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

/** Quick actions shown on each customer card in the customers list. */
export function getCustomerQuickActions(customerId: string): CustomerLedgerEntryAction[] {
  return [
    {
      id: 'invoice-sale',
      labelKey: 'New Sale Invoice',
      to: '/invoice',
      search: { view: 'create', customerId },
    },
    {
      id: 'load-sale',
      labelKey: 'Sell Load',
      to: '/mobile-shop/load',
      search: { tab: 'sell', customerId },
    },
    {
      id: 'sim-sale',
      labelKey: 'Sim Sale',
      to: '/mobile-shop/sim-sale',
      search: { customerId },
    },
    {
      id: 'service-invoice',
      labelKey: 'Service',
      to: '/mobile-shop/services',
      search: { tab: 'invoices', customerId },
    },
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
        labelKey: 'Sim Sale',
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

  return [];
}

const PAYMENT_METHOD_BY_CATEGORY: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank Transfer',
  cheque: 'Cheque',
  card: 'Card',
  credit: 'Credit',
  jazzcash: 'Wallet (JazzCash)',
  easypaisa: 'Wallet (EasyPaisa)',
  nagad: 'Wallet (Nagad)',
};

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
  const paymentMethod = PAYMENT_METHOD_BY_CATEGORY[categoryKey];

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
    case 'cash':
    case 'bank':
    case 'cheque':
    case 'card':
    case 'credit':
    case 'jazzcash':
    case 'easypaisa':
    case 'nagad':
    case 'wallet':
      return {
        transactionType: 'payment_received',
        paymentMethod: paymentMethod || 'Cash',
      };
    default:
      return { transactionType: 'sale', paymentMethod: 'Cash' };
  }
}
