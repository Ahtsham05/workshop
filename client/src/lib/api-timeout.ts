export const API_TIMEOUT_MS = 5000

export function createTimeoutSignal(existingSignal?: AbortSignal | null | undefined): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    const timeoutSignal = AbortSignal.timeout(API_TIMEOUT_MS)
    if (!existingSignal) return timeoutSignal
    return AbortSignal.any([timeoutSignal, existingSignal])
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  const onAbort = () => {
    clearTimeout(timeoutId)
    controller.abort()
  }

  if (existingSignal) {
    if (existingSignal.aborted) {
      onAbort()
    } else {
      existingSignal.addEventListener('abort', onAbort, { once: true })
    }
  }

  controller.signal.addEventListener(
    'abort',
    () => clearTimeout(timeoutId),
    { once: true },
  )

  return controller.signal
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const signal = createTimeoutSignal(init?.signal ?? undefined)
  return fetch(input, { ...init, signal })
}
