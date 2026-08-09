import Axios from '@/utils/Axios';
import summery from '@/utils/summery';

/** Balance on the ledger line immediately before this entry (customer: debit − credit running total). */
export function balanceBeforeFromLedgerEntry(entry: {
  balance: number;
  debit?: number;
  credit?: number;
}): number {
  return entry.balance - (Number(entry.debit) || 0) + (Number(entry.credit) || 0);
}

/** Balance before entry when running total uses credit − debit (supplier payable ledger). */
export function supplierBalanceBeforeFromLedgerEntry(entry: {
  balance: number;
  debit?: number;
  credit?: number;
}): number {
  return entry.balance + (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
}

/** Fetch balance before a specific invoice/sale from the supplier ledger — for a supplier's
 * shadow Customer account, this is the accurate figure (nets purchases and sales together),
 * unlike that shadow customer's own isolated CustomerLedger balance. */
export async function fetchSupplierBalanceBeforeInvoice(
  supplierId: string | undefined | null,
  referenceId: string | undefined | null,
): Promise<number> {
  if (!supplierId || !referenceId) {
    return 0;
  }
  try {
    const base = summery.fetchSupplierBalance.url;
    const url = `${base}/${supplierId}/balance-before/${referenceId}`;
    const response = await Axios.get(url);
    return Number(response.data?.balanceBefore ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Fetch balance before a specific invoice/sale from the server ledger.
 * @param linkedSupplierId - pass when the customer is a supplier's shadow account (see
 * customer.model.js isSupplierAccount) to pull the supplier's true net balance instead of
 * this shadow customer's own isolated sale-only balance.
 */
export async function fetchBalanceBeforeInvoice(
  customerId: string | undefined | null,
  referenceId: string | undefined | null,
  linkedSupplierId?: string | null,
): Promise<number> {
  if (linkedSupplierId) {
    // Supplier ledger convention is positive = payable (we owe them); this function's
    // customer-perspective convention is positive = receivable (they owe us) — negate.
    return -(await fetchSupplierBalanceBeforeInvoice(linkedSupplierId, referenceId));
  }
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
