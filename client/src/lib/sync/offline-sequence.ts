export function nextOfflineSequence(storageKey: string, prefix: string, deviceId: string): string {
  const key = `offline-seq:${storageKey}:${deviceId}`
  const seq = Number(localStorage.getItem(key) || 0) + 1
  localStorage.setItem(key, String(seq))
  const shortId = deviceId.slice(0, 8).toUpperCase()
  return `${prefix}-${shortId}-${String(seq).padStart(5, '0')}`
}
