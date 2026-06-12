import type { LedgerStatementEntry } from '@/features/accounting/components/ledger-statement-table';

export interface SupplierLedgerCategory {
  key: string;
  labelKey: string;
  sortOrder: number;
}

export function isManualLedgerEntry(entry: LedgerStatementEntry): boolean {
  const rid = entry.referenceId as unknown;
  if (rid == null) return true;
  if (typeof rid === 'string' && !rid.trim()) return true;
  return false;
}

export function isLoadPurchaseLedgerRow(entry: LedgerStatementEntry): boolean {
  const ref = String(entry.reference || '').toUpperCase();
  if (ref.includes('LOAD-PURCHASE')) return true;
  return /\bload purchase\b/i.test(entry.description || '');
}

function isLinkedPurchaseInvoiceRow(entry: LedgerStatementEntry): boolean {
  if (isManualLedgerEntry(entry)) return false;
  if (isLoadPurchaseLedgerRow(entry)) return false;
  const type = entry.transactionType;
  if (type !== 'purchase' && type !== 'payment_made') return false;
  return Boolean(entry.referenceId || entry.reference);
}

function paymentMethodText(entry: LedgerStatementEntry): string {
  return String(entry.paymentMethod || '').trim().toLowerCase();
}

function matchesWalletKeyword(text: string, keyword: string): boolean {
  const normalized = text.replace(/[\s_-]+/g, '');
  return text.includes(keyword) || normalized.includes(keyword.replace(/[\s_-]+/g, ''));
}

function parseWalletTypeFromPaymentMethod(payment: string): string {
  const match = payment.match(/wallet\s*\((.+)\)/i);
  return match?.[1]?.trim() || '';
}

/** Route manual ledger entries by payment method / wallet only — never by description text. */
function resolvePaymentChannelCategory(payment: string): SupplierLedgerCategory {
  const paymentLower = payment.trim().toLowerCase();
  const walletType = parseWalletTypeFromPaymentMethod(payment);
  const walletLower = walletType.toLowerCase();
  const walletNormalized = walletLower.replace(/[\s_-]+/g, '');

  if (walletType) {
    if (matchesWalletKeyword(walletLower, 'jazzcash') || walletNormalized.includes('jazzcash')) {
      return { key: 'jazzcash', labelKey: 'JazzCash', sortOrder: 12 };
    }
    if (matchesWalletKeyword(walletLower, 'easypaisa') || walletNormalized.includes('easypaisa')) {
      return { key: 'easypaisa', labelKey: 'EasyPaisa', sortOrder: 13 };
    }
    if (
      matchesWalletKeyword(walletLower, 'nagad') ||
      walletNormalized.includes('nagad') ||
      walletNormalized.includes('nagat')
    ) {
      return { key: 'nagad', labelKey: 'Nagad', sortOrder: 13 };
    }
    return { key: 'wallet', labelKey: walletType, sortOrder: 14 };
  }

  if (matchesWalletKeyword(paymentLower, 'jazzcash')) {
    return { key: 'jazzcash', labelKey: 'JazzCash', sortOrder: 12 };
  }
  if (matchesWalletKeyword(paymentLower, 'easypaisa')) {
    return { key: 'easypaisa', labelKey: 'EasyPaisa', sortOrder: 13 };
  }
  if (matchesWalletKeyword(paymentLower, 'nagad') || paymentLower.replace(/[\s_-]+/g, '').includes('nagat')) {
    return { key: 'nagad', labelKey: 'Nagad', sortOrder: 13 };
  }
  if (paymentLower.includes('bank')) {
    return { key: 'bank', labelKey: 'Bank Transfer', sortOrder: 14 };
  }
  if (paymentLower.includes('cheque')) {
    return { key: 'cheque', labelKey: 'Cheque', sortOrder: 15 };
  }
  if (paymentLower.includes('card')) {
    return { key: 'card', labelKey: 'Card', sortOrder: 15 };
  }
  if (paymentLower === 'credit') {
    return { key: 'credit', labelKey: 'Credit', sortOrder: 15 };
  }
  if (paymentLower === 'cash' || !paymentLower) {
    return { key: 'cash', labelKey: 'Cash', sortOrder: 15 };
  }

  return { key: 'cash', labelKey: 'Cash', sortOrder: 15 };
}

export function resolveSupplierLedgerCategory(entry: LedgerStatementEntry): SupplierLedgerCategory {
  const type = entry.transactionType;
  const manual = isManualLedgerEntry(entry);
  const payment = paymentMethodText(entry);

  if (type === 'opening_balance') {
    return { key: 'opening_balance', labelKey: 'Opening Balance', sortOrder: 0 };
  }

  if (type === 'purchase_return') {
    return { key: 'purchase_return', labelKey: 'Purchase Return', sortOrder: 30 };
  }

  if (type === 'purchase') {
    if (isLoadPurchaseLedgerRow(entry)) {
      return { key: 'load', labelKey: 'Load', sortOrder: 10 };
    }
    if (manual) {
      return resolvePaymentChannelCategory(payment);
    }
    return { key: 'purchase', labelKey: 'Purchase', sortOrder: 16 };
  }

  if (type === 'payment_made') {
    if (manual) {
      return resolvePaymentChannelCategory(payment);
    }
    if (isLoadPurchaseLedgerRow(entry)) {
      return { key: 'load', labelKey: 'Load', sortOrder: 10 };
    }
    if (isLinkedPurchaseInvoiceRow(entry)) {
      return { key: 'purchase', labelKey: 'Purchase', sortOrder: 16 };
    }
    return { key: 'payment_made', labelKey: 'Payment Made', sortOrder: 18 };
  }

  if (type === 'payment_received') {
    if (manual) {
      return resolvePaymentChannelCategory(payment);
    }
    if (isLoadPurchaseLedgerRow(entry)) {
      return { key: 'load', labelKey: 'Load', sortOrder: 10 };
    }
    if (isLinkedPurchaseInvoiceRow(entry)) {
      return { key: 'purchase', labelKey: 'Purchase', sortOrder: 16 };
    }
    return { key: 'payment_received', labelKey: 'Payment Received', sortOrder: 17 };
  }

  if (type === 'credit_note') {
    return { key: 'credit_note', labelKey: 'Credit Note', sortOrder: 21 };
  }

  if (type === 'debit_note') {
    return { key: 'debit_note', labelKey: 'Debit Note', sortOrder: 22 };
  }

  if (type === 'adjustment') {
    return { key: 'adjustment', labelKey: 'Adjustment', sortOrder: 23 };
  }

  return { key: 'other', labelKey: 'Other', sortOrder: 99 };
}

export interface SupplierLedgerCategoryGroup {
  category: SupplierLedgerCategory;
  entries: LedgerStatementEntry[];
  totalDebit: number;
  totalCredit: number;
}

export function groupSupplierLedgerEntries(entries: LedgerStatementEntry[]): SupplierLedgerCategoryGroup[] {
  const map = new Map<string, SupplierLedgerCategoryGroup>();

  for (const entry of entries) {
    const category = resolveSupplierLedgerCategory(entry);
    const existing = map.get(category.key);
    if (existing) {
      existing.entries.push(entry);
      existing.totalDebit += Number(entry.debit) || 0;
      existing.totalCredit += Number(entry.credit) || 0;
    } else {
      map.set(category.key, {
        category,
        entries: [entry],
        totalDebit: Number(entry.debit) || 0,
        totalCredit: Number(entry.credit) || 0,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.category.sortOrder !== b.category.sortOrder) {
      return a.category.sortOrder - b.category.sortOrder;
    }
    return a.category.labelKey.localeCompare(b.category.labelKey);
  });
}
