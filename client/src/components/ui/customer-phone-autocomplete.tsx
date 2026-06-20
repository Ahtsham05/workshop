import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import {
  useGetRepairJobsQuery,
  useGetSimSalesQuery,
  useGetInstallmentPlansQuery,
  useGetServiceInvoicesQuery,
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

  // Merge all data sources into a deduplicated CustomerSuggestion list
  const allSuggestions = useMemo<CustomerSuggestion[]>(() => {
    const seen = new Set<string>()
    const results: CustomerSuggestion[] = []

    const add = (s: CustomerSuggestion) => {
      if (!s.name) return
      // Deduplicate: prefer phone, then CNIC, then name
      const key = s.phone
        ? s.phone.replace(/\D/g, '')
        : s.cnic
          ? s.cnic.replace(/\D/g, '')
          : s.name.trim().toLowerCase()
      if (!key || seen.has(key)) return
      seen.add(key)
      results.push(s)
    }

    // 1. Saved customers
    const customers: CustomerSuggestion[] = Array.isArray(allCustomersRaw) ? allCustomersRaw : []
    customers.forEach(c => add({ ...c, id: c._id || c.id }))

    // 2. Repair job records
    if (repairData?.results) {
      repairData.results.forEach(r => {
        if (r.customerName) add({ name: r.customerName, phone: r.phone })
      })
    }

    // 3. Sim-sale records (server-filtered, debounced)
    if (simSaleData?.results) {
      simSaleData.results.forEach(s => {
        if (s.customerMobile || s.customerName) {
          add({
            name: s.customerName || s.customerMobile || '',
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
        if (i.customerName) {
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
        if (s.customerName) add({ name: s.customerName, phone: s.customerPhone })
      })
    }

    return results
  }, [allCustomersRaw, repairData, simSaleData, installmentData, serviceData])

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
          {suggestions.map((customer, idx) => (
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
                {customer.name.charAt(0)}
              </div>
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium truncate'>{customer.name}</p>
                <div className='flex flex-wrap gap-x-3 gap-y-0.5'>
                  {customer.phone && (
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
          ))}
        </div>
      )}
    </div>
  )
}
