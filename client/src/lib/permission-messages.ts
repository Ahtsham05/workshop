const PERMISSION_MESSAGE_FALLBACKS: Record<string, string> = {
  no_permission_edit_invoice: 'You do not have permission to edit invoices.',
  no_permission_delete_invoice: 'You do not have permission to delete invoices.',
  no_permission_create_invoice: 'You do not have permission to create invoices.',
  no_permission_print_invoice: 'You do not have permission to print invoices.',
  no_permission_view_dashboard: 'You do not have permission to view the dashboard.',
  permission_denied: 'You do not have permission to perform this action.',
}

/** User-facing permission text with English fallback when i18n key is missing. */
export function permissionMessage(t: (key: string) => string, key: string): string {
  const translated = t(key)
  if (translated !== key) return translated
  return PERMISSION_MESSAGE_FALLBACKS[key] ?? PERMISSION_MESSAGE_FALLBACKS.permission_denied
}

/** Prefer server message; otherwise map known keys or return a generic denial. */
export function apiPermissionMessage(
  t: (key: string) => string,
  error: { data?: { message?: string } } | undefined,
  fallbackKey = 'permission_denied',
): string {
  const serverMessage = error?.data?.message?.trim()
  if (serverMessage && !serverMessage.includes('_')) return serverMessage
  return permissionMessage(t, fallbackKey)
}
