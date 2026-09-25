import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  AppearancePreferences,
  BranchColorKey,
  applyAppearance,
  normalizeAppearance,
  readStoredAppearance,
  readStoredBranchColor,
  writeStoredAppearance,
  writeStoredBranchColor,
} from '@/lib/appearance'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { setUiPreferences } from '@/stores/auth.slice'
import { useUpdateUiPreferencesMutation } from '@/stores/user-preferences.api'
import type { AppDispatch, RootState } from '@/stores/store'

interface AppearanceContextValue {
  preferences: AppearancePreferences
  /** Merge a partial change: applied instantly, then saved to the user's account. */
  setPreferences: (patch: Partial<AppearancePreferences>) => void
  /** Colour of the branch currently being worked in ('' when none is set). */
  branchColor: BranchColorKey
}

const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined)

/**
 * Keeps <html> in sync with (a) the signed-in user's appearance preferences and
 * (b) the active branch's colour.
 *
 * Preferences are read from localStorage first so the app paints correctly on the
 * very first frame, then reconciled with the copy stored on the user account —
 * that is the one that follows them to another device.
 */
export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const [savePreferences] = useUpdateUiPreferencesMutation()

  const [preferences, setPreferencesState] = useState<AppearancePreferences>(() =>
    readStoredAppearance()
  )
  const [branchColor, setBranchColor] = useState<BranchColorKey>(() =>
    readStoredBranchColor()
  )

  // Branch colours are only fetchable once a branch is actually selected; on the
  // sign-in screen this stays skipped so no request 401s.
  const { data: branches } = useGetMyBranchesQuery(undefined, { skip: !activeBranchId })

  // Adopt the account copy once, per signed-in user. After that this browser is the
  // source of truth for the session, so a local change is never clobbered by a refetch.
  const hydratedForUserId = useRef<string | null>(null)
  useEffect(() => {
    const userId = user?.id ?? null
    if (!userId) {
      // Signed out: fall back to whatever is left on this device, which sign-out
      // has already reset to the defaults.
      hydratedForUserId.current = null
      setPreferencesState(readStoredAppearance())
      return
    }
    if (hydratedForUserId.current === userId) return
    hydratedForUserId.current = userId
    if (user?.uiPreferences) {
      const fromAccount = normalizeAppearance(user.uiPreferences)
      setPreferencesState(fromAccount)
      writeStoredAppearance(fromAccount)
    }
  }, [user?.id, user?.uiPreferences])

  // Track the active branch's colour.
  useEffect(() => {
    if (!activeBranchId) {
      // No branch selected (signed out, or not chosen yet) => no tint.
      setBranchColor('')
      writeStoredBranchColor('')
      return
    }
    if (!branches) return
    const active = branches.find((b) => b.id === activeBranchId)
    const key = (active?.appearance?.colorKey ?? '') as BranchColorKey
    setBranchColor(key)
    writeStoredBranchColor(key)
  }, [activeBranchId, branches])

  // The one place that touches the DOM.
  useEffect(() => {
    applyAppearance(preferences, branchColor)
  }, [preferences, branchColor])

  const setPreferences = useCallback(
    (patch: Partial<AppearancePreferences>) => {
      // Built outside the state updater on purpose: an updater runs during React's
      // render phase, and dispatching from there updates other components mid-render.
      const next = normalizeAppearance({ ...preferences, ...patch })
      setPreferencesState(next)
      writeStoredAppearance(next)
      if (user?.id) {
        dispatch(setUiPreferences(next))
        // Fire-and-forget: a failed save only costs this device's copy, which
        // localStorage already holds.
        savePreferences(next)
          .unwrap()
          .catch(() => undefined)
      }
    },
    [dispatch, preferences, savePreferences, user?.id]
  )

  const value = useMemo(
    () => ({ preferences, setPreferences, branchColor }),
    [preferences, setPreferences, branchColor]
  )

  return <AppearanceContext value={value}>{children}</AppearanceContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAppearance = () => {
  const context = useContext(AppearanceContext)
  if (!context) {
    throw new Error('useAppearance must be used within an AppearanceProvider')
  }
  return context
}
