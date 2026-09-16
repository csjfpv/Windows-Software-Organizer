import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('organizer', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('config:save', config),
  discoverStartMenuApps: () => ipcRenderer.invoke('apps:discover-start-menu'),
  resolvePath: (value: string) => ipcRenderer.invoke('path:resolve', value),
  importConfig: () => ipcRenderer.invoke('config:import'),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  pickTarget: (type: 'executable' | 'file' | 'folder') => ipcRenderer.invoke('picker:target', type),
  pickIcon: () => ipcRenderer.invoke('picker:icon'),
  getIcon: (entryId: string) => ipcRenderer.invoke('icon:get', entryId),
  launch: (entryId: string) => ipcRenderer.invoke('launcher:launch', entryId),
  revealConfig: () => ipcRenderer.invoke('config:reveal')
});
