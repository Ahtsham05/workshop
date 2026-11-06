/**
 * Logix Plus support contact — the one place the number and email live. Every "contact
 * support" entry point (header Help button, profile menu, trial banner) reads from here.
 */
export const SUPPORT = {
  company: 'Logix Plus Solutions',
  /** International format, digits only (what wa.me and tel: need). */
  phoneE164: '923211626195',
  /** How the number is shown to people. */
  phoneDisplay: '0321 1626195',
  email: 'info@logixplussolutions.com',
} as const

/** Who is asking, so the support team knows the account without asking back. */
export type SupportContext = { userName?: string; businessName?: string; email?: string }

function contextLines({ userName, businessName, email }: SupportContext = {}) {
  return [
    businessName && `Business: ${businessName}`,
    userName && `Name: ${userName}`,
    email && `Login: ${email}`,
  ].filter(Boolean) as string[]
}

/** WhatsApp chat with a ready-to-send greeting that already names the account. */
export function supportWhatsAppUrl(ctx?: SupportContext) {
  const text = ['Hello Logix Plus Support, I need help with my account.', ...contextLines(ctx)].join('\n')
  return `https://wa.me/${SUPPORT.phoneE164}?text=${encodeURIComponent(text)}`
}

export const supportTelUrl = () => `tel:+${SUPPORT.phoneE164}`

export function supportMailUrl(ctx?: SupportContext) {
  const subject = `Support request${ctx?.businessName ? ` — ${ctx.businessName}` : ''}`
  const body = ['Hello Logix Plus Support,', '', 'I need help with:', '', '', '---', ...contextLines(ctx)].join('\n')
  return `mailto:${SUPPORT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
