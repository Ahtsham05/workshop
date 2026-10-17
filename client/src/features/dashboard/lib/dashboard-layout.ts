import { useCallback, useMemo, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '@/stores/store'
import { setUiPreferences } from '@/stores/auth.slice'
import { useUpdateDashboardLayoutMutation } from '@/stores/user-preferences.api'

/**
 * The person's own dashboard arrangement (Arrange dashboard): the order of the page sections
 * and of the KPI cards. Saved on the account (User.uiPreferences.dashboardLayout) so it
 * follows them to every device; an empty list means "the standard order".
 *
 * Only ids are stored. Cards that are not shown for this business (or are new since the
 * layout was saved) simply take their standard place after the arranged ones.
 */

export interface DashboardLayout {
  sections: string[]
  cards: string[]
}

export const DASHBOARD_SECTIONS = ['quick-links', 'kpis', 'charts', 'top-lists', 'activities', 'upcoming'] as const
export type DashboardSectionId = (typeof DASHBOARD_SECTIONS)[number]

const EMPTY: DashboardLayout = { sections: [], cards: [] }

const cleanIds = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === 'string' && /^[a-z0-9-]{1,60}$/.test(v)))].slice(0, max)
    : []

export function normalizeDashboardLayout(value: unknown): DashboardLayout {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return { sections: cleanIds(v.sections, 20), cards: cleanIds(v.cards, 100) }
}

/** Puts `ids` in the saved order; ids the saved order doesn't know keep their standard place at the end. */
export function applyOrder<T extends string>(ids: readonly T[], saved: string[]): T[] {
  if (!saved.length) return [...ids]
  const rank = new Map(saved.map((id, i) => [id, i]))
  return [...ids]
    .map((id, index) => ({ id, index }))
    .sort((a, b) => {
      const ra = rank.get(a.id)
      const rb = rank.get(b.id)
      if (ra != null && rb != null) return ra - rb
      if (ra != null) return -1
      if (rb != null) return 1
      return a.index - b.index
    })
    .map((x) => x.id)
}

export function useDashboardLayout() {
  const dispatch = useDispatch<AppDispatch>()
  const stored = useSelector((state: RootState) => (state.auth.data?.user as { uiPreferences?: { dashboardLayout?: unknown } } | undefined)?.uiPreferences?.dashboardLayout)
  const layout = useMemo(() => normalizeDashboardLayout(stored), [stored])
  const [save] = useUpdateDashboardLayoutMutation()
  const latest = useRef(layout)
  latest.current = layout

  const update = useCallback(
    (patch: Partial<DashboardLayout>) => {
      const next = { ...latest.current, ...patch }
      // Instant on screen (and in the cached user), then saved to the account.
      dispatch(setUiPreferences({ dashboardLayout: next }))
      save({ dashboardLayout: next })
        .unwrap()
        .catch(() => undefined)
    },
    [dispatch, save]
  )

  const reset = useCallback(() => update(EMPTY), [update])
  const isCustomised = layout.sections.length > 0 || layout.cards.length > 0
  return { layout, update, reset, isCustomised }
}
