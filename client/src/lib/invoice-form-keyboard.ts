import { useEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/** Run `action` on Enter (no Shift); prevents default. */
export function onEnterAdvance(e: ReactKeyboardEvent, action: () => void) {
  if (e.key !== 'Enter' || e.shiftKey) return
  e.preventDefault()
  action()
}

/** Focus an input/button after popovers close. */
export function focusField(el: HTMLElement | null | undefined, selectText = true) {
  if (!el) return
  window.setTimeout(() => {
    el.focus()
    if (
      selectText &&
      el instanceof HTMLInputElement &&
      !['date', 'datetime-local', 'time', 'month', 'week'].includes(el.type)
    ) {
      el.select()
    }
  }, 50)
}

export type InvoiceSaveShortcutOptions = {
  /** Ctrl+S — when set, runs this instead of save & print receipt */
  onSaveSend?: () => void
}

/**
 * Invoice save shortcuts (sale, purchase & purchase order):
 * Ctrl+Enter — save & print receipt (or save & send on PO when no onSaveSend)
 * Ctrl+S — save & send when `onSaveSend` is set, else save & print receipt
 * Ctrl+D — save only
 * Ctrl+F — save & print A4
 * (Cmd on macOS via metaKey)
 */
export function useInvoiceSaveShortcuts(
  onSaveOnly: () => void,
  onSaveReceipt: () => void,
  onSaveA4: () => void,
  isSaving: boolean,
  options?: InvoiceSaveShortcutOptions,
) {
  const handlersRef = useRef({
    onSaveOnly,
    onSaveReceipt,
    onSaveA4,
    onSaveSend: options?.onSaveSend,
    isSaving,
  })
  handlersRef.current = {
    onSaveOnly,
    onSaveReceipt,
    onSaveA4,
    onSaveSend: options?.onSaveSend,
    isSaving,
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!handlersRef.current.isSaving) handlersRef.current.onSaveReceipt()
        return
      }

      if (e.shiftKey) return

      const key = e.key.toLowerCase()
      let action: (() => void) | undefined
      if (key === 's') {
        action = handlersRef.current.onSaveSend ?? handlersRef.current.onSaveReceipt
      } else if (key === 'd') action = handlersRef.current.onSaveOnly
      else if (key === 'f') action = handlersRef.current.onSaveA4
      else return

      e.preventDefault()
      if (!handlersRef.current.isSaving) action()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
