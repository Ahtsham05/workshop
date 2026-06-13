import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  isElectron: true,
  getNetworkStatus: () => ipcRenderer.invoke('network:status'),
  onNetworkStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('network:status', handler);
    return () => ipcRenderer.removeListener('network:status', handler);
  },
  sync: {
    configure: (config) => ipcRenderer.invoke('sync:configure', config),
    status: () => ipcRenderer.invoke('sync:status'),
    pull: (opts) => ipcRenderer.invoke('sync:pull', opts),
    push: () => ipcRenderer.invoke('sync:push'),
    run: (opts) => ipcRenderer.invoke('sync:run', opts),
    bootstrap: () => ipcRenderer.invoke('sync:bootstrap'),
    queue: (op) => ipcRenderer.invoke('sync:queue', op),
  },
  db: {
    products: (search) => ipcRenderer.invoke('db:products', search),
    customers: () => ipcRenderer.invoke('db:customers'),
    meta: (key) => ipcRenderer.invoke('db:meta', key),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
