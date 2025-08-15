import React, { useState, createContext, useContext } from 'react'
import { Account } from '../data/schema'

export type AccountDialogType = 'add' | 'edit' | 'delete' | null

interface AccountsContextType {
  open: AccountDialogType | null
  setOpen: (value: AccountDialogType | null) => void
  currentAccount: Account | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Account | null>>
}

const AccountsContext = createContext<AccountsContextType | null>(null)

export default function AccountsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<AccountDialogType>(null)
  const [currentAccount, setCurrentRow] = useState<Account | null>(null)

  return (
    <AccountsContext.Provider value={{ open, setOpen, currentAccount, setCurrentRow }}>
      {children}
    </AccountsContext.Provider>
  )
}

export const useAccounts = () => {
  const context = useContext(AccountsContext)
  if (!context) throw new Error('useAccounts must be used within AccountsProvider')
  return context
}
