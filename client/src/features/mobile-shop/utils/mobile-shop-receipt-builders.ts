import type { MobileReceiptData } from '@/features/mobile-shop/components/mobile-shop-receipt'
import { fmtRs } from '@/features/mobile-shop/components/mobile-shop-receipt'
import { cashTxLabel } from '@/features/mobile-shop/utils/cash-transaction-labels'
import type {
  CashWithdrawalRecord,
  LoadPurchaseRecord,
  LoadTransactionRecord,
  SimSaleRecord,
} from '@/stores/mobile-shop.api'

const refFromId = (id: string) => String(id).slice(-10).toUpperCase()

const formatDate = (date: string) => {
  try {
    return new Date(date).toLocaleString()
  } catch {
    return date
  }
}

const paymentLabel = (method: string, wallet?: string) =>
  `${method}${wallet ? ` (${wallet})` : ''}`

export function buildLoadPurchaseReceipt(record: LoadPurchaseRecord): MobileReceiptData {
  return {
    title: 'Load purchase',
    reference: refFromId(record.id),
    issuedAt: formatDate(record.date),
    lines: [
      ...(record.supplierName ? [{ label: 'Supplier', value: record.supplierName }] : []),
      { label: 'Total amount', value: fmtRs(record.amount) },
      { label: 'Paid', value: fmtRs(record.paidAmount ?? 0) },
      {
        label: 'Payment',
        value: paymentLabel(record.paymentMethod, record.paymentWalletType),
      },
      { label: 'Wallet', value: record.walletType, previewOnly: true },
      {
        label: 'Remaining',
        value: fmtRs(Math.max(0, Number(record.amount || 0) - Number(record.paidAmount || 0))),
        previewOnly: true,
      },
      { label: 'Commission', value: `${Number(record.commissionRate || 0).toFixed(2)}%`, previewOnly: true },
      { label: 'Savings', value: fmtRs(record.profit ?? 0), previewOnly: true },
    ],
  }
}

export function buildLoadSaleReceipt(record: LoadTransactionRecord): MobileReceiptData {
  return {
    title: 'Load sale',
    reference: refFromId(record.id),
    issuedAt: formatDate(record.date),
    lines: [
      { label: 'Service', value: 'Mobile load' },
      { label: 'Customer', value: record.customerName || '—' },
      { label: 'Mobile', value: record.mobileNumber || '—' },
      { label: 'Total amount', value: fmtRs(record.amount) },
      {
        label: 'Payment',
        value: paymentLabel(record.paymentMethod, record.paymentWalletType),
      },
      { label: 'Wallet', value: record.walletType, previewOnly: true },
      { label: 'Received', value: fmtRs(record.receivedAmount ?? 0), previewOnly: true },
      {
        label: 'Remaining',
        value: fmtRs(Math.max(0, Number(record.amount || 0) - Number(record.receivedAmount || 0))),
        previewOnly: true,
      },
      { label: 'Profit', value: fmtRs(record.profit ?? 0), previewOnly: true },
    ],
  }
}

export function buildCashWithdrawalReceipt(record: CashWithdrawalRecord): MobileReceiptData {
  const isReceived = record.transactionType === 'withdrawal'
  const typeLabel = cashTxLabel(record.transactionType)
  return {
    title: `Cash ${typeLabel.toLowerCase()}`,
    reference: refFromId(record.id),
    issuedAt: formatDate(record.date),
    lines: [
      { label: 'Type', value: typeLabel },
      { label: 'Customer', value: record.customerName?.trim() || 'Walk-in Customer' },
      { label: 'Phone', value: record.customerNumber || '—' },
      { label: 'Total amount', value: fmtRs(record.amount) },
      {
        label: isReceived ? 'Cash paid' : 'Cash received',
        value: fmtRs(record.cashAmount ?? 0),
      },
      { label: 'Wallet', value: record.walletType, previewOnly: true },
      {
        label: 'Remaining',
        value: fmtRs(Math.max(0, Number(record.amount || 0) - Number(record.cashAmount || 0))),
        previewOnly: true,
      },
      { label: 'Account type', value: record.customerAccountType || '—', previewOnly: true },
      { label: 'Commission', value: `${Number(record.commissionRate || 0).toFixed(2)}%`, previewOnly: true },
      { label: 'Profit', value: fmtRs(record.profit ?? 0), previewOnly: true },
      ...(record.notes ? [{ label: 'Notes', value: record.notes, previewOnly: true }] : []),
    ],
  }
}

export function buildSimSaleReceipt(record: SimSaleRecord): MobileReceiptData {
  return {
    title: 'SIM sale',
    reference: `Job #${record.jobNumber}`,
    issuedAt: formatDate(record.date),
    lines: [
      { label: 'Item', value: record.productName || '—' },
      { label: 'Customer', value: record.customerName || '—' },
      { label: 'Mobile', value: record.customerMobile || '—' },
      { label: 'CNIC', value: record.customerCNIC?.trim() || '—' },
      { label: 'Location', value: record.customerLocation?.trim() || '—' },
      { label: 'Total amount', value: fmtRs(record.saleAmount) },
      {
        label: 'Payment',
        value: paymentLabel(record.paymentMethod, record.paymentWalletType),
      },
      { label: 'Load A/C', value: record.walletType || '—', previewOnly: true },
      { label: 'Purchase price', value: fmtRs(record.simAmount), previewOnly: true },
      { label: 'Load amount', value: fmtRs(record.loadAmount), previewOnly: true },
      { label: 'Total cost', value: fmtRs(record.purchaseAmount), previewOnly: true },
      { label: 'Commission', value: fmtRs(record.commission), previewOnly: true },
    ],
  }
}

export function buildBulkCashReceipt(input: {
  transactionType: 'withdrawal' | 'deposit'
  walletType: string
  date: string
  rows: Array<{ amount: number; customerName?: string }>
}): MobileReceiptData {
  const typeLabel = cashTxLabel(input.transactionType)
  const totalAmt = input.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)

  return {
    title: `Bulk cash ${typeLabel.toLowerCase()}`,
    subtitle: `${input.rows.length} entries`,
    issuedAt: formatDate(input.date),
    lines: [
      { label: 'Entries', value: String(input.rows.length) },
      { label: 'Total amount', value: fmtRs(totalAmt) },
      ...input.rows.slice(0, 8).map((row, i) => ({
        label: `#${i + 1}`,
        value: `${fmtRs(row.amount)}${row.customerName ? ` · ${row.customerName}` : ''}`,
      })),
      ...(input.rows.length > 8
        ? [{ label: '…', value: `+ ${input.rows.length - 8} more` }]
        : []),
      { label: 'Wallet', value: input.walletType, previewOnly: true },
    ],
  }
}
