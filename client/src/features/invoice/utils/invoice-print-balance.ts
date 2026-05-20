import Axios from '@/utils/Axios';
import summery from '@/utils/summery';

/** Balance on the ledger line immediately before this entry (not current account total). */
export function balanceBeforeFromLedgerEntry(entry: {
  balance: number;
  debit?: number;
  credit?: number;
}): number {
  return entry.balance - (Number(entry.debit) || 0) + (Number(entry.credit) || 0);
}

/** Fetch balance before a specific invoice/sale from the server ledger. */
export async function fetchBalanceBeforeInvoice(
  customerId: string | undefined | null,
  referenceId: string | undefined | null,
): Promise<number> {
  if (!customerId || customerId === 'walk-in' || !referenceId) {
    return 0;
  }
  try {
    const base = summery.fetchCustomerBalance.url;
    const url = `${base}/${customerId}/balance-before/${referenceId}`;
    const response = await Axios.get(url);
    return Number(response.data?.balanceBefore ?? 0);
  } catch {
    return 0;
  }
}
