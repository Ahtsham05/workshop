import type { SupplierLedgerCategory } from './supplier-ledger-categories';

export interface SupplierLedgerEntryAction {
  id: string;
  labelKey: string;
  to: '/mobile-shop/load' | '/purchase-invoice';
  search: Record<string, string | undefined>;
}

export function getSupplierQuickActions(supplierId: string): SupplierLedgerEntryAction[] {
  return [
    {
      id: 'purchase-invoice',
      labelKey: 'New Purchase',
      to: '/purchase-invoice',
      search: { supplierId },
    },
    {
      id: 'load-purchase',
      labelKey: 'Buy Load',
      to: '/mobile-shop/load',
      search: { tab: 'purchase', supplierId },
    },
  ];
}

export function getSupplierLedgerEntryActions(
  category: SupplierLedgerCategory,
  supplierId: string,
): SupplierLedgerEntryAction[] {
  const key = category.key;

  if (key === 'load') {
    return [
      {
        id: 'load-purchase',
        labelKey: 'Buy Load',
        to: '/mobile-shop/load',
        search: { tab: 'purchase', supplierId },
      },
    ];
  }

  if (key === 'purchase') {
    return [
      {
        id: 'purchase-invoice',
        labelKey: 'New Purchase',
        to: '/purchase-invoice',
        search: { supplierId },
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

export function getSupplierLedgerFormPreset(categoryKey: string): {
  transactionType: string;
  paymentMethod?: string;
} | null {
  const paymentMethod = PAYMENT_METHOD_BY_CATEGORY[categoryKey];

  switch (categoryKey) {
    case 'opening_balance':
      return { transactionType: 'opening_balance' };
    case 'payment_received':
      return { transactionType: 'payment_received', paymentMethod: 'Cash' };
    case 'payment_made':
      return { transactionType: 'payment_made', paymentMethod: 'Cash' };
    case 'purchase_return':
      return { transactionType: 'purchase_return' };
    case 'credit_note':
      return { transactionType: 'credit_note' };
    case 'debit_note':
      return { transactionType: 'debit_note' };
    case 'adjustment':
      return { transactionType: 'adjustment' };
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
        transactionType: 'payment_made',
        paymentMethod: paymentMethod || 'Cash',
      };
    default:
      return { transactionType: 'payment_made', paymentMethod: 'Cash' };
  }
}
