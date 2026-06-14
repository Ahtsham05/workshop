import Store from 'electron-store';

const DEFAULT_TTL_HOURS = 168;
const settingsStore = new Store({ name: 'desktop-cache' });

export function getCacheSettings() {
  return {
    ttlHours: Number(settingsStore.get('ttlHours', DEFAULT_TTL_HOURS)),
    ttlEnabled: settingsStore.get('ttlEnabled', true) !== false,
    defaultTtlHours: DEFAULT_TTL_HOURS,
  };
}

export function saveCacheSettings(settings = {}) {
  if (settings.ttlHours != null) {
    settingsStore.set('ttlHours', Math.max(1, Number(settings.ttlHours)));
  }
  if (settings.ttlEnabled != null) {
    settingsStore.set('ttlEnabled', Boolean(settings.ttlEnabled));
  }
  return getCacheSettings();
}

export function getCacheTtlMs() {
  const settings = getCacheSettings();
  if (!settings.ttlEnabled) return null;
  return settings.ttlHours * 60 * 60 * 1000;
}
