import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import {
  useGetRepairJobsQuery,
  useGetSimSalesQuery,
  useGetInstallmentPlansQuery,
  useGetServiceInvoicesQuery,
  useGetLoadTransactionsQuery,
} from '@/stores/mobile-shop.api'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface CustomerSuggestion {
  _id?: string
  id?: string
  name: string
  phone?: string
  whatsapp?: string
  address?: string
  email?: string
  cnic?: string
}

interface CustomerPhoneAutocompleteProps extends Omit<React.ComponentProps<'input'>, 'onChange'> {
  value: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Called when user picks a suggestion — use this to fill all related form fields */
  onCustomerSelect: (customer: CustomerSuggestion) => void
  showVoiceInput?: boolean
  /**
   * 'phone' (default) — formats as phone, fills phone on select, searches by phone/name
   * 'cnic'             — formats as CNIC, fills CNIC on select, searches by CNIC/name
   */
  fieldType?: 'phone' | 'cnic'
  /** Also search repair job records */
  searchRepairRecords?: boolean
  /** Also search sim-sale records */
  searchSimSaleRecords?: boolean
  /** Also search installment plan records */
  searchInstallmentRecords?: boolean
  /** Also search service invoice records */
  searchServiceRecords?: boolean
  /** Also search load (mobile load) sale records */
  searchLoadSaleRecords?: boolean
}

const ALL_RECORDS_LIMIT = 1000

/**
 * Smart customer lookup input with live autocomplete from multiple data sources.
 * Works in 'phone' or 'cnic' mode.  Selecting a suggestion calls onCustomerSelect
 * with the full customer record so the parent form can fill ALL related fields.
 */
export function CustomerPhoneAutocomplete({
  value,
  onChange,
  onCustomerSelect,
  showVoiceInput,
  fieldType = 'phone',
  searchRepairRecords,
  searchSimSaleRecords,
  searchInstallmentRecords,
  searchServiceRecords,
  searchLoadSaleRecords,
  className,
  ...inputProps
}: CustomerPhoneAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounce the search term so we don't fire a request on every keystroke
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), 300)
    return () => clearTimeout(t)
  }, [value])

  // Only search sim-sales server-side when user has typed enough — avoids bulk fetch
  const simSaleSearchTerm =
    searchSimSaleRecords && debouncedValue && debouncedValue.length >= 2 ? debouncedValue.trim() : ''

  const { data: allCustomersRaw } = useGetAllCustomersQuery(undefined)
  const { data: repairData } = useGetRepairJobsQuery(
    { page: 1, limit: ALL_RECORDS_LIMIT },
    { skip: !searchRepairRecords },
  )
  const { data: simSaleData } = useGetSimSalesQuery(
    { page: 1, limit: 20, search: simSaleSearchTerm },
    { skip: !simSaleSearchTerm },
  )
  const { data: installmentData } = useGetInstallmentPlansQuery(
    { page: 1, limit: ALL_RECORDS_LIMIT },
    { skip: !searchInstallmentRecords },
  )
  const { data: serviceData } = useGetServiceInvoicesQuery(
    { page: 1, limit: ALL_RECORDS_LIMIT },
    { skip: !searchServiceRecords },
  )
  const { data: loadSaleData } = useGetLoadTransactionsQuery(
    { page: 1, limit: ALL_RECORDS_LIMIT },
    { skip: !searchLoadSaleRecords },
  )

  // Merge all data sources into a deduplicated CustomerSuggestion list.
  // Records never get a phone/CNIC number stuffed into `name` — if a source has no real
  // name on file, the entry keeps name: '' until/unless another source for the same
  // phone or CNIC supplies one (e.g. they have a name in Sim Sale but not in Repair).
  const allSuggestions = useMemo<CustomerSuggestion[]>(() => {
    const byKey = new Map<string, CustomerSuggestion>()

    const add = (s: { name?: string; phone?: string; cnic?: string; address?: string; whatsapp?: string; email?: string; _id?: string; id?: string }) => {
      const name = s.name?.trim() || ''
      const phone = s.phone?.trim() || ''
      const cnic = s.cnic?.trim() || ''
      // Nothing to key on — skip (no phone, no cnic, and no name to fall back to)
      const key = phone ? `p:${phone.replace(/\D/g, '')}` : cnic ? `c:${cnic.replace(/\D/g, '')}` : name ? `n:${name.toLowerCase()}` : ''
      if (!key) return

      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, { name, phone, cnic, address: s.address, whatsapp: s.whatsapp, email: s.email, _id: s._id, id: s.id })
        return
      }
      // Backfill whichever fields the earlier source was missing — first real value wins per field.
      if (!existing.name && name) existing.name = name
      if (!existing.phone && phone) existing.phone = phone
      if (!existing.cnic && cnic) existing.cnic = cnic
      if (!existing.address && s.address) existing.address = s.address
      if (!existing.whatsapp && s.whatsapp) existing.whatsapp = s.whatsapp
      if (!existing.email && s.email) existing.email = s.email
    }

    // 1. Saved customers
    const customers: CustomerSuggestion[] = Array.isArray(allCustomersRaw) ? allCustomersRaw : []
    customers.forEach(c => add({ ...c, id: c._id || c.id }))

    // 2. Repair job records
    if (repairData?.results) {
      repairData.results.forEach(r => {
        if (r.customerName || r.phone) add({ name: r.customerName, phone: r.phone })
      })
    }

    // 3. Sim-sale records (server-filtered, debounced)
    if (simSaleData?.results) {
      simSaleData.results.forEach(s => {
        if (s.customerMobile || s.customerName) {
          add({
            name: s.customerName,
            phone: s.customerMobile,
            cnic: s.customerCNIC,
            address: s.customerLocation,
          })
        }
      })
    }

    // 4. Installment plan records
    if (installmentData?.results) {
      installmentData.results.forEach(i => {
        if (i.customerName || i.customerPhone) {
          add({
            name: i.customerName,
            phone: i.customerPhone,
            cnic: i.customerCNIC,
            address: i.customerAddress,
          })
        }
      })
    }

    // 5. Service invoice records
    if (serviceData?.results) {
      serviceData.results.forEach(s => {
        if (s.customerName || s.customerPhone) add({ name: s.customerName, phone: s.customerPhone })
      })
    }

    // 6. Load sale records
    if (loadSaleData?.results) {
      loadSaleData.results.forEach(t => {
        if (t.customerName || t.mobileNumber) add({ name: t.customerName, phone: t.mobileNumber === 'N/A' ? undefined : t.mobileNumber })
      })
    }

    return Array.from(byKey.values()).filter((c) => c.name || c.phone || c.cnic)
  }, [allCustomersRaw, repairData, simSaleData, installmentData, serviceData, loadSaleData])

  // Filter by what the user has typed
  const suggestions = useMemo<CustomerSuggestion[]>(() => {
    if (!value || value.length < 2) return []
    const digits = value.replace(/\D/g, '')
    const lower = value.toLowerCase()

    return allSuggestions
      .filter(c => {
        const cPhone = (c.phone || '').replace(/\D/g, '')
        const cWA = (c.whatsapp || '').replace(/\D/g, '')
        const cCNIC = (c.cnic || '').replace(/\D/g, '')

        if (fieldType === 'cnic') {
          // In CNIC mode: prioritise CNIC match, also allow name search
          if (digits && cCNIC.includes(digits)) return true
        } else {
          // In phone mode: match phone, whatsapp, or CNIC digits
          if (digits && (cPhone.includes(digits) || cWA.includes(digits) || cCNIC.includes(digits))) return true
        }
        if (c.name?.toLowerCase().includes(lower)) return true
        return false
      })
      .slice(0, 7)
  }, [allSuggestions, value, fieldType])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e)
      setIsOpen(e.target.value.length >= 2)
    },
    [onChange],
  )

  const handleSelect = useCallback(
    (customer: CustomerSuggestion) => {
      // Fill THIS field with the matching identifier (phone or CNIC depending on mode)
      const fieldVal = fieldType === 'cnic'
        ? (customer.cnic || value)
        : (customer.phone || value)
      onChange?.({
        target: { value: fieldVal, name: (inputProps.name as string) ?? '' },
      } as React.ChangeEvent<HTMLInputElement>)
      // Always pass the full record so the parent can fill all related fields
      onCustomerSelect(customer)
      setIsOpen(false)
    },
    [value, onChange, onCustomerSelect, inputProps.name, fieldType],
  )

  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  return (
    <div ref={containerRef} className='relative w-full'>
      <Input
        fieldType={fieldType}
        showVoiceInput={showVoiceInput}
        value={value}
        onChange={handleChange}
        className={className}
        {...inputProps}
      />

      {isOpen && suggestions.length > 0 && (
        <div
          className={cn(
            'absolute left-0 right-0 z-[200] top-full mt-1',
            'bg-background border border-border rounded-md shadow-lg',
            'max-h-64 overflow-y-auto',
          )}
        >
          {suggestions.map((customer, idx) => {
            // Display-only fallback when no real name is on file anywhere — never written back as `name`.
            const displayLabel = customer.name || customer.phone || customer.cnic || 'Unknown'
            const avatarLetter = (customer.name || customer.phone || customer.cnic || '?').charAt(0)
            return (
            <button
              key={customer._id || customer.id || idx}
              type='button'
              className='w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left border-b border-border/40 last:border-0'
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(customer)
              }}
            >
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold uppercase select-none'>
                {avatarLetter}
              </div>
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium truncate'>
                  {displayLabel}
                  {!customer.name && <span className='ml-1.5 text-xs font-normal text-muted-foreground'>(no name on file)</span>}
                </p>
                <div className='flex flex-wrap gap-x-3 gap-y-0.5'>
                  {customer.name && customer.phone && (
                    <p className='text-xs text-muted-foreground'>{customer.phone}</p>
                  )}
                  {customer.cnic && (
                    <p className='text-xs text-muted-foreground'>CNIC: {customer.cnic}</p>
                  )}
                  {customer.address && (
                    <p className='text-xs text-muted-foreground truncate max-w-[140px]'>{customer.address}</p>
                  )}
                </div>
              </div>
            </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
