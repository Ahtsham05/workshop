import { createContext, useContext, useEffect, useState } from 'react'
import { useCurrentUser } from '@/context/auth-context'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import {
  resolveNativeLanguage,
  setNativeLanguageCode,
  useNativeLanguage,
  type NativeLanguageInfo,
} from '@/lib/native-language'

// Historical name: this provider now covers the business's native language in general
// (Urdu, Arabic, Hindi, … — see lib/native-language.ts), not only Urdu. `showUrdu` and
// `showUrduInput` keep their names because ~100 components read them.

type UrduDisplayProviderProps = {
  children: React.ReactNode
  storageKey?: string
}

type UrduDisplayProviderState = {
  /** Native names show under English in lists, tables and invoices. False when the business has no native language. */
  showUrdu: boolean
  setShowUrdu: (showUrdu: boolean) => void
  /** Show the "Name (<native>)" input fields on add/edit forms and auto-translate into them as you type. */
  showUrduInput: boolean
  setShowUrduInput: (showUrduInput: boolean) => void
  /** The viewer's own switches, before the "no native language" gate (for the Display settings page). */
  showUrduPreference: boolean
  showUrduInputPreference: boolean
  /** The business's native language; null = English only. */
  nativeLanguage: NativeLanguageInfo | null
}

const initialState: UrduDisplayProviderState = {
  showUrdu: true,
  setShowUrdu: () => null,
  showUrduInput: true,
  setShowUrduInput: () => null,
  showUrduPreference: true,
  showUrduInputPreference: true,
  nativeLanguage: null,
}

const UrduDisplayProviderContext = createContext<UrduDisplayProviderState>(initialState)

/** Keeps the module-level native language in step with the signed-in organization's setting. */
function NativeLanguageSync() {
  const user = useCurrentUser()
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })

  useEffect(() => {
    if (!org) return
    setNativeLanguageCode(resolveNativeLanguage(org.nativeLanguage, org.countryCode))
  }, [org])

  return null
}

export function UrduDisplayProvider({
  children,
  storageKey = 'vite-ui-show-urdu',
  ...props
}: UrduDisplayProviderProps) {
  const inputStorageKey = `${storageKey}-input`
  const nativeLanguage = useNativeLanguage()

  const [showUrduPreference, _setShowUrdu] = useState<boolean>(
    () => localStorage.getItem(storageKey) !== 'false'
  )
  const [showUrduInputPreference, _setShowUrduInput] = useState<boolean>(
    () => localStorage.getItem(inputStorageKey) !== 'false'
  )

  const setShowUrdu = (value: boolean) => {
    localStorage.setItem(storageKey, String(value))
    _setShowUrdu(value)
  }

  const setShowUrduInput = (value: boolean) => {
    localStorage.setItem(inputStorageKey, String(value))
    _setShowUrduInput(value)
  }

  const value = {
    showUrdu: showUrduPreference && nativeLanguage !== null,
    setShowUrdu,
    showUrduInput: showUrduInputPreference && nativeLanguage !== null,
    setShowUrduInput,
    showUrduPreference,
    showUrduInputPreference,
    nativeLanguage,
  }

  return (
    <UrduDisplayProviderContext.Provider {...props} value={value}>
      <NativeLanguageSync />
      {children}
    </UrduDisplayProviderContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useUrduDisplay = () => {
  const context = useContext(UrduDisplayProviderContext)

  if (context === undefined)
    throw new Error('useUrduDisplay must be used within a UrduDisplayProvider')

  return context
}
