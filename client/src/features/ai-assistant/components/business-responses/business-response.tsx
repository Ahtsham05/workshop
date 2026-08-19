import type { ReactNode } from 'react'
import { Wallet, ShoppingCart, Receipt } from 'lucide-react'
import type { AiToolCall } from '@/stores/aiAssistant.api'
import { BusinessStatCard } from './stat-card'
import { RecordListCard, type BusinessListItem } from './record-list-card'
import { ProfitSummaryCard } from './profit-summary-card'
import { formatMoney } from '../../lib/format'

/**
 * Maps a known AI tool result to one of the two generic business-data cards. Unrecognized tool
 * names (including any added to the backend later) simply render nothing here — the assistant's
 * own prose reply in the message bubble already answers the question either way, so this is a
 * pure enhancement, never a requirement for the chat to work.
 */
function renderCard(toolCall: AiToolCall, key: string): ReactNode | null {
  const result = toolCall.result as Record<string, unknown> | null | undefined
  if (!result || typeof result !== 'object' || 'error' in result) return null

  switch (toolCall.name) {
    case 'get_profit_summary':
      return <ProfitSummaryCard key={key} toolCall={toolCall} />

    case 'get_top_products': {
      const products = (result.products as { name: string; quantitySold: number; revenue: number }[]) || []
      return (
        <RecordListCard
          key={key}
          title='Top Products'
          items={products.map((p) => ({ primary: p.name, secondary: `${p.quantitySold} sold`, value: formatMoney(p.revenue) }))}
          emptyMessage='No sales in this period yet.'
        />
      )
    }

    case 'get_top_customers': {
      const customers = (result.customers as { name: string; totalPurchases: number; totalAmount: number }[]) || []
      return (
        <RecordListCard
          key={key}
          title='Top Customers'
          items={customers.map((c) => ({
            primary: c.name,
            secondary: `${c.totalPurchases} purchase${c.totalPurchases === 1 ? '' : 's'}`,
            value: formatMoney(c.totalAmount),
          }))}
          emptyMessage='No customer purchases in this period yet.'
        />
      )
    }

    case 'get_unpaid_customers': {
      const customers = (result.customers as { name: string; phone?: string; balance: number }[]) || []
      const totalOutstanding = result.totalOutstanding as number
      const customerCount = result.customerCount as number
      return (
        <RecordListCard
          key={key}
          title='Unpaid Customers'
          items={customers.map((c) => ({ primary: c.name, secondary: c.phone, value: formatMoney(c.balance) }))}
          totalCount={customerCount}
          emptyMessage='Everyone is paid up — no outstanding balances.'
          footerNote={customers.length > 0 ? `Total outstanding: ${formatMoney(totalOutstanding)}` : undefined}
        />
      )
    }

    case 'get_payables_to_suppliers': {
      const suppliers = (result.suppliers as { name: string; phone?: string; balance: number }[]) || []
      const totalPayable = result.totalPayable as number
      return (
        <RecordListCard
          key={key}
          title='Payables to Suppliers'
          items={suppliers.map((s) => ({ primary: s.name, secondary: s.phone, value: formatMoney(s.balance) }))}
          emptyMessage="You don't owe any suppliers right now."
          footerNote={suppliers.length > 0 ? `Total payable: ${formatMoney(totalPayable)}` : undefined}
        />
      )
    }

    case 'get_low_stock': {
      const products = (result.products as { name: string; category: string; stockQuantity: number }[]) || []
      return (
        <RecordListCard
          key={key}
          title='Low Stock'
          items={products.map((p) => ({ primary: p.name, secondary: p.category, value: `${p.stockQuantity} left` }))}
          totalCount={result.productCount as number}
          emptyMessage='Nothing is low on stock right now.'
        />
      )
    }

    case 'get_dead_stock': {
      const products = (result.products as { name: string; category: string; stockQuantity: number }[]) || []
      const days = result.days as number
      return (
        <RecordListCard
          key={key}
          title={`No Sales in ${days} Days`}
          items={products.map((p) => ({ primary: p.name, secondary: p.category, value: `${p.stockQuantity} in stock` }))}
          totalCount={result.productCount as number}
          emptyMessage='Every product has sold recently.'
        />
      )
    }

    case 'get_stock_movements': {
      const adjustments = (result.adjustments as { type: string; count: number; totalValue: number }[]) || []
      const transfers = result.completedTransfersCount as number
      return (
        <RecordListCard
          key={key}
          icon={<ShoppingCart className='h-3.5 w-3.5' />}
          title='Stock Movements'
          items={adjustments.map((a) => ({
            primary: a.type.charAt(0).toUpperCase() + a.type.slice(1),
            secondary: `${a.count} adjustment${a.count === 1 ? '' : 's'}`,
            value: formatMoney(a.totalValue),
          }))}
          emptyMessage='No stock adjustments in this period.'
          footerNote={transfers ? `${transfers} branch transfer${transfers === 1 ? '' : 's'} completed` : undefined}
        />
      )
    }

    case 'get_cash_and_bank_summary': {
      const cashInHand = result.cashInHand as number
      const bankAccountsTotal = result.bankAccountsTotal as number
      const grandTotal = result.grandTotal as number
      return (
        <BusinessStatCard
          key={key}
          icon={<Wallet className='h-3.5 w-3.5' />}
          title='Cash & Bank'
          value={formatMoney(grandTotal)}
          stats={[
            { label: 'Cash in Hand', value: formatMoney(cashInHand) },
            { label: 'Bank Accounts', value: formatMoney(bankAccountsTotal) },
          ]}
        />
      )
    }

    case 'get_purchase_summary': {
      const totalAmount = result.totalAmount as number
      return (
        <BusinessStatCard
          key={key}
          icon={<ShoppingCart className='h-3.5 w-3.5' />}
          title='Purchases'
          value={formatMoney(totalAmount)}
          stats={[
            { label: 'Orders', value: String(result.purchaseCount) },
            { label: 'Paid', value: formatMoney(result.totalPaid as number) },
            { label: 'Outstanding', value: formatMoney(result.totalOutstanding as number) },
          ]}
        />
      )
    }

    case 'get_expense_summary': {
      const byCategory = (result.byCategory as { category: string; total: number }[]) || []
      const totalExpenses = result.totalExpenses as number
      return (
        <RecordListCard
          key={key}
          icon={<Receipt className='h-3.5 w-3.5' />}
          title='Expenses by Category'
          items={byCategory.map((c) => ({ primary: c.category, value: formatMoney(c.total) }))}
          emptyMessage='No expenses recorded in this period.'
          footerNote={byCategory.length > 0 ? `Total: ${formatMoney(totalExpenses)}` : undefined}
        />
      )
    }

    case 'get_repair_jobs_summary': {
      const stages: [string, unknown][] = [
        ['Pending', result.pending],
        ['In Progress', result.inProgress],
        ['Completed', result.completed],
        ['Delivered', result.delivered],
      ]
      const items: BusinessListItem[] = stages
        .filter((entry): entry is [string, { count: number; totalCharges: number }] => Boolean(entry[1]))
        .map(([label, stage]) => ({
          primary: label,
          secondary: `${stage.count} job${stage.count === 1 ? '' : 's'}`,
          value: formatMoney(stage.totalCharges),
        }))
      return <RecordListCard key={key} title='Repair Jobs' items={items} emptyMessage='No repair jobs in this period.' />
    }

    case 'get_salesman_commissions_summary': {
      const salesmen = (result.salesmen as { name: string; balance: number }[]) || []
      return (
        <RecordListCard
          key={key}
          title='Salesman Commissions'
          items={salesmen.map((s) => ({ primary: s.name, value: formatMoney(s.balance) }))}
          emptyMessage='No commission balances right now.'
          footerNote={salesmen.length > 0 ? `Total payable: ${formatMoney(result.totalPayable as number)}` : undefined}
        />
      )
    }

    case 'search_customer':
    case 'search_supplier': {
      const matches = (result.matches as { name: string; phone?: string; balance: number }[]) || []
      const label = toolCall.name === 'search_customer' ? 'Customer' : 'Supplier'
      return (
        <RecordListCard
          key={key}
          title={`${label} Matches`}
          items={matches.map((m) => ({ primary: m.name, secondary: m.phone, value: formatMoney(m.balance) }))}
          emptyMessage={`No matching ${label.toLowerCase()} found.`}
        />
      )
    }

    case 'search_product': {
      const matches = (result.matches as { name: string; category: string; stockQuantity: number; price: number }[]) || []
      return (
        <RecordListCard
          key={key}
          title='Product Matches'
          items={matches.map((m) => ({
            primary: m.name,
            secondary: m.category,
            value: formatMoney(m.price),
            valueSub: `${m.stockQuantity} in stock`,
          }))}
          emptyMessage='No matching product found.'
        />
      )
    }

    default:
      return null
  }
}

export function BusinessResponse({ toolCalls }: { toolCalls: AiToolCall[] | undefined }) {
  if (!toolCalls || toolCalls.length === 0) return null
  const cards = toolCalls
    .map((tc, i) => renderCard(tc, `${tc.name}-${i}`))
    .filter((node): node is ReactNode => node !== null)
    .slice(0, 2)

  if (cards.length === 0) return null
  return <div className='mt-2 flex flex-col gap-2'>{cards}</div>
}
