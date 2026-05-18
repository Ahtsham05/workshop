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

/** Debounced EN→Urdu suggestion while typing a Latin-script name (editable Urdu field). */
export function useAutoUrduNameFromEnglish<T extends FieldValues>(
  form: UseFormReturn<T>,
  englishField: Path<T>,
  urduField: Path<T>,
) {
  const englishValue = form.watch(englishField)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const trimmed = String(englishValue ?? '').trim()
      if (trimmed.length < 2) {
        form.setValue(urduField, '' as PathValue<T, Path<T>>)
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
  }, [englishValue, form, englishField, urduField])
}
