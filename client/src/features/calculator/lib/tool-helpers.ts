import { useEffect, useState } from 'react'
import { tryEvaluate } from './expression'

/* ── Formatting ──────────────────────────────────────────────────────────── */

/** 1234.5 → "1,234.50". Money keeps the org's decimals; percentages trim trailing zeros. */
export function formatNumber(value: number, { decimals = 2, trim = false }: { decimals?: number; trim?: boolean } = {}): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: trim ? 0 : decimals,
    maximumFractionDigits: decimals,
  })
}

export const formatPercent = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : `${formatNumber(value, { decimals: 2, trim: true })}%`

/* ── Persistent tool inputs ──────────────────────────────────────────────── */

/**
 * Like useState, but the tool's inputs survive closing the calculator (and a reload) —
 * people come back to finish the same sum. Per-device convenience only.
 */
export function usePersistentState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const storageKey = `calculator:${key}`
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw == null ? initial : ({ ...initial, ...JSON.parse(raw) } as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      /* private mode / quota */
    }
  }, [storageKey, value])
  return [value, setValue]
}

/** Parses a field's raw text; empty or invalid text is null. */
export const num = (raw: string | undefined) => tryEvaluate(raw ?? '')
