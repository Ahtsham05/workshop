type BalanceCtx = {
  branchName?: string | null
  name?: string
  balance?: number
  currency?: string
}

type PaymentCtx = {
  branchName?: string | null
  name?: string
  amount?: number
  remainingBalance?: number
  currency?: string
}

function heading(branchName?: string | null) {
  return branchName ? `*${branchName}*\n` : ''
}

function fmt(amount?: number, currency = 'Rs') {
  return `${currency} ${Math.abs(amount ?? 0).toFixed(0)}`
}

export function buildCustomerBalanceMessage({ branchName, name, balance, currency }: BalanceCtx) {
  const h = heading(branchName)
  const greeting = name ? `Dear ${name},\n\n` : ''
  if (!balance || balance === 0) {
    return `${h}\n${greeting}Your account is clear. No outstanding balance.\n\nThank you for your business!`
  }
  if (balance > 0) {
    // Customer owes us (receivable from our side = payable for them)
    return `${h}\n${greeting}This is a reminder that you have an outstanding payable balance of ${fmt(balance, currency)} with us.\n\nPlease make the payment at your earliest convenience.\n\nThank you!`
  }
  // We owe customer (we need to pay back)
  return `${h}\n${greeting}You have a credit balance of ${fmt(balance, currency)} with us. Please contact us to collect your payment.\n\nThank you!`
}

export function buildSupplierBalanceMessage({ branchName, name, balance, currency }: BalanceCtx) {
  const h = heading(branchName)
  const greeting = name ? `Dear ${name},\n\n` : ''
  if (!balance || balance === 0) {
    return `${h}\n${greeting}Your account is fully settled. No outstanding balance.\n\nThank you!`
  }
  if (balance > 0) {
    // We owe supplier
    return `${h}\n${greeting}We want to inform you that we have an outstanding payable of ${fmt(balance, currency)} due to you.\n\nWe will make the payment soon.\n\nThank you for your patience!`
  }
  return `${h}\n${greeting}You have a credit balance of ${fmt(Math.abs(balance), currency)} with us.\n\nPlease contact us for further details.\n\nThank you!`
}

export function buildPaymentReceivedMessage({ branchName, name, amount, remainingBalance, currency }: PaymentCtx) {
  const h = heading(branchName)
  const greeting = name ? `Dear ${name},\n\n` : ''
  const remaining =
    remainingBalance !== undefined
      ? `\nYour remaining balance: ${fmt(Math.abs(remainingBalance), currency)}${remainingBalance < 0 ? ' (credit)' : remainingBalance === 0 ? ' (fully settled)' : ' (payable)'}.`
      : ''
  return `${h}\n${greeting}We have received a payment of ${fmt(amount, currency)} from you. Thank you!\n${remaining}\nThank you for your prompt payment!`
}

export function buildPaymentMadeMessage({ branchName, name, amount, remainingBalance, currency }: PaymentCtx) {
  const h = heading(branchName)
  const greeting = name ? `Dear ${name},\n\n` : ''
  const remaining =
    remainingBalance !== undefined
      ? `\nRemaining balance: ${fmt(Math.abs(remainingBalance), currency)}${remainingBalance <= 0 ? ' (credit)' : ' (payable)'}.`
      : ''
  return `${h}\n${greeting}We have made a payment of ${fmt(amount, currency)} to you.\n${remaining}\nThank you for your services!`
}

type InvoiceSmsCtx = {
  branchName?: string | null
  invoiceNumber?: string | number
  customerName?: string
  total?: number
  paidAmount?: number
  previousBalance?: number
  newBalance?: number
  currency?: string
}

export function buildInvoiceSmsMessage({
  branchName,
  invoiceNumber,
  customerName,
  total,
  paidAmount,
  previousBalance,
  newBalance,
  currency = 'Rs',
}: InvoiceSmsCtx) {
  const h = heading(branchName)
  const greeting = customerName ? `Dear ${customerName},\n` : ''
  const sep = '─────────────────'
  const inv = invoiceNumber ? `Invoice: #${invoiceNumber}` : ''
  const amt = `Invoice Amount: ${fmt(total, currency)}`
  const paid = paidAmount != null ? `Amount Paid: ${fmt(paidAmount, currency)}` : ''
  const prevBal = previousBalance != null ? `\n${sep}\nPrevious Balance: ${fmt(previousBalance, currency)}` : ''
  const newBal = newBalance != null
    ? `New Total Balance: ${newBalance <= 0 ? `${fmt(newBalance, currency)} (Credit)` : fmt(newBalance, currency)}`
    : ''
  const lines = [h, '', greeting, sep, inv, amt, paid, prevBal, newBal, sep, '', 'Thank you for your business!']
  return lines.filter(l => l !== null && l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
