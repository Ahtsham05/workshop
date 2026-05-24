import { useCallback, useEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { focusField, onEnterAdvance } from '@/lib/invoice-form-keyboard'

export { focusField, onEnterAdvance }

type EnterChainOptions = {
  /** Called when Enter is pressed on the last field (without Ctrl). */
  onLast?: () => void
  /** Called on Ctrl+Enter / Cmd+Enter from any chained field. */
  onSubmit?: () => void
  /** Focus this element when the chain completes via Enter on last field. */
  submitButtonRef?: RefObject<HTMLElement | null>
  /** Limit field lookup to this form/container (avoids wrong tab matches). */
  scopeRef?: RefObject<ParentNode | null>
}

function resolveScope(scopeRef?: RefObject<ParentNode | null>): ParentNode {
  if (scopeRef?.current) return scopeRef.current
  const activeForm = document.querySelector('[role="tabpanel"][data-state="active"] form[data-mobile-form]')
  if (activeForm) return activeForm
  const openDialog = document.querySelector('[role="dialog"][data-state="open"]')
  if (openDialog) return openDialog
  return document
}

function findFieldElement(id: string, scope: ParentNode): HTMLElement | null {
  if (scope instanceof Document) {
    return scope.querySelector<HTMLElement>(`[data-enter-field="${id}"]`)
  }
  return scope.querySelector<HTMLElement>(`[data-enter-field="${id}"]`)
}

/** Whether the field can receive keyboard focus in the enter chain. */
export function isEnterFieldFocusable(el: HTMLElement | null | undefined): el is HTMLElement {
  if (!el) return false
  if (el.matches(':disabled, [disabled], [aria-disabled="true"]')) return false
  if (el.closest('[hidden], [aria-hidden="true"]')) return false
  const tabPanel = el.closest('[role="tabpanel"]')
  if (tabPanel && tabPanel.getAttribute('data-state') === 'inactive') return false
  return true
}

function focusNextInChain(fieldIds: string[], currentId: string, scope: ParentNode): boolean {
  const index = fieldIds.indexOf(currentId)
  if (index < 0) return false

  for (let i = index + 1; i < fieldIds.length; i += 1) {
    const el = findFieldElement(fieldIds[i], scope)
    if (isEnterFieldFocusable(el)) {
      focusField(el)
      return true
    }
  }
  return false
}

/**
 * Build Enter-key handlers for a ordered list of field ids (use data-enter-field={id}).
 */
export function makeEnterChain(fieldIds: string[], options: EnterChainOptions = {}) {
  const getScope = () => resolveScope(options.scopeRef)

  const handler =
    (currentId: string) => (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter') return
      if (e.altKey) return

      if (e.ctrlKey || e.metaKey) {
        if (options.onSubmit) {
          e.preventDefault()
          e.stopPropagation()
          options.onSubmit()
        }
        return
      }

      if (e.shiftKey) return
      if (e.defaultPrevented) return

      e.preventDefault()
      e.stopPropagation()

      const scope = getScope()
      const advanced = focusNextInChain(fieldIds, currentId, scope)
      if (advanced) return

      if (options.submitButtonRef?.current) {
        focusField(options.submitButtonRef.current, false)
      }
      options.onLast?.()
    }

  const enterProps = (fieldId: string) => {
    const onEnterKey = handler(fieldId)
    return {
      'data-enter-field': fieldId,
      onKeyDown: onEnterKey,
      onKeyDownCapture: onEnterKey,
    }
  }

  const focusFirst = () => {
    const scope = getScope()
    for (const id of fieldIds) {
      const el = findFieldElement(id, scope)
      if (isEnterFieldFocusable(el)) {
        focusField(el)
        return
      }
    }
  }

  return { enterProps, focusFirst, fieldIds }
}

/**
 * Register refs for an ordered field list — useful when data-enter-field is awkward.
 */
export function useEnterFieldRefs<T extends string>(fieldOrder: T[], options: EnterChainOptions = {}) {
  const refs = useRef<Partial<Record<T, HTMLElement | null>>>({})

  const register =
    (field: T) =>
    (el: HTMLElement | null) => {
      refs.current[field] = el
    }

  const onEnter =
    (field: T) => (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter') return
      if (e.altKey) return

      if (e.ctrlKey || e.metaKey) {
        if (options.onSubmit) {
          e.preventDefault()
          e.stopPropagation()
          options.onSubmit()
        }
        return
      }

      if (e.shiftKey) return

      e.preventDefault()
      e.stopPropagation()

      const index = fieldOrder.indexOf(field)
      for (let i = index + 1; i < fieldOrder.length; i += 1) {
        const next = fieldOrder[i]
        const el = refs.current[next]
        if (isEnterFieldFocusable(el ?? null)) {
          focusField(el ?? null)
          return
        }
      }

      if (options.submitButtonRef?.current) {
        focusField(options.submitButtonRef.current, false)
      }
      options.onLast?.()
    }

  const focusFirst = useCallback(() => {
    for (const field of fieldOrder) {
      const el = refs.current[field]
      if (isEnterFieldFocusable(el ?? null)) {
        focusField(el ?? null)
        return
      }
    }
  }, [fieldOrder])

  return { register, onEnter, focusFirst, refs }
}

/** Prevent accidental form submit on Enter — chained fields handle navigation. */
export function preventEnterSubmit(e: ReactKeyboardEvent<HTMLFormElement>) {
  if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
  const target = e.target as HTMLElement | null
  if (!target) return
  if (target.tagName === 'TEXTAREA') return
  if (target.closest('[data-enter-field]')) {
    e.preventDefault()
  }
}

/** Global Ctrl+Enter submit shortcut for mobile shop forms. */
export function useCtrlEnterSubmit(onSubmit: () => void, disabled = false) {
  const handlerRef = useRef(onSubmit)
  handlerRef.current = onSubmit

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if (e.key !== 'Enter') return
      if (disabled) return
      e.preventDefault()
      handlerRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [disabled])
}

export const MOBILE_FORM_KEYBOARD_HINT = 'Enter ↵ next field · Ctrl+Enter save'
