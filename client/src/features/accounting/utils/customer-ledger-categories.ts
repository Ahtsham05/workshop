import type { LedgerStatementEntry } from '@/features/accounting/components/ledger-statement-table';

export interface CustomerLedgerCategory {
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

export function isSimSaleLedgerRow(entry: LedgerStatementEntry): boolean {
  if (entry.transactionType !== 'sale') return false;
  const ref = String(entry.reference || '').toUpperCase();
  if (ref.includes('SIM-SALE')) return true;
  return /\bsim sale\b/i.test(entry.description || '');
}

export function isLoadSaleLedgerRow(entry: LedgerStatementEntry): boolean {
  const ref = String(entry.reference || '').toUpperCase();
  if (ref.includes('LOAD-SALE')) return true;
  return /\bload sale\b/i.test(entry.description || '') || /\bfor load sale\b/i.test(entry.description || '');
}

export function isCashWithdrawalLedgerRow(entry: LedgerStatementEntry): boolean {
  return /CW-WITH|CW-DEPO/i.test(String(entry.reference || ''));
}

function paymentMethodText(entry: LedgerStatementEntry): string {
  return String(entry.paymentMethod || '').trim().toLowerCase();
}

function descriptionText(entry: LedgerStatementEntry): string {
  return String(entry.description || '').trim().toLowerCase();
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
function resolvePaymentChannelCategory(payment: string): CustomerLedgerCategory {
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

export function resolveCustomerLedgerCategory(entry: LedgerStatementEntry): CustomerLedgerCategory {
  const type = entry.transactionType;
  const manual = isManualLedgerEntry(entry);
  const payment = paymentMethodText(entry);
  const description = descriptionText(entry);

  if (type === 'opening_balance') {
    return { key: 'opening_balance', labelKey: 'Opening Balance', sortOrder: 0 };
  }

  if (isCashWithdrawalLedgerRow(entry)) {
    return { key: 'cash_management', labelKey: 'Cash Management', sortOrder: 20 };
  }

  if (type === 'sales_return') {
    return { key: 'sales_return', labelKey: 'Sales Return', sortOrder: 30 };
  }

  if (type === 'sale') {
    if (isLoadSaleLedgerRow(entry)) {
      return { key: 'load', labelKey: 'Load', sortOrder: 10 };
    }
    if (isSimSaleLedgerRow(entry)) {
      return { key: 'sim_sale', labelKey: 'SIM Sale', sortOrder: 11 };
    }
    if (manual) {
      return resolvePaymentChannelCategory(payment);
    }
    return { key: 'sale', labelKey: 'Sale', sortOrder: 16 };
  }

  if (type === 'payment_received') {
    if (manual) {
      return resolvePaymentChannelCategory(payment);
    }
    if (isLoadSaleLedgerRow(entry)) {
      return { key: 'load', labelKey: 'Load', sortOrder: 10 };
    }
    if (isSimSaleLedgerRow(entry)) {
      return { key: 'sim_sale', labelKey: 'SIM Sale', sortOrder: 11 };
    }
    if (entry.referenceId || entry.reference) {
      return { key: 'sale', labelKey: 'Sale', sortOrder: 16 };
    }
    if (matchesWalletKeyword(payment, 'jazzcash') || matchesWalletKeyword(description, 'jazzcash')) {
      return { key: 'jazzcash', labelKey: 'JazzCash', sortOrder: 12 };
    }
    if (matchesWalletKeyword(payment, 'easypaisa') || matchesWalletKeyword(description, 'easypaisa')) {
      return { key: 'easypaisa', labelKey: 'EasyPaisa', sortOrder: 13 };
    }
    if (payment.includes('wallet') || matchesWalletKeyword(description, 'wallet')) {
      return { key: 'wallet', labelKey: 'Wallet', sortOrder: 14 };
    }
    return { key: 'payment_received', labelKey: 'Payment Received', sortOrder: 18 };
  }

  if (type === 'payment_made') {
    if (manual) {
      return resolvePaymentChannelCategory(payment);
    }
    return { key: 'payment_made', labelKey: 'Payment Made', sortOrder: 19 };
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

  if (type === 'refund') {
    return { key: 'refund', labelKey: 'Refund', sortOrder: 24 };
  }

  return { key: 'other', labelKey: 'Other', sortOrder: 99 };
}

export interface CustomerLedgerCategoryGroup {
  category: CustomerLedgerCategory;
  entries: LedgerStatementEntry[];
  totalDebit: number;
  totalCredit: number;
}

export function groupCustomerLedgerEntries(entries: LedgerStatementEntry[]): CustomerLedgerCategoryGroup[] {
  const map = new Map<string, CustomerLedgerCategoryGroup>();

  for (const entry of entries) {
    const category = resolveCustomerLedgerCategory(entry);
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
