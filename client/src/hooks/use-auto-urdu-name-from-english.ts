import { useEffect, useRef } from 'react'
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form'
import Axios from '@/utils/Axios'
import { translateNamePair } from '@/i18n/auto-translate'
import { useUrduDisplay } from '@/context/urdu-display-context'
import { getNativeLanguage } from '@/lib/native-language'

async function translateViaServer(path: string, body: Record<string, string>): Promise<string> {
  try {
    const res = await Axios.post(path, body)
    return String(res.data?.translated ?? '').trim()
  } catch {
    return ''
  }
}

/**
 * Native-language name → English, browser cascade first, server proxy as fallback. The
 * native language is the business's (Urdu, Arabic, … — see lib/native-language.ts).
 */
export async function fetchEnglishNameSuggestion(text: string): Promise<string> {
  const native = getNativeLanguage()
  const trimmed = String(text ?? '').trim()
  if (!native || trimmed.length < 2) return ''
  if (native.script ? !native.script.test(trimmed) : !/[A-Za-z]/.test(trimmed)) return ''
  const local = await translateNamePair(trimmed, native.providerCode, 'en')
  if (local && /[A-Za-z]/.test(local) && local.toLowerCase() !== trimmed.toLowerCase()) return local
  return translateViaServer('/translate/name-to-english', { text: trimmed, source: native.code })
}

/** English name → the business's native language (kept under its old name for its many callers). */
export async function fetchUrduNameSuggestion(text: string): Promise<string> {
  const native = getNativeLanguage()
  const trimmed = String(text ?? '').trim()
  if (!native || trimmed.length < 2 || !/[A-Za-z]/.test(trimmed)) return ''
  const local = await translateNamePair(trimmed, 'en', native.providerCode)
  if (local && local.toLowerCase() !== trimmed.toLowerCase()) return local
  return native.code === 'ur'
    ? translateViaServer('/translate/name-to-urdu', { text: trimmed })
    : translateViaServer('/translate/name', { text: trimmed, target: native.code })
}

export const fetchNativeNameSuggestion = fetchUrduNameSuggestion

/**
 * Debounced English → native-language (Urdu, Arabic, …) suggestion while typing a Latin-script name.
 * - Keeps the saved native name when the English name is unchanged (e.g. editing price only).
 * - Fills the native name when it is empty.
 * - Re-translates when the user edits the English name.
 *
 * Pass `sessionKey` (e.g. dialog open + entity id) so baseline English resets when the form loads another row.
 */
export function useAutoUrduNameFromEnglish<T extends FieldValues>(
  form: UseFormReturn<T>,
  englishField: Path<T>,
  urduField: Path<T>,
  sessionKey?: unknown,
) {
  const { showUrduInput } = useUrduDisplay()
  const englishValue = form.watch(englishField)
  const urduValue = form.watch(urduField)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const baselineEnglishRef = useRef('')
  const initialCaptureRef = useRef(false)

  useEffect(() => {
    if (sessionKey === undefined) return
    const frame = requestAnimationFrame(() => {
      baselineEnglishRef.current = String(form.getValues(englishField) ?? '').trim()
      initialCaptureRef.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [sessionKey, form, englishField])

  useEffect(() => {
    if (sessionKey !== undefined || initialCaptureRef.current) return
    baselineEnglishRef.current = String(englishValue ?? '').trim()
    initialCaptureRef.current = true
  }, [sessionKey, englishValue])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!showUrduInput) return
    timerRef.current = setTimeout(async () => {
      const trimmed = String(englishValue ?? '').trim()
      const baseline = baselineEnglishRef.current
      const urdu = String(urduValue ?? '').trim()
      const englishChanged = trimmed !== baseline
      const urduEmpty = urdu.length === 0

      if (!englishChanged && !urduEmpty) return

      if (trimmed.length < 2) {
        if (englishChanged || urduEmpty) {
          form.setValue(urduField, '' as PathValue<T, Path<T>>)
        }
        return
      }
      if (!/[A-Za-z]/.test(trimmed)) return

      const translated = await fetchUrduNameSuggestion(trimmed)
      // The answer can arrive after the form moved on (saved and reset for the next record,
      // or the name was edited again) — never write one name's translation onto another.
      const current = String(form.getValues(englishField) ?? '').trim()
      if (translated && current === trimmed) {
        form.setValue(urduField, translated as PathValue<T, Path<T>>)
      }
    }, 450)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [englishValue, urduValue, form, englishField, urduField, showUrduInput])
}
