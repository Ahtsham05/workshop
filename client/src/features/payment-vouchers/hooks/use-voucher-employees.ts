import { useMemo } from 'react'
import { useGetEmployeesWithLedgerBalancesQuery, type EmployeeWithBalance } from '@/stores/hr.api'

export interface EmployeeOption {
  value: string
  label: string
  sublabel?: string
  picture?: undefined
}

/**
 * The branch's employees with their ledger balance, for the Employee lines on a voucher — one
 * request, made only once a row is switched to "Employee" (most vouchers never need it), and
 * fresh every time the dialog opens because balances move as vouchers are posted.
 *
 * `balances[id]`: + = salary payable to them, − = advance they owe back.
 */
export function useVoucherEmployees(enabled: boolean, keep: { id?: string; name?: string }[] = []) {
  const { data, isFetching, isError } = useGetEmployeesWithLedgerBalancesQuery(undefined, {
    skip: !enabled,
    refetchOnMountOrArgChange: true,
  })

  return useMemo(() => {
    const employees: EmployeeWithBalance[] = Array.isArray(data) ? data : []
    // Active staff first, then by name — a former employee can still be settled with.
    const sorted = [...employees].sort((a, b) => {
      const activeA = a.employmentStatus === 'Active' ? 0 : 1
      const activeB = b.employmentStatus === 'Active' ? 0 : 1
      return activeA - activeB || a.name.localeCompare(b.name)
    })
    const options: EmployeeOption[] = sorted.map((employee) => ({
      value: employee.id,
      label: employee.name,
      sublabel: [employee.employeeId, employee.designation, employee.employmentStatus !== 'Active' ? employee.employmentStatus : '']
        .filter(Boolean)
        .join(' · '),
    }))
    // An employee already on the voucher stays selectable even if no longer listed.
    keep.forEach((item) => {
      if (item.id && !options.some((option) => option.value === item.id)) {
        options.push({ value: item.id, label: item.name || 'Employee' })
      }
    })
    const balances: Record<string, number> = {}
    const byId: Record<string, EmployeeWithBalance> = {}
    employees.forEach((employee) => {
      balances[employee.id] = Number(employee.currentBalance) || 0
      byId[employee.id] = employee
    })
    return { options, balances, byId, loading: enabled && isFetching && !data, failed: isError }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isFetching, isError, enabled, JSON.stringify(keep)])
}
