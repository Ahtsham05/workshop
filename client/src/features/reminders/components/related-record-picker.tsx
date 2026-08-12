import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ContactPhotoCell, type ContactPicture } from '@/components/contact-photo-cell'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import type { AppDispatch, RootState } from '@/stores/store'
import { fetchAllSuppliers } from '@/stores/supplier.slice'
import { useGetCustomersQuery } from '@/stores/customer.api'
import type { RelatedRecordType } from '@/stores/communicationLog.api'

export interface RelatedRecordValue {
  relatedType: RelatedRecordType
  relatedId: string
  name: string
  phone?: string
  whatsapp?: string
  picture?: ContactPicture
}

interface PickableRecord {
  _id?: string
  id?: string
  name: string
  phone?: string
  whatsapp?: string
  picture?: ContactPicture
}

interface RelatedRecordPickerProps {
  value: RelatedRecordValue | null
  onChange: (value: RelatedRecordValue | null) => void
}

export function RelatedRecordPicker({ value, onChange }: RelatedRecordPickerProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<RelatedRecordType>(value?.relatedType || 'Customer')
  const [search, setSearch] = useState('')

  const { data: customerData, isFetching: customersFetching } = useGetCustomersQuery(
    { search, limit: 20 },
    { skip: type !== 'Customer' || !open },
  )
  const customers: PickableRecord[] = customerData?.results || []

  const suppliersRedux = useSelector((state: RootState) => state.supplier.data)
  const suppliersLoading = useSelector((state: RootState) =>
    Boolean((state.supplier as { loadings?: Record<string, boolean> }).loadings?.fetchAllSuppliers),
  )
  const allSuppliers: PickableRecord[] = Array.isArray(suppliersRedux) ? suppliersRedux : []
  useEffect(() => {
    if (open && type === 'Supplier' && !allSuppliers.length) {
      dispatch(fetchAllSuppliers({}))
    }
  }, [open, type, allSuppliers.length, dispatch])
  const filteredSuppliers = allSuppliers.filter((s) =>
    (s.name || '').toLowerCase().includes(search.toLowerCase()),
  )

  const options = type === 'Customer' ? customers : filteredSuppliers
  const isLoadingOptions = type === 'Customer' ? customersFetching : suppliersLoading && !allSuppliers.length

  const handleSelect = (record: PickableRecord) => {
    const id = record._id || record.id
    if (!id) return
    onChange({
      relatedType: type,
      relatedId: id,
      name: record.name,
      phone: record.phone,
      whatsapp: record.whatsapp,
      picture: record.picture,
    })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          {value ? (
            <span className="flex items-center gap-2 truncate">
              <ContactPhotoCell picture={value.picture} name={value.name} className="h-5 w-5 shrink-0" />
              <span className="truncate">{value.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t('Link a customer or supplier (optional)')}</span>
          )}
          <span className="flex items-center gap-1">
            {value && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(null)
                }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b p-2">
          <Tabs value={type} onValueChange={(v) => setType(v as RelatedRecordType)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="Customer">{t('Customer')}</TabsTrigger>
              <TabsTrigger value="Supplier">{t('Supplier')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('Search by name...')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoadingOptions ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('Loading...')}
              </div>
            ) : options.length === 0 ? (
              <CommandEmpty>{t('No results found')}</CommandEmpty>
            ) : (
              <CommandGroup>
                {options.map((record) => {
                  const id = record._id || record.id
                  const isSelected = value?.relatedId === id && value?.relatedType === type
                  return (
                    <CommandItem key={id} value={id} onSelect={() => handleSelect(record)} className="gap-2">
                      <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                      <ContactPhotoCell picture={record.picture} name={record.name} className="h-7 w-7 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate">{record.name}</p>
                        {record.phone && <p className="text-xs text-muted-foreground">{record.phone}</p>}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
