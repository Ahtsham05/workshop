import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

/**
 * Run `action` on Enter (no Shift); prevents default. Auto-repeat from a held-down
 * Enter is swallowed — otherwise holding the key races through qty → price → the next
 * row's product picker in a fraction of a second.
 */
export function onEnterAdvance(e: ReactKeyboardEvent, action: () => void) {
  if (e.key !== 'Enter' || e.shiftKey) return
  e.preventDefault()
  if (e.repeat) return
  action()
}

const PICKER_NAV_KEYS = new Set(['ArrowDown', 'ArrowUp'])
const PICKER_VIM_KEYS = new Set(['n', 'j', 'p', 'k'])

/**
 * Guards a cmdk product picker against an accidental Enter. cmdk silently highlights
 * the first item the moment the list mounts, so when Enter on a row's last field opens
 * the next row's picker, a stray second Enter (double press) used to add whatever
 * product happened to be first in the list.
 *
 * While the search is empty and the user hasn't picked a row with ↑/↓ or the mouse,
 * nothing is shown as highlighted and Enter does nothing. Typing a search (or a
 * barcode scan) behaves exactly as before: the first match is highlighted and Enter
 * adds it. The first ↑/↓ only reveals the highlight on the first item rather than
 * skipping past it. Held-down Enter repeats never select.
 *
 * `openKey` identifies the open picker (e.g. the open row id); the guard re-arms
 * whenever it changes. Spread the result onto `<Command>`.
 */
export function usePickerEnterGuard(openKey: string | boolean, query: string) {
  const [navigated, setNavigated] = useState(false)
  const [prevKey, setPrevKey] = useState(openKey)
  if (prevKey !== openKey) {
    setPrevKey(openKey)
    setNavigated(false)
  }
  const ready = navigated || query.trim() !== ''

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter') {
        // preventDefault makes cmdk skip its own select-on-Enter.
        if (e.repeat || !ready) e.preventDefault()
        return
      }
      const isNav = PICKER_NAV_KEYS.has(e.key) || (e.ctrlKey && PICKER_VIM_KEYS.has(e.key))
      if (isNav && !ready) {
        e.preventDefault()
        setNavigated(true)
      }
    },
    [ready],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!ready && (e.target as Element).closest?.('[cmdk-item]')) setNavigated(true)
    },
    [ready],
  )

  return {
    'data-enter-ready': ready ? 'true' : 'false',
    className:
      '[&[data-enter-ready=false]_[cmdk-item][data-selected=true]]:bg-transparent [&[data-enter-ready=false]_[cmdk-item][data-selected=true]]:text-inherit',
    onKeyDown,
    onPointerMove,
  }
}

/**
 * Runs `callback` after the next two paints. Radix popovers/dialogs restore focus
 * to their trigger on close via a rAF-scheduled effect; waiting a fixed number of
 * milliseconds either races that (losing focus back to the trigger) or wastes time
 * padding past it. Two rAFs reliably land after that restore without a magic delay.
 */
export function afterPaint(callback: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(callback))
}

/** Focus an input/button after popovers close. */
export function focusField(el: HTMLElement | null | undefined, selectText = true) {
  if (!el) return
  afterPaint(() => {
    el.focus()
    if (
      selectText &&
      el instanceof HTMLInputElement &&
      !['date', 'datetime-local', 'time', 'month', 'week'].includes(el.type)
    ) {
      el.select()
    }
  })
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
