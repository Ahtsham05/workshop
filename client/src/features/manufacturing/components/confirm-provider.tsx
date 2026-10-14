import { useCallback, useRef, useState } from 'react'
import { useLanguage } from '@/context/language-context'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ConfirmContext, type ConfirmOptions } from '../lib/confirm'

/** Hosts one ConfirmDialog for the module and resolves `useConfirm()` promises. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage()
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false)
        resolver.current = resolve
        setOptions(next)
      }),
    []
  )

  const settle = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={!!options}
        onOpenChange={(open) => !open && settle(false)}
        title={options?.title || ''}
        desc={options?.description || ''}
        confirmText={options?.confirmText || t('Confirm')}
        cancelBtnText={options?.cancelText || t('Cancel')}
        destructive={options?.destructive}
        handleConfirm={() => settle(true)}
      />
    </ConfirmContext.Provider>
  )
}
