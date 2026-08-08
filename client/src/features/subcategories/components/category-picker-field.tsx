import { useState, type Dispatch, type SetStateAction } from 'react'
import { Check, ChevronsUpDown, FolderTree, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useLanguage } from '@/context/language-context'
import { Category } from '@/stores/category.slice'
import { getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'
import { CategoriesProvider, useCategories } from '@/features/categories/context/categories-context'
import { CategoriesActionDialog } from '@/features/categories/components/categories-action-dialog'

interface CategoryPickerFieldProps {
  categories: Category[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

function CategoryAvatar({ category, className }: { category: Category; className?: string }) {
  return (
    <Avatar className={cn('h-8 w-8 shrink-0', className)}>
      <AvatarImage src={category.image?.url || ''} alt={category.name} className="object-cover" />
      <AvatarFallback className="bg-primary/10 text-xs font-medium">
        {(category.name?.charAt(0) || '?').toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}

/** Wraps in its own CategoriesProvider — fully isolated from the main Categories page's state. */
export function CategoryPickerField(props: CategoryPickerFieldProps) {
  return (
    <CategoriesProvider>
      <CategoryPickerFieldInner {...props} />
    </CategoriesProvider>
  )
}

function CategoryPickerFieldInner({ categories, value, onValueChange, disabled }: CategoryPickerFieldProps) {
  const { t } = useLanguage()
  const { dispatch: categoriesDispatch } = useCategories()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Snapshot of the search text at the moment "Add new category" is clicked — kept separate
  // from `query` so it survives the popover closing (which resets `query` immediately).
  const [pendingCreateName, setPendingCreateName] = useState('')

  const selected = categories.find((c) => c.id === value)

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? categories.filter(
        (c) =>
          c.name?.toLowerCase().includes(normalizedQuery) ||
          c.nameUrdu?.toLowerCase().includes(normalizedQuery)
      )
    : categories

  const handleOpenCreateCategory = () => {
    setPendingCreateName(query.trim())
    setOpen(false)
    categoriesDispatch({ type: 'SET_CATEGORY', payload: null })
    categoriesDispatch({ type: 'SET_OPEN', payload: true })
  }

  // CategoriesActionDialog expects a setFetch-style updater; we don't own a list to refetch
  // here — the shared category redux slice already updates itself on create, and onCreated
  // below is what actually matters to this picker.
  const noopSetFetch: Dispatch<SetStateAction<boolean>> = () => {}

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) setQuery('')
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-auto min-h-11 w-full justify-between py-1.5 font-normal"
          >
            {selected ? (
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <CategoryAvatar category={selected} />
                <span className="flex min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-0.5 text-left">
                  <span className={getTextClasses(selected.name, 'shrink-0 truncate font-medium')}>
                    {selected.name}
                  </span>
                  {selected.nameUrdu?.trim() ? (
                    <span
                      dir="rtl"
                      className={cn('min-w-0 truncate text-xs', getUrduSecondaryNameClasses(selected.nameUrdu))}
                    >
                      {selected.nameUrdu.trim()}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground">
                <FolderTree className="h-4 w-4 shrink-0" />
                {t('select_main_category_placeholder')}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[420px] max-w-[calc(100vw-3rem)] p-0"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          avoidCollisions
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t('search_categories')}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {filtered.length === 0 ? (
                <CommandEmpty>{t('no_categories_found')}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {filtered.map((category) => {
                    const isSelected = category.id === value
                    const urdu = category.nameUrdu?.trim()
                    return (
                      <CommandItem
                        key={category.id}
                        value={category.id}
                        onSelect={() => {
                          onValueChange(category.id)
                          setOpen(false)
                          setQuery('')
                        }}
                        className="flex cursor-pointer items-center gap-3 p-2.5"
                      >
                        <CategoryAvatar category={category} />
                        <span className="flex min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className={getTextClasses(category.name, 'shrink-0 truncate font-medium')}>
                            {category.name}
                          </span>
                          {urdu ? (
                            <span dir="rtl" className={cn('min-w-0 truncate text-xs', getUrduSecondaryNameClasses(urdu))}>
                              {urdu}
                            </span>
                          ) : null}
                        </span>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="__create_category__"
                  onSelect={handleOpenCreateCategory}
                  className="flex cursor-pointer items-center gap-2 p-2.5 text-primary"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  {normalizedQuery ? t('add_category_named', { name: query.trim() }) : t('add_category')}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CategoriesActionDialog
        setFetch={noopSetFetch}
        defaultName={pendingCreateName}
        onCreated={(category) => {
          onValueChange(category.id)
          setQuery('')
        }}
      />
    </>
  )
}
