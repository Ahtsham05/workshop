import { useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/context/language-context'
import { AppDispatch } from '@/stores/store'
import { updateSubCategory, SubCategory } from '@/stores/subCategory.slice'
import { useSubCategories } from '@/features/subcategories/context/subcategories-context'
import { SubCategoriesDeleteDialog } from '@/features/subcategories/components/subcategories-delete-dialog'
import { getTextClasses } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'

interface SubCategoryTagsFieldProps {
  /** Sub-categories already saved to this category (edit mode only). */
  existing: SubCategory[]
  loadingExisting: boolean
  onExistingChanged: () => void
  /** Names typed in this session, not yet saved — committed on form submit. */
  draftNames: string[]
  onDraftNamesChange: (names: string[]) => void
}

/** A single tag-input box: saved sub-categories (editable/removable) plus new draft
 *  names typed in this session, all in one row — English names only. */
export function SubCategoryTagsField({
  existing,
  loadingExisting,
  onExistingChanged,
  draftNames,
  onDraftNamesChange,
}: SubCategoryTagsFieldProps) {
  const { t } = useLanguage()
  const { dispatch } = useSubCategories()
  const reduxDispatch = useDispatch<AppDispatch>()
  const inputRef = useRef<HTMLInputElement>(null)

  const [draftText, setDraftText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const commitDraft = () => {
    const trimmed = draftText.trim()
    setDraftText('')
    if (!trimmed) return
    const isDuplicate =
      existing.some((s) => s.name.toLowerCase() === trimmed.toLowerCase()) ||
      draftNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())
    if (isDuplicate) return
    onDraftNamesChange([...draftNames, trimmed])
  }

  const removeDraftAt = (index: number) => {
    onDraftNamesChange(draftNames.filter((_, i) => i !== index))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Backspace' && draftText === '' && draftNames.length > 0) {
      removeDraftAt(draftNames.length - 1)
    }
  }

  const handleRemoveExisting = (subCategory: SubCategory) => {
    dispatch({ type: 'SET_SUBCATEGORY', payload: subCategory })
    dispatch({ type: 'SET_DELETE_OPEN', payload: true })
  }

  const startEdit = (subCategory: SubCategory) => {
    setEditingId(subCategory.id)
    setEditName(subCategory.name)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (subCategory: SubCategory) => {
    const trimmed = editName.trim()
    if (!trimmed) return
    setSavingEdit(true)
    try {
      await reduxDispatch(updateSubCategory({ id: subCategory.id, name: trimmed })).unwrap()
      toast.success(t('subcategory_updated_successfully'))
      setEditingId(null)
      onExistingChanged()
    } catch {
      toast.error(t('subcategory_update_failed'))
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
      >
        {loadingExisting && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('loading')}
          </span>
        )}

        {existing.map((subCategory) =>
          editingId === subCategory.id ? (
            <span
              key={subCategory.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 py-1 pl-2.5 pr-1"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                value={editName}
                disabled={savingEdit}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void saveEdit(subCategory) }
                  if (e.key === 'Escape') cancelEdit()
                }}
                className="h-5 w-24 border-none bg-transparent text-xs outline-none"
              />
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => void saveEdit(subCategory)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10"
                aria-label={t('save')}
              >
                {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={cancelEdit}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                aria-label={t('cancel')}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <span
              key={subCategory.id}
              className="group inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 py-1 pl-2.5 pr-1 text-xs font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" onClick={() => startEdit(subCategory)} className="flex items-center gap-1">
                <span className={getTextClasses(subCategory.name, '')}>{subCategory.name}</span>
                <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
              <button
                type="button"
                onClick={() => handleRemoveExisting(subCategory)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={t('delete_subcategory')}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )
        )}

        {draftNames.map((name, index) => (
          <span
            key={`${name}-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-1 text-xs font-medium text-primary"
          >
            {name}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeDraftAt(index) }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-primary/20"
              aria-label={t('remove')}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          placeholder={existing.length === 0 && draftNames.length === 0 ? t('subcategory_tags_placeholder') : ''}
          className={cn('h-6 min-w-[8rem] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-muted-foreground')}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('subcategory_tags_hint')}</p>

      <SubCategoriesDeleteDialog setFetch={() => onExistingChanged()} />
    </div>
  )
}
