// Shared by the rate-history panel (customer-rate-history-panel.tsx) and the invoice panel.

/** Marks the inputs that drive this panel — focusing/clicking one of them is not "outside". */
export const RATE_HISTORY_ANCHOR_ATTR = 'data-rate-history-anchor'

/** Narrowest width at which the panel opens by itself (below it, the History button only). */
export const RATE_HISTORY_AUTO_OPEN_MIN_WIDTH = 1024

export const RATE_HISTORY_PANEL_WIDTH = 400

const AUTO_OPEN_STORAGE_KEY = 'invoiceRateHistoryAutoOpen'

export function readRateHistoryAutoOpen(): boolean {
  try {
    return window.localStorage.getItem(AUTO_OPEN_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

export function writeRateHistoryAutoOpen(value: boolean) {
  try {
    window.localStorage.setItem(AUTO_OPEN_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // private mode / blocked storage — the toggle just won't be remembered
  }
}
