import { createContext, useContext, useState } from 'react'

type UrduDisplayProviderProps = {
  children: React.ReactNode
  storageKey?: string
}

type UrduDisplayProviderState = {
  showUrdu: boolean
  setShowUrdu: (showUrdu: boolean) => void
}

const initialState: UrduDisplayProviderState = {
  showUrdu: true,
  setShowUrdu: () => null,
}

const UrduDisplayProviderContext = createContext<UrduDisplayProviderState>(initialState)

export function UrduDisplayProvider({
  children,
  storageKey = 'vite-ui-show-urdu',
  ...props
}: UrduDisplayProviderProps) {
  const [showUrdu, _setShowUrdu] = useState<boolean>(
    () => localStorage.getItem(storageKey) !== 'false'
  )

  const setShowUrdu = (value: boolean) => {
    localStorage.setItem(storageKey, String(value))
    _setShowUrdu(value)
  }

  const value = { showUrdu, setShowUrdu }

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
