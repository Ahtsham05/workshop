import { sidebarData } from '@/components/layout/data/sidebar-data'
import { WHATSAPP_UI_ENABLED } from '@/config/whatsapp-ui'
import { getGroupOrder } from '@/lib/nav-group-order'
import { type MenuVisibility, buildMenuVisibility, isPathHiddenForBusiness } from '@/lib/business-types'
import {
  type MenuLayout,
  applyMenuLayout,
  groupKey,
  pageKey,
  sectionKey,
  sortGroupsByLayout,
} from '@/lib/menu-layout'

/** What the editor works on: the menu this business can have, in its saved arrangement. */
export type PageState = 'shown' | 'menuHidden' | 'off'

export interface PageInfo {
  url: string
  title: string
  icon?: React.ElementType
}
export type Entry = { kind: 'page'; url: string } | { kind: 'section'; id: string; title: string; icon?: React.ElementType; pages: string[] }
export interface Group {
  id: string
  title: string
  entries: Entry[]
}
export interface Draft {
  groups: Group[]
  labels: Record<string, string>
  states: Record<string, PageState>
}

/** Pages that can't be switched fully off (paying for the app must stay reachable). */
export const LOCKED_URLS = new Set(['/settings/billing'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawItem = any

export interface MenuContext {
  businessType: string
  email?: string
  manufacturingOn: boolean
  warehousesOn: boolean
}

/** Every page this business type can have — roles and on/off choices ignored on purpose. */
const applies = (item: RawItem, ctx: MenuContext) => {
  if (item.systemRole || item.allowedSchoolRoles?.length) return false
  if (item.allowedEmails?.length && !item.allowedEmails.includes(ctx.email)) return false
  if (item.businessTypes?.length && !item.businessTypes.includes(ctx.businessType)) return false
  if (item.excludeBusinessTypes?.includes(ctx.businessType)) return false
  if (item.module === 'manufacturing' && !ctx.manufacturingOn) return false
  if (item.module === 'warehouses' && !ctx.warehousesOn) return false
  if (!WHATSAPP_UI_ENABLED && (item.url === '/school/whatsapp' || String(item.url ?? '').startsWith('/whatsapp'))) return false
  return true
}

/** The menu tree (groups → pages / sub-menus → pages) under `layout`, plus page info by url. */
export function buildTree(ctx: MenuContext, layout: MenuLayout | null) {
  const pages = new Map<string, PageInfo>()
  const titleOf = (item: RawItem) =>
    item.url === '/mobile-shop/imei-tracking' && ctx.businessType !== 'mobile_shop' ? 'Serial Number Tracking' : item.title
  const addPage = (item: RawItem) => {
    const url = String(item.url)
    if (pages.has(url)) return null // a url listed twice is edited once, where it first appears
    pages.set(url, { url, title: titleOf(item), icon: item.icon })
    return url
  }

  const order = getGroupOrder(ctx.businessType)
  const groups = applyMenuLayout(sidebarData.navGroups, layout)
    .map((group) => {
      const entries: Entry[] = []
      for (const item of group.items as RawItem[]) {
        if (!applies(item, ctx)) continue
        if (item.items) {
          const children = (item.items as RawItem[]).filter((c) => applies(c, ctx)).map(addPage).filter((u): u is string => !!u)
          entries.push({ kind: 'section', id: item.menuId, title: item.title, icon: item.icon, pages: children })
        } else if (item.url) {
          const url = addPage(item)
          if (url) entries.push({ kind: 'page', url })
        }
      }
      return { id: String(group.id), title: group.title, entries }
    })
    // Empty sub-menus stay (pages can be dragged into them); empty groups never had any page here.
    .filter((group) => group.entries.some((e) => e.kind === 'page' || e.pages.length > 0))
    .sort((a, b) => {
      const ai = order.indexOf(a.title)
      const bi = order.indexOf(b.title)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  return { groups: sortGroupsByLayout(groups, layout), pages }
}

export function initialDraft(
  groups: Group[],
  pageUrls: string[],
  businessType: string,
  visibility: MenuVisibility,
  layout: MenuLayout | null,
): Draft {
  const menuHidden = new Set(layout?.menuHidden ?? [])
  const states: Record<string, PageState> = {}
  for (const url of pageUrls) {
    states[url] = isPathHiddenForBusiness(businessType, url, visibility) ? 'off' : menuHidden.has(url) ? 'menuHidden' : 'shown'
  }
  return { groups, labels: { ...(layout?.labels ?? {}) }, states }
}

/** Container key a page sits in: 'g:<groupId>' or 's:<sectionId>'. */
export function containerOf(groups: Group[], url: string): string | null {
  for (const group of groups) {
    for (const entry of group.entries) {
      if (entry.kind === 'page' && entry.url === url) return groupKey(group.id)
      if (entry.kind === 'section' && entry.pages.includes(url)) return sectionKey(entry.id)
    }
  }
  return null
}

const entryKeyOf = (entry: Entry) => (entry.kind === 'page' ? pageKey(entry.url) : sectionKey(entry.id))

const containerOrders = (groups: Group[]) => {
  const out: Record<string, string[]> = {}
  for (const group of groups) {
    out[groupKey(group.id)] = group.entries.map(entryKeyOf)
    for (const entry of group.entries) if (entry.kind === 'section') out[sectionKey(entry.id)] = entry.pages.map(pageKey)
  }
  return out
}

const sameList = (a?: string[], b?: string[]) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i])

/**
 * What gets saved: on/off for every page (diffs vs the business-type defaults) and the
 * arrangement (only what differs from the built-in menu). Choices the org made for pages
 * this business can't currently have (e.g. before a type change) are kept as they were.
 */
export function serialize(
  draft: Draft,
  defaults: Group[],
  pageUrls: string[],
  businessType: string,
  saved: { visibility: MenuVisibility; layout: MenuLayout | null },
): { menuVisibility: MenuVisibility; menuLayout: MenuLayout } {
  const listed = new Set(pageUrls)
  const shown = (url: string) => LOCKED_URLS.has(url) || draft.states[url] !== 'off'
  const keptVisibility = Object.fromEntries(Object.entries(saved.visibility).filter(([url]) => !listed.has(url)))
  const menuVisibility = { ...keptVisibility, ...buildMenuVisibility(businessType, pageUrls, shown) }

  const prev = saved.layout ?? {}
  const currentOrders = containerOrders(draft.groups)
  const defaultOrders = containerOrders(defaults)

  const placement: Record<string, string> = Object.fromEntries(
    Object.entries(prev.placement ?? {}).filter(([url]) => !listed.has(url)),
  )
  for (const url of pageUrls) {
    const now = containerOf(draft.groups, url)
    if (now && now !== containerOf(defaults, url)) placement[url] = now
  }

  const order: Record<string, string[]> = Object.fromEntries(
    Object.entries(prev.order ?? {}).filter(([container]) => !(container in currentOrders)),
  )
  for (const [container, keys] of Object.entries(currentOrders)) {
    if (!sameList(keys, defaultOrders[container])) order[container] = keys
  }

  const groupIds = draft.groups.map((g) => g.id)
  const defaultGroupIds = defaults.map((g) => g.id)

  const labels = Object.fromEntries(
    Object.entries(draft.labels)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value.length > 0),
  )

  const menuHidden = [
    ...(prev.menuHidden ?? []).filter((url) => !listed.has(url)),
    ...pageUrls.filter((url) => draft.states[url] === 'menuHidden'),
  ]

  const menuLayout: MenuLayout = {}
  if (Object.keys(labels).length) menuLayout.labels = labels
  if (!sameList(groupIds, defaultGroupIds)) menuLayout.groupOrder = groupIds
  if (Object.keys(placement).length) menuLayout.placement = placement
  if (Object.keys(order).length) menuLayout.order = order
  if (menuHidden.length) menuLayout.menuHidden = menuHidden
  return { menuVisibility, menuLayout }
}

/** Moves a page to `container` at `index` (end when omitted). Returns new groups. */
export function movePage(groups: Group[], url: string, container: string, index?: number): Group[] {
  const next = groups.map((g) => ({
    ...g,
    entries: g.entries
      .filter((e) => !(e.kind === 'page' && e.url === url))
      .map((e) => (e.kind === 'section' ? { ...e, pages: e.pages.filter((p) => p !== url) } : e)),
  }))
  for (const group of next) {
    if (container === groupKey(group.id)) {
      const at = index === undefined ? group.entries.length : Math.max(0, Math.min(index, group.entries.length))
      group.entries.splice(at, 0, { kind: 'page', url })
      return next
    }
    for (const entry of group.entries) {
      if (entry.kind === 'section' && container === sectionKey(entry.id)) {
        const at = index === undefined ? entry.pages.length : Math.max(0, Math.min(index, entry.pages.length))
        entry.pages.splice(at, 0, url)
        return next
      }
    }
  }
  return groups
}
