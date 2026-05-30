export type WalletLike = {
  id?: string
  _id?: string
  type?: string
  balance?: number
  commissionRate?: number
  withdrawalCommissionRate?: number
  depositCommissionRate?: number
  updatedAt?: string
  isActive?: boolean
}

/** Wallets whose name contains "load" use load purchase/sale flows */
export const isLoadWalletName = (name: string) => /load/i.test(name)

export function filterLoadWallets<T extends WalletLike>(wallets: T[]): T[] {
  return wallets.filter((w) => isLoadWalletName(w.type || ''))
}

export function filterCashWallets<T extends WalletLike>(wallets: T[]): T[] {
  return wallets.filter((w) => !isLoadWalletName(w.type || ''))
}

/** Normalize wallet id from API (id or legacy _id) */
export function resolveWalletId(wallet: WalletLike | null | undefined): string {
  if (!wallet) return ''
  const raw = wallet.id ?? wallet._id
  return raw != null ? String(raw) : ''
}

/** Ensure every wallet row has a string id for selects and navigation */
export function normalizeWalletResults<T extends WalletLike>(
  results: T[] | undefined,
): (T & { id: string })[] {
  if (!results?.length) return []
  return results.map((w) => ({
    ...w,
    id: resolveWalletId(w),
  }))
}

/** Decode URL wallet type (+ → space, trim, collapse spaces) */
export function normalizeWalletTypeParam(value?: string): string {
  if (!value) return ''
  try {
    return decodeURIComponent(String(value).replace(/\+/g, ' '))
      .trim()
      .replace(/\s+/g, ' ')
  } catch {
    return String(value).replace(/\+/g, ' ').trim().replace(/\s+/g, ' ')
  }
}

const walletTypesMatch = (a?: string, b?: string) => {
  const left = normalizeWalletTypeParam(a).toLowerCase()
  const right = normalizeWalletTypeParam(b).toLowerCase()
  return left.length > 0 && left === right
}

/** Match wallet from URL search (id first, then type name) */
export function findWalletForNavigation(
  wallets: WalletLike[],
  walletId?: string,
  walletType?: string,
): WalletLike | undefined {
  const id = walletId?.trim()
  if (id) {
    const byId = wallets.find((w) => resolveWalletId(w) === id)
    if (byId) return byId
  }
  const type = normalizeWalletTypeParam(walletType)
  if (type) {
    const exact = wallets.find((w) => walletTypesMatch(w.type, type))
    if (exact) return exact
    return wallets.find((w) =>
      normalizeWalletTypeParam(w.type).toLowerCase().includes(type.toLowerCase()),
    )
  }
  return undefined
}

export type WalletNavSearch = {
  walletId?: string
  walletType?: string
  tab?: 'purchase' | 'sell'
  action?: 'withdrawal' | 'deposit'
}

/** Read wallet navigation params from the current URL (sync, works on client navigation) */
export function readWalletNavFromUrl(): WalletNavSearch {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const tab = params.get('tab')
  const action = params.get('action')
  return {
    walletId: params.get('walletId') || undefined,
    walletType: params.get('walletType') || undefined,
    tab: tab === 'purchase' || tab === 'sell' ? tab : undefined,
    action: action === 'withdrawal' || action === 'deposit' ? action : undefined,
  }
}

export function mergeWalletNavSearch(
  url: WalletNavSearch,
  props: WalletNavSearch,
): WalletNavSearch {
  return {
    walletId: props.walletId ?? url.walletId,
    walletType: props.walletType ?? url.walletType,
    tab: props.tab ?? url.tab,
    action: props.action ?? url.action,
  }
}
