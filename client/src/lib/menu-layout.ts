/**
 * Settings → Menu & Pages: an organization's own sidebar arrangement, saved on the
 * Organization as `menuLayout` and applied on top of the built-in sidebar
 * (components/layout/data/sidebar-data.ts) before any role / business-type filtering:
 *
 *  - labels      custom names for groups, sub-menus and pages
 *  - groupOrder  order of the sidebar groups
 *  - placement   pages moved to another sub-menu, or out of one to the top level of a group
 *  - order       order of the entries inside a group / sub-menu
 *  - menuHidden  pages left out of the sidebar but still working (links, search, Quick Links)
 *
 * Switching a page fully off is separate (menuVisibility, lib/business-types.ts).
 * Ids are derived from the built-in titles, not the custom labels, so renaming never
 * breaks the arrangement. Anything the layout doesn't mention keeps its built-in place,
 * so pages added in later releases simply appear where they were designed to.
 */

export interface MenuLayout {
  /** 'g:<groupId>' | 's:<sectionId>' | 'p:<url>' → custom name */
  labels?: Record<string, string>
  /** group ids in display order */
  groupOrder?: string[]
  /** page url → container: 'g:<groupId>' (top level of a group) or 's:<sectionId>' (a sub-menu) */
  placement?: Record<string, string>
  /** container ('g:<groupId>' | 's:<sectionId>') → entry keys in order ('p:<url>' | 's:<sectionId>') */
  order?: Record<string, string[]>
  /** page urls hidden from the sidebar but still reachable */
  menuHidden?: string[]
}

// Sidebar items are a loosely typed tree (see components/layout/types.ts); this module
// only moves them around and never reads type-specific fields beyond the ones below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyItem = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGroup = { title: string; id?: string; items: any[]; collapsible?: boolean }

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x'

export const pageKey = (url: string) => `p:${url}`
export const groupKey = (groupId: string) => `g:${groupId}`
export const sectionKey = (sectionId: string) => `s:${sectionId}`

/** Gating a sub-menu passes down to a page moved out of it, so it stays scoped the same way. */
const INHERITED_GATES = ['businessTypes', 'excludeBusinessTypes', 'module', 'requiredFeature', 'allowedEmails', 'systemRole'] as const

/** Copies of the built-in groups with stable ids on every group and sub-menu. */
export function withMenuIds<G extends AnyGroup>(groups: readonly G[]): G[] {
  const seen = new Map<string, number>()
  return groups.map((group) => {
    const base = slug(group.title)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const id = n === 1 ? base : `${base}-${n}`
    return {
      ...group,
      id,
      items: group.items.map((item: AnyItem) =>
        item.items ? { ...item, menuId: `${id}/${slug(item.title)}`, items: [...item.items] } : item,
      ),
    }
  })
}

const sortByOrder = <T>(list: T[], order: string[] | undefined, keyOf: (item: T) => string): T[] => {
  if (!order?.length) return list
  const rank = new Map(order.map((key, index) => [key, index]))
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ra = rank.get(keyOf(a.item))
      const rb = rank.get(keyOf(b.item))
      if (ra !== undefined && rb !== undefined) return ra - rb
      if (ra !== undefined) return -1
      if (rb !== undefined) return 1
      return a.index - b.index
    })
    .map(({ item }) => item)
}

export const entryKey = (item: AnyItem) => (item.items ? sectionKey(item.menuId) : pageKey(String(item.url)))

/**
 * The built-in sidebar rearranged by `layout` (moves + order; labels are applied later,
 * after filtering and sorting, by applyMenuLabels). Group order is left to the caller.
 */
export function applyMenuLayout<G extends AnyGroup>(groups: readonly G[], layout?: MenuLayout | null): G[] {
  const result = withMenuIds(groups)
  if (!layout) return result

  const containers = new Map<string, AnyItem[]>()
  const sections = new Map<string, AnyItem>()
  // Where each page lives now (first occurrence wins for duplicated urls).
  const location = new Map<string, { list: AnyItem[]; item: AnyItem; parent: AnyItem | null }>()
  for (const group of result) {
    containers.set(groupKey(group.id!), group.items)
    for (const item of group.items) {
      if (item.items) {
        containers.set(sectionKey(item.menuId), item.items)
        sections.set(sectionKey(item.menuId), item)
        for (const child of item.items) {
          if (child.url && !location.has(String(child.url))) location.set(String(child.url), { list: item.items, item: child, parent: item })
        }
      } else if (item.url && !location.has(String(item.url))) {
        location.set(String(item.url), { list: group.items, item, parent: null })
      }
    }
  }

  for (const [url, target] of Object.entries(layout.placement ?? {})) {
    const from = location.get(url)
    const to = containers.get(target)
    if (!from || !to || from.list === to) continue
    from.list.splice(from.list.indexOf(from.item), 1)
    let moved = from.item
    if (from.parent) {
      // Leaving a sub-menu: keep the sub-menu's business-type / module scoping.
      moved = { ...moved }
      for (const gate of INHERITED_GATES) {
        if (moved[gate] === undefined && from.parent[gate] !== undefined) moved[gate] = from.parent[gate]
      }
    }
    to.push(moved)
    const targetSection = sections.get(target)
    if (targetSection) {
      // A sub-menu holding pages from elsewhere: each page is gated by its own permission.
      targetSection.permission = undefined
      targetSection.anyPermission = undefined
      targetSection.requiredFeature = undefined
    }
    location.set(url, { list: to, item: moved, parent: targetSection ?? null })
  }

  for (const group of result) {
    group.items = sortByOrder(group.items, layout.order?.[groupKey(group.id!)], entryKey)
    group.items = group.items.map((item: AnyItem) =>
      item.items
        ? { ...item, items: sortByOrder(item.items, layout.order?.[sectionKey(item.menuId)], (child: AnyItem) => pageKey(String(child.url))) }
        : item,
    )
  }
  return result
}

/** Sorts already-filtered groups by the saved group order (others keep `fallback` order after). */
export function sortGroupsByLayout<G extends { id?: string }>(groups: G[], layout?: MenuLayout | null): G[] {
  return sortByOrder(groups, layout?.groupOrder, (g) => String(g.id))
}

/** Replaces titles with the organization's custom names. */
export function applyMenuLabels<G extends AnyGroup>(groups: G[], layout?: MenuLayout | null): G[] {
  const labels = layout?.labels
  if (!labels || !Object.keys(labels).length) return groups
  const label = (key: string, fallback: string) => labels[key]?.trim() || fallback
  return groups.map((group) => ({
    ...group,
    title: label(groupKey(String(group.id)), group.title),
    items: group.items.map((item: AnyItem) =>
      item.items
        ? {
            ...item,
            title: label(sectionKey(item.menuId), item.title),
            items: item.items.map((child: AnyItem) => ({ ...child, title: label(pageKey(String(child.url)), child.title) })),
          }
        : { ...item, title: label(pageKey(String(item.url)), item.title) },
    ),
  }))
}
