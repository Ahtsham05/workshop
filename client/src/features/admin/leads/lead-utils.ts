import type { LeadStage, LeadTemperature, OrgSubscriptionView } from '@/stores/admin-leads.api'

export const STAGES: { key: LeadStage; label: string; hint: string; dot: string; chip: string }[] = [
  { key: 'new', label: 'New', hint: 'Signed up, not contacted yet', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900' },
  { key: 'contacted', label: 'Contacted', hint: 'Spoke to them at least once', dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900' },
  { key: 'demo', label: 'Demo / Onboarding', hint: 'Demo booked or helping them set up', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900' },
  { key: 'negotiation', label: 'Negotiation', hint: 'Discussing plan, price or payment', dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900' },
  { key: 'won', label: 'Won', hint: 'Paying customer', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900' },
  { key: 'lost', label: 'Lost', hint: 'Not buying', dot: 'bg-zinc-400', chip: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800' },
]

export const stageMeta = (stage: LeadStage | undefined | null) => STAGES.find((s) => s.key === stage) ?? STAGES[0]

export const TEMPERATURES: { key: LeadTemperature; label: string; className: string }[] = [
  { key: 'hot', label: 'Hot', className: 'text-red-600 dark:text-red-400' },
  { key: 'warm', label: 'Warm', className: 'text-amber-600 dark:text-amber-400' },
  { key: 'cold', label: 'Cold', className: 'text-sky-600 dark:text-sky-400' },
]

export const OUTCOMES: { key: string; label: string }[] = [
  { key: 'reached', label: 'Spoke to them' },
  { key: 'interested', label: 'Interested' },
  { key: 'needs_help', label: 'Needs setup help' },
  { key: 'call_back', label: 'Asked to call back' },
  { key: 'no_answer', label: 'No answer' },
  { key: 'not_interested', label: 'Not interested' },
]

export const LOST_REASONS = [
  'Too expensive',
  'Chose another software',
  'Missing a feature',
  'Not ready / too early',
  'Just exploring',
  'No response',
  'Closed business',
]

export const BUSINESS_TYPE_LABEL: Record<string, string> = {
  mobile_shop: 'Mobile shop',
  retail: 'Retail',
  wholesale: 'Wholesale',
  wholesale_retail: 'Wholesale + Retail',
  distributor: 'Wholesaler / Distributors',
  services: 'Services',
  education: 'Education',
  other: 'Other',
  school: 'School',
  restaurant: 'Restaurant',
  pharmacy: 'Pharmacy',
  healthcare: 'Healthcare',
  factory: 'Factory',
  manufacturing: 'Manufacturing',
}

export const businessTypeLabel = (t?: string | null) => {
  if (!t) return '—'
  return BUSINESS_TYPE_LABEL[t] ?? t.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export const PLAN_LABEL: Record<string, string> = {
  trial: 'Free Trial',
  single: 'Starter',
  starter: 'Starter',
  multi: 'Growth',
  growth: 'Growth',
  business: 'Business',
}
export const planLabel = (p?: string | null) => (p ? PLAN_LABEL[p] ?? p.replace(/^\w/, (c) => c.toUpperCase()) : '—')

/** Subscription pill text + colour, including how long a trial has left. */
export function subscriptionPill(sub: OrgSubscriptionView | undefined) {
  if (!sub) return { label: '—', className: 'bg-muted text-muted-foreground' }
  const days = sub.daysRemaining
  switch (sub.bucket) {
    case 'trial':
      return {
        label: days === 0 ? 'Trial · ends today' : `Trial · ${days}d left`,
        className:
          (days ?? 99) <= 3
            ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900'
            : 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
      }
    case 'paid':
      return {
        label: sub.status === 'active' ? 'Paid · Active' : sub.status === 'pastDue' ? 'Paid · Past due' : 'Paid · Grace',
        className:
          sub.status === 'active'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
            : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
      }
    case 'trial_expired':
      return { label: 'Trial expired', className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900' }
    case 'lapsed':
      return { label: sub.status === 'canceled' ? 'Canceled' : 'Lapsed', className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900' }
    default:
      return { label: sub.status, className: 'bg-muted text-muted-foreground' }
  }
}

// ── Time ─────────────────────────────────────────────────────────────────────────────

export function relativeTime(value: string | Date | null | undefined, now = Date.now()): string {
  if (!value) return '—'
  const t = new Date(value).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = t - now
  const abs = Math.abs(diff)
  const min = 60_000
  const hr = 60 * min
  const day = 24 * hr
  let text: string
  if (abs < min) text = 'just now'
  else if (abs < hr) text = `${Math.round(abs / min)}m`
  else if (abs < day) text = `${Math.round(abs / hr)}h`
  else if (abs < 30 * day) text = `${Math.round(abs / day)}d`
  else if (abs < 365 * day) text = `${Math.round(abs / (30 * day))}mo`
  else text = `${Math.round(abs / (365 * day))}y`
  if (text === 'just now') return text
  return diff < 0 ? `${text} ago` : `in ${text}`
}

export type DueState = 'overdue' | 'now' | 'today' | 'upcoming' | 'none'

/** Follow-up urgency in Pakistan time. */
export function dueState(dueAt: string | null | undefined, now = Date.now()): DueState {
  if (!dueAt) return 'none'
  const t = new Date(dueAt).getTime()
  const pkt = (ms: number) => new Date(ms + 5 * 3600_000).toISOString().slice(0, 10)
  if (t <= now) return pkt(t) < pkt(now) ? 'overdue' : 'now'
  return pkt(t) === pkt(now) ? 'today' : 'upcoming'
}

export const DUE_CLASS: Record<DueState, string> = {
  overdue: 'text-red-600 dark:text-red-400',
  now: 'text-orange-600 dark:text-orange-400',
  today: 'text-amber-700 dark:text-amber-400',
  upcoming: 'text-muted-foreground',
  none: 'text-muted-foreground',
}

/** `YYYY-MM-DDTHH:mm` in Pakistan time, for <input type="datetime-local"> */
export function toPktLocalInput(date: Date): string {
  return new Date(date.getTime() + 5 * 3600_000).toISOString().slice(0, 16)
}
/** Parse a `YYYY-MM-DDTHH:mm` typed in Pakistan time to an ISO instant. */
export function fromPktLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null
  return new Date(`${value.slice(0, 16)}:00+05:00`).toISOString()
}

/** Quick follow-up presets (all land inside 10:00–20:00 PKT when they name a day). */
export function followUpPresets(now = new Date()) {
  const at = (daysAhead: number, hh: number) => {
    const pkt = new Date(now.getTime() + 5 * 3600_000)
    pkt.setUTCDate(pkt.getUTCDate() + daysAhead)
    pkt.setUTCHours(hh, 0, 0, 0)
    return new Date(pkt.getTime() - 5 * 3600_000)
  }
  return [
    { label: 'In 1 hour', date: new Date(now.getTime() + 3600_000) },
    { label: 'In 3 hours', date: new Date(now.getTime() + 3 * 3600_000) },
    { label: 'Tomorrow 11 AM', date: at(1, 11) },
    { label: 'In 3 days', date: at(3, 11) },
    { label: 'Next week', date: at(7, 11) },
  ]
}

// ── Contact ──────────────────────────────────────────────────────────────────────────

/** Digits for wa.me — Pakistani local numbers (03xx…) become 923xx…. */
export function toWhatsAppNumber(phone?: string | null): string | null {
  if (!phone) return null
  let d = phone.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  else if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('03') && d.length === 11) d = `92${d.slice(1)}`
  else if (d.startsWith('3') && d.length === 10) d = `92${d}`
  return d.length >= 8 ? d : null
}

export const whatsappLink = (phone: string | null | undefined, text: string) => {
  const n = toWhatsAppNumber(phone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null
}

export const telLink = (phone?: string | null) => (phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null)

export const mailLink = (email: string | null | undefined, subject: string, body: string) =>
  email ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null

// ── Message templates ────────────────────────────────────────────────────────────────

export type TemplateContext = {
  ownerName?: string | null
  businessName: string
  businessType?: string | null
  daysLeft?: number | null
  senderName?: string | null
}

const firstName = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || 'there'

export const MESSAGE_TEMPLATES: { key: string; label: string; build: (c: TemplateContext) => string }[] = [
  {
    key: 'welcome',
    label: 'Welcome',
    // The team's standard first message to a new trial signup. WhatsApp formatting: *bold*.
    build: () =>
      [
        'Assalam-o-Alaikum! 👋',
        '',
        'Thank you for choosing *Logix Plus Solutions!*',
        '',
        "We noticed that you've recently registered for our free trial.",
        '',
        "I'd love to help you get started and make sure everything is set up according to your business needs.",
        '',
        'May I know what type of business you operate? (Retail Store, Mobile Shop, Wholesale, Distribution, or something else?)',
        '',
        "I'll personally guide you through the software and help you explore the features most useful for your business.",
        '',
        'Looking forward to helping you! 😊',
        '',
        '*Team Logix Plus Solutions*',
      ].join('\n'),
  },
  {
    key: 'activation',
    label: 'Setup check',
    build: (c) =>
      `Hi ${firstName(c.ownerName)}, quick check-in from Logix Plus 🙂\n\nHave you been able to add your products and make your first sale yet? Most ${businessTypeLabel(c.businessType).toLowerCase()} owners start with:\n1. Add products (or import from Excel)\n2. Add a customer\n3. Make an invoice and print it\n\nIf anything is unclear, reply here and I'll guide you step by step.`,
  },
  {
    key: 'demo',
    label: 'Book a demo',
    build: (c) =>
      `Hi ${firstName(c.ownerName)}, I'd love to show you the features that save ${businessTypeLabel(c.businessType).toLowerCase()} owners the most time — stock, profit reports and customer balances — in a free 15-minute screen-share.\n\nWould today or tomorrow work better for you?`,
  },
  {
    key: 'midtrial',
    label: 'Mid-trial review',
    build: (c) =>
      `Hi ${firstName(c.ownerName)}, you're halfway through your Logix Plus trial for ${c.businessName}. How is it going so far?\n\nTell me what's working and what isn't — I can set things up for you, and I'll recommend the plan that fits your business best.`,
  },
  {
    key: 'ending',
    label: 'Trial ending',
    build: (c) =>
      `Hi ${firstName(c.ownerName)}, your Logix Plus free trial for ${c.businessName} ends in ${c.daysLeft ?? 2} day${c.daysLeft === 1 ? '' : 's'}.\n\nTo keep all your data and continue without interruption, you can subscribe from Settings → Billing (bank transfer, JazzCash, Easypaisa or card).\n\nWant me to help you choose the right plan?`,
  },
  {
    key: 'closing',
    label: 'Trial ended',
    build: (c) =>
      `Hi ${firstName(c.ownerName)}, your Logix Plus trial for ${c.businessName} has ended — but your data is safe and nothing is lost.\n\nIf you need a few more days to decide, I can extend your trial. Or I can help you activate a plan today. What would you prefer?`,
  },
  {
    key: 'winback',
    label: 'Win back',
    build: (c) =>
      `Hi ${firstName(c.ownerName)}, it's ${c.senderName || 'the Logix Plus team'}. We've added a lot of new features since you tried Logix Plus for ${c.businessName}.\n\nWould you like a quick 10-minute demo of what's new? Your old account and data are still there.`,
  },
]

/** WhatsApp-formatted text → plain text for email (drops the *bold* markers). */
export const toPlainText = (text: string) => text.replace(/\*([^*\n]+)\*/g, '$1')

/** The message every new WhatsApp / email conversation with a lead starts with. */
export const DEFAULT_TEMPLATE_KEY = 'welcome'

export const templateFor = (key: string | undefined) => MESSAGE_TEMPLATES.find((t) => t.key === key) ?? MESSAGE_TEMPLATES[0]

export const initials = (name?: string | null) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?'
