import { useSyncExternalStore } from 'react'

/**
 * Open/closed state for the floating Business Calculator.
 *
 * A module-level store rather than React context: the Ctrl+K command menu is mounted at
 * the app root, above the shell the calculator window lives in, and the header button,
 * the keyboard shortcut and the quick-links widget all need to open it too.
 */

export type CalculatorTab = 'basic' | 'margin' | 'discount' | 'tax' | 'percent' | 'installment' | 'breakeven'

export const CALCULATOR_SHORTCUT_LABEL = 'Ctrl+Alt+C'

interface CalculatorState {
  isOpen: boolean
  isMinimized: boolean
  tab: CalculatorTab
  /** Bumped on every open so the window can re-focus itself. */
  openSeq: number
  /** A value handed to the basic calculator ("Use in calculator" from a tool). */
  injected: { value: number; seq: number } | null
}

const TAB_KEY = 'calculator-tab-v1'
const TABS: CalculatorTab[] = ['basic', 'margin', 'discount', 'tax', 'percent', 'installment', 'breakeven']

function readTab(): CalculatorTab {
  try {
    const saved = localStorage.getItem(TAB_KEY) as CalculatorTab | null
    return saved && TABS.includes(saved) ? saved : 'basic'
  } catch {
    return 'basic'
  }
}

let state: CalculatorState = { isOpen: false, isMinimized: false, tab: readTab(), openSeq: 0, injected: null }
const listeners = new Set<() => void>()

function setState(patch: Partial<CalculatorState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const getSnapshot = () => state

export function useCalculatorState(): CalculatorState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function openCalculator(tab?: CalculatorTab) {
  setState({ isOpen: true, isMinimized: false, openSeq: state.openSeq + 1, ...(tab ? { tab } : {}) })
  if (tab) writeTab(tab)
}

export function closeCalculator() {
  setState({ isOpen: false, isMinimized: false })
}

export function toggleCalculator() {
  if (state.isOpen && !state.isMinimized) closeCalculator()
  else openCalculator()
}

export function minimizeCalculator() {
  setState({ isMinimized: true })
}

export function setCalculatorTab(tab: CalculatorTab) {
  setState({ tab })
  writeTab(tab)
}

/** Sends a result from one of the business tools into the basic calculator and switches to it. */
export function sendToCalculator(value: number) {
  setState({ tab: 'basic', injected: { value, seq: (state.injected?.seq ?? 0) + 1 } })
  writeTab('basic')
}

function writeTab(tab: CalculatorTab) {
  try {
    localStorage.setItem(TAB_KEY, tab)
  } catch {
    /* private mode — the in-memory tab still applies */
  }
}

/**
 * Ctrl/Cmd + Alt + C. Like the stock-transfer shortcut, the physical C key also counts when
 * the active keyboard layout isn't a Latin one (Urdu/Arabic make event.key 'ب'), but a Latin
 * layout that types its own character with AltGr+C (e.g. Polish 'ć') is left alone.
 */
export function isCalculatorShortcut(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>) {
  if (!event.altKey || !(event.ctrlKey || event.metaKey) || event.shiftKey) return false
  const key = event.key ?? ''
  if (key.toLowerCase() === 'c') return true
  return event.code === 'KeyC' && ([...key].length !== 1 || !/\p{Script=Latin}/u.test(key))
}
