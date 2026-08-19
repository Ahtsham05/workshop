import type { AiToolCall } from '@/stores/aiAssistant.api'

const FOLLOW_UPS: Record<string, string[]> = {
  get_profit_summary: ['Compare with last month', 'Show top products', 'Show sales summary'],
  get_top_products: ['Show top customers', 'Which products are low in stock?'],
  get_top_customers: ['Show unpaid customers', 'Show top products'],
  get_unpaid_customers: ['Show payables to suppliers', "What's my cash and bank balance?"],
  get_payables_to_suppliers: ['Show unpaid customers'],
  get_low_stock: ["Which products haven't sold in 30 days?", 'Show top products'],
  get_dead_stock: ['Show low stock products'],
  get_cash_and_bank_summary: ['How much profit did I make this month?', 'Show unpaid customers'],
  get_purchase_summary: ['Show payables to suppliers'],
  get_expense_summary: ['How much profit did I make this month?'],
}

export function getFollowUpsFor(toolCalls: AiToolCall[] | undefined): string[] {
  const lastKnown = [...(toolCalls || [])].reverse().find((tc) => FOLLOW_UPS[tc.name])
  return lastKnown ? FOLLOW_UPS[lastKnown.name] : []
}
