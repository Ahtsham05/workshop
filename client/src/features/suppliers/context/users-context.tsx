import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { Supplier } from '../data/schema'  // Changed from Customer to Supplier

type SuppliersDialogType = 'invite' | 'add' | 'edit' | 'delete'

interface SuppliersContextType {
  open: SuppliersDialogType | null
  setOpen: (str: SuppliersDialogType | null) => void
  currentRow: Supplier | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Supplier | null>>
}

const SuppliersContext = React.createContext<SuppliersContextType | null>(null)

interface Props {
  children: React.ReactNode
}

export default function SuppliersProvider({ children }: Props) {
  const [open, setOpen] = useDialogState<SuppliersDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Supplier | null>(null)

  return (
    <SuppliersContext.Provider value={{ open, setOpen, currentRow, setCurrentRow }}>
      {children}
    </SuppliersContext.Provider>
  )
}

export const useSuppliers = () => {
  const suppliersContext = React.useContext(SuppliersContext)

  if (!suppliersContext) {
    throw new Error('useSuppliers has to be used within <SuppliersProvider>')
  }

  return suppliersContext
}
