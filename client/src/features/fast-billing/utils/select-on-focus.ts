import type { FocusEvent } from 'react'

/** Selects the input's full value on focus, so clicking in immediately lets you type over it. */
export function selectOnFocus(e: FocusEvent<HTMLInputElement>) {
  e.currentTarget.select()
}
