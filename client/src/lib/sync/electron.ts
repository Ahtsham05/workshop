export function isElectronApp(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.isElectron
}

export function getElectronAPI() {
  return isElectronApp() ? window.electronAPI : undefined
}
