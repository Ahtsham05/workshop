import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Search, Check, X, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGetAllBrandsQuery, useCreateBrandMutation, type Brand } from '@/stores/brand.api'
import { VoiceInputButton } from '@/components/ui/voice-input-button'

interface Props {
  value?: string
  onChange: (brandId: string | undefined) => void
}

/** Single-select brand combobox — search existing brands, create a new one inline, or clear. */
export function BrandSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: brands = [], isLoading } = useGetAllBrandsQuery()
  const [createBrand, { isLoading: isCreating }] = useCreateBrandMutation()

  const selected = brands.find((b) => (b._id || b.id) === value)
  const trimmedQuery = query.trim()
  const exactMatch = brands.some((b) => b.name.toLowerCase() === trimmedQuery.toLowerCase())

  const handleSelect = (brand: Brand) => {
    onChange(brand._id || brand.id)
    setOpen(false)
    setQuery('')
  }

  const handleCreate = async () => {
    if (!trimmedQuery) return
    try {
      const created = await createBrand({ name: trimmedQuery }).unwrap()
      toast.success(`Brand "${created.name}" created`)
      onChange(created._id || created.id)
      setOpen(false)
      setQuery('')
    } catch (err: any) {
      toast.error(err?.data?.message || `Failed to create brand "${trimmedQuery}"`)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            {selected ? (
              <Badge variant="secondary" className="gap-1 pr-1">
                {selected.logo?.url ? (
                  <img
                    src={selected.logo.url}
                    alt={selected.name}
                    className="h-3 w-3 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full bg-gray-400">
                    <span className="text-[10px] font-medium text-white">
                      {selected.name?.charAt(0).toUpperCase() || 'B'}
                    </span>
                  </div>
                )}
                {selected.name}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(undefined)
                  }}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : (
              <span className="text-muted-foreground">Select a brand (optional)</span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="relative">
            <CommandInput placeholder="Search or create a brand..." value={query} onValueChange={setQuery} />
            <div className="absolute right-2 top-1/2 z-10 -translate-y-1/2">
              <VoiceInputButton
                onTranscript={(text) => {
                  const input = document.querySelector('[cmdk-input]') as HTMLInputElement
                  if (input) {
                    input.value = text
                    input.dispatchEvent(new Event('input', { bubbles: true }))
                  }
                }}
                size="sm"
              />
            </div>
          </div>
          <CommandList>
            {!isLoading && (
              <CommandEmpty>
                {trimmedQuery ? 'No matching brands.' : 'No brands yet.'}
              </CommandEmpty>
            )}
            <CommandGroup>
              {brands
                .filter((b) => !trimmedQuery || b.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
                .map((brand) => {
                  const id = brand._id || brand.id
                  const isSelected = id === value
                  return (
                    <CommandItem
                      key={id}
                      value={`brand-${id}`}
                      onSelect={() => handleSelect(brand)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <div className="flex flex-1 items-center gap-2">
                        {brand.logo?.url ? (
                          <img
                            src={brand.logo.url}
                            alt={brand.name}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                            <span className="text-sm font-medium text-muted-foreground">
                              {brand.name?.charAt(0).toUpperCase() || 'B'}
                            </span>
                          </div>
                        )}
                        <span>{brand.name}</span>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </CommandItem>
                  )
                })}
            </CommandGroup>
            <CommandGroup>
              <CommandItem
                value={trimmedQuery ? `create-${trimmedQuery}` : 'create-brand-prompt'}
                onSelect={trimmedQuery && !exactMatch ? handleCreate : undefined}
                disabled={isCreating || !trimmedQuery || exactMatch}
                className="cursor-pointer text-primary data-[disabled=true]:opacity-100"
              >
                <Plus className="mr-2 h-4 w-4" />
                {!trimmedQuery
                  ? 'Type a name above to create a new brand'
                  : exactMatch
                    ? `"${trimmedQuery}" already exists — select it above`
                    : `Create "${trimmedQuery}"`}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
