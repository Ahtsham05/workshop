import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'

/**
 * Work that keeps going after the screen that started it has closed — saving a product's
 * variants, adding it to other branches, a big import. The person gets their screen back
 * the moment their own part is done (the product is saved) instead of watching a spinner,
 * and follows the rest from the header's task indicator, with a toast when it finishes.
 *
 * Deliberately a plain module, not React state: a task outlives the component that started
 * it (a dialog unmounts as soon as it closes), so its state can't live in that component.
 */

export type BackgroundTaskStatus = 'running' | 'success' | 'warning' | 'error'

export interface BackgroundTask {
  id: string
  title: string
  /** What is happening right now, e.g. "Saving variants" or "3 of 4 branches". */
  detail?: string
  progress?: { done: number; total: number }
  status: BackgroundTaskStatus
  /** Outcome, once finished. */
  message?: string
  startedAt: number
  finishedAt?: number
}

export interface BackgroundTaskContext {
  update: (patch: Pick<BackgroundTask, 'detail' | 'progress'>) => void
}

export interface BackgroundTaskOutcome {
  status: Exclude<BackgroundTaskStatus, 'running'>
  message: string
}

/** Finished tasks stay in the indicator this long, so a result isn't missed. */
const FINISHED_TASK_TTL_MS = 60_000

let tasks: BackgroundTask[] = []
const listeners = new Set<() => void>()

const emit = () => {
  tasks = [...tasks]
  listeners.forEach((listener) => listener())
}

const patchTask = (id: string, patch: Partial<BackgroundTask>) => {
  const index = tasks.findIndex((task) => task.id === id)
  if (index === -1) return
  tasks[index] = { ...tasks[index], ...patch }
  emit()
}

export const dismissBackgroundTask = (id: string) => {
  tasks = tasks.filter((task) => task.id !== id)
  emit()
}

export const getRunningTaskCount = () => tasks.filter((task) => task.status === 'running').length

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => tasks

/** Every task still running or recently finished, newest first. */
export const useBackgroundTasks = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

let nextId = 0

/**
 * Starts `run` in the background and returns immediately. `run` reports progress through
 * `ctx.update` and resolves to the outcome shown to the person; if it throws, the task is
 * marked failed with `errorMessage` (never a raw exception text).
 */
export function runBackgroundTask({
  title,
  run,
  errorMessage = 'Something went wrong — please try again',
  toastOnFinish = true,
}: {
  title: string
  run: (ctx: BackgroundTaskContext) => Promise<BackgroundTaskOutcome>
  errorMessage?: string
  toastOnFinish?: boolean
}): string {
  nextId += 1
  const id = `task-${Date.now()}-${nextId}`
  tasks = [{ id, title, status: 'running', startedAt: Date.now() }, ...tasks]
  emit()

  const finish = (outcome: BackgroundTaskOutcome) => {
    patchTask(id, { ...outcome, detail: undefined, finishedAt: Date.now() })
    if (toastOnFinish) {
      const show = outcome.status === 'success' ? toast.success : outcome.status === 'warning' ? toast.warning : toast.error
      show(title, { description: outcome.message, duration: outcome.status === 'success' ? 4000 : 9000 })
    }
    setTimeout(() => dismissBackgroundTask(id), FINISHED_TASK_TTL_MS)
  }

  run({ update: (patch) => patchTask(id, patch) }).then(finish, () => finish({ status: 'error', message: errorMessage }))
  return id
}

// Leaving or reloading the page would cut a running task off half-way; ask first.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (getRunningTaskCount() === 0) return
    event.preventDefault()
    // Older browsers only show the prompt when returnValue is set.
    event.returnValue = ''
  })
}

/** Test-only: forget every task. */
export const __resetBackgroundTasksForTests = () => {
  tasks = []
  emit()
}
