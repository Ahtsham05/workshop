import { useEffect, useRef } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import SmartInput from '@/components/smart-input.tsx'
import { useLanguage } from '@/context/language-context'
import { fetchUrduNameSuggestion } from '@/hooks/use-auto-urdu-name-from-english'
import type { SubCategoryFormValues } from './subcategories-action-dialog'

interface SubCategoryNameRowProps {
  form: UseFormReturn<SubCategoryFormValues>
  index: number
  canRemove: boolean
  onRemove: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  autoFocus?: boolean
  inputRef?: (el: HTMLInputElement | null) => void
}

export function SubCategoryNameRow({
  form,
  index,
  canRemove,
  onRemove,
  onKeyDown,
  autoFocus,
  inputRef,
}: SubCategoryNameRowProps) {
  const { t } = useLanguage()
  // Once the user types into Urdu directly, their edit is final — auto-suggest
  // stops overwriting it until they clear the field back to empty.
  const manuallyEditedUrduRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const englishValue = form.watch(`items.${index}.name`)

  useEffect(() => {
    if (manuallyEditedUrduRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)

    const trimmed = String(englishValue ?? '').trim()
    if (trimmed.length < 2 || !/[A-Za-z]/.test(trimmed)) return

    timerRef.current = setTimeout(async () => {
      const translated = await fetchUrduNameSuggestion(trimmed)
      if (translated && !manuallyEditedUrduRef.current) {
        form.setValue(`items.${index}.nameUrdu`, translated)
      }
    }, 450)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [englishValue, index])

  return (
    <div className="flex items-start gap-2">
      <span className="mt-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
        {index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row">
        <FormField
          control={form.control}
          name={`items.${index}.name`}
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <SmartInput
                  {...field}
                  ref={inputRef}
                  placeholder={t('enter_subcategory_name_placeholder')}
                  showVoiceInput={false}
                  autoFocus={autoFocus}
                  className="h-11 text-base"
                  onKeyDown={onKeyDown}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`items.${index}.nameUrdu`}
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <Input
                  {...field}
                  dir="rtl"
                  placeholder={t('name_in_urdu_placeholder')}
                  autoComplete="off"
                  showVoiceInput={false}
                  className="h-11 text-base text-right"
                  onChange={(event) => {
                    manuallyEditedUrduRef.current = event.target.value.trim().length > 0
                    field.onChange(event)
                  }}
                  onKeyDown={onKeyDown}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mt-1 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
