import { useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { useGetAllSalesmanProfilesQuery } from '@/stores/salesmanProfile.api'
import { useLanguage } from '@/context/language-context'

interface SalesmanFieldProps {
  value: string | undefined
  onValueChange: (value: string) => void
  id?: string
}

/**
 * Drop-in "Salesman" form field for any sale-creation form (Sim Sale, Load, Repair,
 * Services — mirrors the one built inline in invoice-panel.tsx). Renders nothing at all
 * when there are no active salesmen yet, so it never clutters a shop that hasn't set the
 * Salesmen module up.
 */
export function SalesmanField({ value, onValueChange, id }: SalesmanFieldProps) {
  const { t } = useLanguage()
  const { data: salesmen } = useGetAllSalesmanProfilesQuery({ status: 'active' })

  const options = useMemo(
    () => (salesmen || []).map((s) => ({ value: s.id, label: s.name, sublabel: s.salesmanCode })),
    [salesmen]
  )

  if (options.length === 0) return null

  return (
    <div>
      <Label htmlFor={id}>{t('salesman') || 'Salesman'}</Label>
      <SearchableSelect
        id={id}
        options={options}
        value={value || ''}
        onValueChange={onValueChange}
        placeholder={t('select_salesman') || 'Select a salesman...'}
        clearLabel={t('none') || 'None'}
      />
    </div>
  )
}
