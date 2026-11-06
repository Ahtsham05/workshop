import { useCallback } from 'react'
import { useSelector } from 'react-redux'
import { useGetBranchQuery } from '@/stores/branch.api'
import type { RepairJobRecord } from '@/stores/mobile-shop.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'
import { useCurrencyMeta } from '@/lib/format-money'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import {
  generateRepairReceiptHTML,
  generateRepairTagHTML,
  openRepairPrintWindow,
} from '../repair-print-utils'
import { deviceMeta, jobRef } from './repair-meta'

/** Prints a job's card / invoice / device tag with the branch's header and language. */
export function useRepairPrint() {
  const currencyMeta = useCurrencyMeta()
  const activeBranchId = useSelector(
    (state: RootState) => state.auth.activeBranchId
  )
  const preferredLanguage = useSelector(
    (state: RootState) => state.auth.data?.user?.preferredLanguage || 'en'
  )
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, {
    skip: !activeBranchId,
  })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, {
    skip: !user?.organizationId,
  })

  const printReceipt = useCallback(
    (job: RepairJobRecord, mode: 'job_card' | 'invoice' = 'job_card') => {
      const html = generateRepairReceiptHTML({
        mode,
        jobNumber: job.jobNumber || jobRef(job),
        customerName: job.customerName,
        phone: job.phone,
        deviceTypeLabel: deviceMeta(job.deviceType).label,
        brand: job.brand,
        deviceModel: job.deviceModel,
        serialNumber: job.serialNumber,
        color: job.color,
        accessories: job.accessories,
        problems: job.problems,
        conditionChecks: job.conditionChecks,
        issue: job.issue,
        workDone: job.diagnosis,
        technician: job.technician,
        status: job.status,
        outcome: job.outcome,
        dueDate: job.dueDate,
        estimatedCharges: job.estimatedCharges,
        items: (job.items ?? []).filter(
          (i) => i.unitPrice > 0 || i.kind === 'service'
        ),
        discount: job.discount,
        payments: job.payments,
        charges: job.charges ?? 0,
        advanceAmount: job.advanceAmount ?? 0,
        paymentMethod: job.paymentMethod ?? 'cash',
        warrantyDays: job.warrantyDays,
        warrantyUntil: job.warrantyUntil,
        date: job.date,
        companyName: resolveBranchCompanyName(orgData?.name, branchData?.name),
        companyAddress:
          [
            branchData?.location?.address,
            branchData?.location?.city,
            branchData?.location?.country,
          ]
            .filter(Boolean)
            .join(', ') || undefined,
        companyPhone: branchData?.phone,
        companyEmail: branchData?.email,
        companyLogo: orgData?.logo?.url,
        isTrial: orgData?.subscription?.isTrial,
        invoiceNote: branchData?.invoiceNote,
        userPreferredLanguage: preferredLanguage as 'en' | 'ur',
        currencyMeta,
      })
      openRepairPrintWindow(html)
    },
    [branchData, orgData, preferredLanguage, currencyMeta]
  )

  const printTag = useCallback((job: RepairJobRecord) => {
    const html = generateRepairTagHTML({
      jobNumber: job.jobNumber || jobRef(job),
      customerName: job.customerName,
      phone: job.phone,
      device: [job.brand, job.deviceModel].filter(Boolean).join(' '),
      issue: [...(job.problems ?? []), job.issue].filter(Boolean).join(' · '),
      dueDate: job.dueDate,
      date: job.date,
      // The tag stays in the shop with the device — the technician needs the code to test it.
      lockHint:
        job.lockType && job.lockType !== 'none'
          ? `${job.lockType}${job.lockCode ? ` ${job.lockCode}` : ''}`
          : undefined,
    })
    openRepairPrintWindow(html, 'tag')
  }, [])

  return { printReceipt, printTag }
}
