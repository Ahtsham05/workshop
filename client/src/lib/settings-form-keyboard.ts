import { useEffect, useRef } from 'react'

/**
 * Ctrl/Cmd+Enter → submit, for full-page (non-dialog) settings forms — Business Profile,
 * Localization, Currency. Modeled after useInvoiceSaveShortcuts in invoice-form-keyboard.ts
 * but simplified to a single action (Settings pages have one Save button, not several
 * save-and-X variants). Dialog-based forms (Tax Category/Rate/Exemption/Exchange Rate
 * create-edit) use handleFormEnterKeyDown (form-enter-navigation.ts) instead — Enter
 * advances fields there, since a dialog's own explicit Save button is always one tab away.
 *
 * On invalid submission, `onSave` is expected to be the caller's normal submit handler
 * (e.g. RHF's `form.handleSubmit(onValid)`) — react-hook-form already runs validation and
 * focuses the first invalid field on its own when `handleSubmit` rejects, so no extra
 * focus-management is needed here.
 */
export function useSettingsSaveShortcut(onSave: () => void, isSaving: boolean) {
  const handlersRef = useRef({ onSave, isSaving })
  handlersRef.current = { onSave, isSaving }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if (e.key !== 'Enter') return
      e.preventDefault()
      if (!handlersRef.current.isSaving) handlersRef.current.onSave()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
