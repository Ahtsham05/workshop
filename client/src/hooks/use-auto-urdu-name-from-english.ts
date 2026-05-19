import { useEffect, useRef } from 'react'
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form'
import Axios from '@/utils/Axios'

/** Calls the same endpoint as the debounced hook; use after form reset when Urdu is empty. */
export async function fetchEnglishNameSuggestion(text: string): Promise<string> {
  const trimmed = String(text ?? '').trim()
  if (trimmed.length < 2 || !/[\u0600-\u06FF]/.test(trimmed)) return ''
  try {
    const res = await Axios.post('/translate/name-to-english', { text: trimmed })
    return String(res.data?.translated ?? '').trim()
  } catch {
    return ''
  }
}

export async function fetchUrduNameSuggestion(text: string): Promise<string> {
  const trimmed = String(text ?? '').trim()
  if (trimmed.length < 2 || !/[A-Za-z]/.test(trimmed)) return ''
  try {
    const res = await Axios.post('/translate/name-to-urdu', { text: trimmed })
    return String(res.data?.translated ?? '').trim()
  } catch {
    return ''
  }
}

/**
 * Debounced EN→Urdu suggestion while typing a Latin-script name.
 * - Keeps saved Urdu when the English name is unchanged (e.g. editing price only).
 * - Fills Urdu when it is empty.
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
      if (translated) {
        form.setValue(urduField, translated as PathValue<T, Path<T>>)
      }
    }, 450)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [englishValue, urduValue, form, englishField, urduField])
}
