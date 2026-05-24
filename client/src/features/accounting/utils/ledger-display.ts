export type LedgerParty = 'customer' | 'supplier';

/** Net effect on running balance for one row. */
export function ledgerNetChange(party: LedgerParty, debit: number, credit: number): number {
  const d = Number(debit) || 0;
  const c = Number(credit) || 0;
  return party === 'supplier' ? c - d : d - c;
}

/** Balance immediately before this row (matches server running-balance math). */
export function ledgerBalanceBefore(
  party: LedgerParty,
  entry: { balance: number; debit?: number; credit?: number },
): number {
  const d = Number(entry.debit) || 0;
  const c = Number(entry.credit) || 0;
  return party === 'supplier' ? entry.balance + d - c : entry.balance - d + c;
}

export function isSettledCashRow(debit: number, credit: number): boolean {
  const d = Number(debit) || 0;
  const c = Number(credit) || 0;
  return d > 0 && c > 0 && Math.abs(d - c) < 0.001;
}

export function formatLedgerNetChange(party: LedgerParty, debit: number, credit: number): string {
  const net = ledgerNetChange(party, debit, credit);
  if (Math.abs(net) < 0.001) {
    return '—';
  }
  const sign = net > 0 ? '+' : '−';
  return `${sign}Rs${Math.abs(net).toFixed(2)}`;
}

export function getLedgerBalanceTone(party: LedgerParty, balance: number): string {
  if (Math.abs(balance) < 0.001) {
    return 'text-gray-600';
  }
  if (party === 'supplier') {
    if (balance > 0) return 'text-red-600 font-semibold';
    return 'text-green-600 font-semibold';
  }
  if (balance > 0) return 'text-red-600 font-semibold';
  return 'text-green-600 font-semibold';
}

export function formatLedgerBalanceLabel(
  party: LedgerParty,
  balance: number,
  t: (key: string) => string,
): string {
  const amount = `Rs${Math.abs(balance).toFixed(2)}`;
  if (Math.abs(balance) < 0.001) {
    return amount;
  }
  if (party === 'supplier') {
    return balance > 0 ? `${amount} (${t('Payable')})` : `${amount} (${t('Receivable')})`;
  }
  return balance > 0 ? `${amount} (${t('Receivable')})` : `${amount} (${t('Payable')})`;
}

export const LEDGER_STATEMENT_SORT = 'transactionDate:asc,createdAt:asc';
