import { createContext, useContext, useState } from 'react'

type UrduDisplayProviderProps = {
  children: React.ReactNode
  storageKey?: string
}

type UrduDisplayProviderState = {
  showUrdu: boolean
  setShowUrdu: (showUrdu: boolean) => void
  /** Show the "Name (Urdu)" input fields on add/edit forms and auto-translate into them as you type. */
  showUrduInput: boolean
  setShowUrduInput: (showUrduInput: boolean) => void
}

const initialState: UrduDisplayProviderState = {
  showUrdu: true,
  setShowUrdu: () => null,
  showUrduInput: true,
  setShowUrduInput: () => null,
}

const UrduDisplayProviderContext = createContext<UrduDisplayProviderState>(initialState)

export function UrduDisplayProvider({
  children,
  storageKey = 'vite-ui-show-urdu',
  ...props
}: UrduDisplayProviderProps) {
  const inputStorageKey = `${storageKey}-input`

  const [showUrdu, _setShowUrdu] = useState<boolean>(
    () => localStorage.getItem(storageKey) !== 'false'
  )
  const [showUrduInput, _setShowUrduInput] = useState<boolean>(
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

  const value = { showUrdu, setShowUrdu, showUrduInput, setShowUrduInput }

  return (
    <UrduDisplayProviderContext.Provider {...props} value={value}>
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
