import { createContext, useContext } from 'react'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * `await confirm({ title, description, destructive })` → true when the user confirms.
 * Uses the app's ConfirmDialog (provided by the Manufacturing shell); outside the shell
 * it falls back to the browser prompt so callers never break.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  return (
    ctx ||
    (async ({ title, description }) =>
      window.confirm([title, description].filter(Boolean).join('\n\n')))
  )
}
