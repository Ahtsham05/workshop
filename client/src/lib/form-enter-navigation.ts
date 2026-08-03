import type { KeyboardEvent } from 'react'

/**
 * Enter should move to the next field, like Tab, instead of submitting the form —
 * submission only happens via the explicit Save/Confirm button. Fields that already use
 * Enter for their own purpose (adding an IMEI, a custom attribute value, etc.) call
 * e.preventDefault() themselves before this ever runs, so e.defaultPrevented lets us skip
 * those and leave their existing behavior untouched.
 */
export function handleFormEnterKeyDown(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== 'Enter' || e.defaultPrevented) return
  const target = e.target as HTMLElement
  if (target.tagName !== 'INPUT') return // let buttons/comboboxes/textareas behave normally
  e.preventDefault()
  const focusable = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
    )
  ).filter((el) => el.offsetParent !== null)
  const nextField = focusable[focusable.indexOf(target) + 1]
  nextField?.focus()
}
