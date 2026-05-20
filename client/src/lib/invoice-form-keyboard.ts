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
    if (selectText && el instanceof HTMLInputElement) {
      el.select()
    }
  }, 50)
}

/**
 * Invoice save shortcuts (sale & purchase):
 * Ctrl+S — save & print receipt
 * Ctrl+D — save only
 * Ctrl+F — save & print A4
 * (Cmd on macOS via metaKey)
 */
export function useInvoiceSaveShortcuts(
  onSaveOnly: () => void,
  onSaveReceipt: () => void,
  onSaveA4: () => void,
  isSaving: boolean,
) {
  const handlersRef = useRef({ onSaveOnly, onSaveReceipt, onSaveA4, isSaving })
  handlersRef.current = { onSaveOnly, onSaveReceipt, onSaveA4, isSaving }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return

      const key = e.key.toLowerCase()
      let action: (() => void) | undefined
      if (key === 's') action = handlersRef.current.onSaveReceipt
      else if (key === 'd') action = handlersRef.current.onSaveOnly
      else if (key === 'f') action = handlersRef.current.onSaveA4
      else return

      e.preventDefault()
      if (!handlersRef.current.isSaving) action()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
