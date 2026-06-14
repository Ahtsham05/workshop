import { isApiUnreachable, isNetworkError } from '@/lib/auth-cache'
import { getElectronAPI, isElectronApp } from '@/lib/sync/electron'
import type { SyncQueueOperation } from '@/types/electron'
import type { RootState } from '@/stores/store'

export type OfflineMutationContext = {
  organizationId: string
  branchId: string
  userId?: string
}

function isOfflineContext(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

export function getOfflineMutationContext(getState?: () => unknown): OfflineMutationContext {
  if (getState) {
    const state = getState() as RootState
    const user = state.auth.data?.user
    const organizationId = user?.organizationId || ''
    const branchId = state.auth.activeBranchId || localStorage.getItem('activeBranchId') || ''
    return {
      organizationId,
      branchId,
      userId: user?.id,
    }
  }

  try {
    const userStr = localStorage.getItem('user')
    const user = userStr ? JSON.parse(userStr) : null
    return {
      organizationId: user?.organizationId || '',
      branchId: localStorage.getItem('activeBranchId') || '',
      userId: user?.id,
    }
  } catch {
    return { organizationId: '', branchId: '' }
  }
}

export async function withOfflineMutationFallback<T>(
  onlineMutate: () => Promise<T>,
  offlineMutate: () => Promise<T>,
): Promise<T> {
  if (!isElectronApp()) {
    return onlineMutate()
  }

  if (isOfflineContext()) {
    return offlineMutate()
  }

  try {
    return await onlineMutate()
  } catch (error) {
    if (isNetworkError(error) || isApiUnreachable(error)) {
      return offlineMutate()
    }
    throw error
  }
}

export async function createCustomerOffline(
  data: Record<string, unknown>,
  context: OfflineMutationContext,
) {
  const electron = getElectronAPI()
  if (!electron) {
    throw new Error('Offline customer creation is only available in the desktop app')
  }

  const clientId = crypto.randomUUID()
  const now = new Date().toISOString()
  const customer = {
    ...data,
    id: clientId,
    organizationId: context.organizationId,
    branchId: context.branchId,
    createdBy: context.userId,
    offlinePending: true,
    createdAt: now,
    updatedAt: now,
  }

  const operation: SyncQueueOperation = {
    clientId,
    entity: 'customer',
    operation: 'create',
    payload: customer,
  }

  await electron.sync.queue(operation)
  return customer
}

export async function updateCustomerOffline(
  data: Record<string, unknown> & { _id?: string; id?: string },
  context: OfflineMutationContext,
) {
  const electron = getElectronAPI()
  if (!electron) {
    throw new Error('Offline customer update is only available in the desktop app')
  }

  const customerId = String(data._id || data.id || '')
  if (!customerId) {
    throw new Error('Customer ID is required')
  }

  const { _id, id, ...updateBody } = data
  const clientId = customerId
  const baseVersion = Number(
    (data as Record<string, unknown>).version ??
      (data as Record<string, unknown>).syncVersion ??
      (data as Record<string, unknown>).baseVersion ??
      0,
  )
  const payload = {
    ...updateBody,
    customerId,
    baseVersion: baseVersion || undefined,
    organizationId: context.organizationId,
    branchId: context.branchId,
    updatedAt: new Date().toISOString(),
  }

  const operation: SyncQueueOperation = {
    clientId,
    entity: 'customer',
    operation: 'update',
    payload,
  }

  await electron.sync.queue(operation)
  return { ...payload, id: customerId, offlinePending: true }
}

export async function createSupplierOffline(
  data: Record<string, unknown>,
  context: OfflineMutationContext,
) {
  const electron = getElectronAPI()
  if (!electron) {
    throw new Error('Offline supplier creation is only available in the desktop app')
  }

  const clientId = crypto.randomUUID()
  const now = new Date().toISOString()
  const supplier = {
    ...data,
    id: clientId,
    organizationId: context.organizationId,
    branchId: context.branchId,
    createdBy: context.userId,
    offlinePending: true,
    createdAt: now,
    updatedAt: now,
  }

  const operation: SyncQueueOperation = {
    clientId,
    entity: 'supplier',
    operation: 'create',
    payload: supplier,
  }

  await electron.sync.queue(operation)
  return supplier
}

export async function updateSupplierOffline(
  data: Record<string, unknown> & { _id?: string; id?: string },
  context: OfflineMutationContext,
) {
  const electron = getElectronAPI()
  if (!electron) {
    throw new Error('Offline supplier update is only available in the desktop app')
  }

  const supplierId = String(data._id || data.id || '')
  if (!supplierId) {
    throw new Error('Supplier ID is required')
  }

  const { _id, id, ...updateBody } = data
  const clientId = supplierId
  const baseVersion = Number(
    (data as Record<string, unknown>).version ??
      (data as Record<string, unknown>).syncVersion ??
      (data as Record<string, unknown>).baseVersion ??
      0,
  )
  const payload = {
    ...updateBody,
    supplierId,
    baseVersion: baseVersion || undefined,
    organizationId: context.organizationId,
    branchId: context.branchId,
    updatedAt: new Date().toISOString(),
  }

  const operation: SyncQueueOperation = {
    clientId,
    entity: 'supplier',
    operation: 'update',
    payload,
  }

  await electron.sync.queue(operation)
  return { ...payload, id: supplierId, offlinePending: true }
}
