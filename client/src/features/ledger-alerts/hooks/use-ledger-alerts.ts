import { useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useGetLedgerAlertSettingsQuery, useGetLedgerStatusBoardQuery, type CustomerAging, type LedgerAlertSettings } from '@/stores/ledgerAlerts.api'
import { DEFAULT_LEDGER_SETTINGS, cardStyleForTone, rowStyleForTone, toneForCustomer, type LedgerTone } from '../lib/ledger-colors'

/** Org settings for due dates / colours, with defaults while loading or without access. */
export function useLedgerAlertSettings(options: { skip?: boolean } = {}) {
  const { data, isLoading } = useGetLedgerAlertSettingsQuery(undefined, { skip: options.skip })
  return { settings: data ?? DEFAULT_LEDGER_SETTINGS, loaded: Boolean(data), isLoading }
}

/**
 * The customer status board (who is late, by how much, which colour) + helpers to colour a
 * row or card by customer id. One request for the whole branch, shared by every list.
 * `context: 'report'` honours Settings → "show colours in reports".
 */
export function useLedgerStatus(options: { skip?: boolean; context?: 'list' | 'report' } = {}) {
  const { data, isFetching, refetch } = useGetLedgerStatusBoardQuery(undefined, {
    skip: options.skip,
    // Ledger entries posted from the Accounts screens go through Axios, not RTK Query, so
    // nothing invalidates this board for them — refresh when a list mounts again instead.
    refetchOnMountOrArgChange: 30,
  })
  const settings = data?.settings ?? DEFAULT_LEDGER_SETTINGS
  const colorsOn = settings.colorsEnabled && (options.context !== 'report' || settings.showInReports)

  const byCustomerId = useMemo(() => {
    const map = new Map<string, CustomerAging>()
    for (const row of data?.rows ?? []) map.set(row.customerId, row)
    return map
  }, [data])

  const agingFor = useCallback(
    (customerId: string | null | undefined): CustomerAging | undefined => (customerId ? byCustomerId.get(String(customerId)) : undefined),
    [byCustomerId]
  )
  const toneFor = useCallback(
    (customerId: string | null | undefined): LedgerTone | null => (colorsOn ? toneForCustomer(agingFor(customerId), settings) : null),
    [agingFor, colorsOn, settings]
  )
  const rowStyleFor = useCallback(
    (customerId: string | null | undefined): CSSProperties | undefined => rowStyleForTone(toneFor(customerId), settings),
    [toneFor, settings]
  )
  const cardStyleFor = useCallback(
    (customerId: string | null | undefined): CSSProperties | undefined => cardStyleForTone(toneFor(customerId), settings),
    [toneFor, settings]
  )

  return {
    board: data,
    settings: settings as LedgerAlertSettings,
    colorsOn,
    isFetching,
    refetch,
    agingFor,
    toneFor,
    rowStyleFor,
    cardStyleFor,
  }
}
