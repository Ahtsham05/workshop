import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { MobileRepair } from '../data/schema'

type MobileRepairDialogType = 'add' | 'edit' | 'delete'

interface MobileRepairContextType {
  open: MobileRepairDialogType | null
  setOpen: (state: MobileRepairDialogType | null) => void
  currentRow: MobileRepair | null
  setCurrentRow: React.Dispatch<React.SetStateAction<MobileRepair | null>>
}

const MobileRepairContext = React.createContext<MobileRepairContextType | null>(null)

interface Props {
  children: React.ReactNode
}

export default function MobileRepairProvider({ children }: Props) {
  const [open, setOpen] = useDialogState<MobileRepairDialogType>(null)
  const [currentRow, setCurrentRow] = useState<MobileRepair | null>(null)

  return (
    <MobileRepairContext.Provider value={{ open, setOpen, currentRow, setCurrentRow }}>
      {children}
    </MobileRepairContext.Provider>
  )
}

export const useMobileRepair = () => {
  const context = React.useContext(MobileRepairContext)

  if (!context) {
    throw new Error('useMobileRepair must be used within <MobileRepairProvider>')
  }

  return context
}
