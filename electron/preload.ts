import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('organizer', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('config:save', config),
  getConfigPath: () => ipcRenderer.invoke('config:path'),
  discoverStartMenuApps: () => ipcRenderer.invoke('apps:discover-start-menu'),
  resolvePath: (value: string) => ipcRenderer.invoke('path:resolve', value),
  getManagedRoot: () => ipcRenderer.invoke('managed:root:get'),
  chooseManagedRoot: () => ipcRenderer.invoke('managed:root:choose'),
  previewManagedMove: (item: unknown, categoryName: string) => ipcRenderer.invoke('managed:preview', item, categoryName),
  managedAdd: (entry: unknown, categoryName: string) => ipcRenderer.invoke('managed:add', entry, categoryName),
  previewExistingMoves: () => ipcRenderer.invoke('managed:preview-existing'),
  moveExistingEntry: (entryId: string) => ipcRenderer.invoke('managed:move-existing', entryId),
  importConfig: () => ipcRenderer.invoke('config:import'),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  pickTarget: (type: 'executable' | 'file' | 'folder') => ipcRenderer.invoke('picker:target', type),
  pickIcon: () => ipcRenderer.invoke('picker:icon'),
  getIcon: (entryId: string) => ipcRenderer.invoke('icon:get', entryId),
  launch: (entryId: string) => ipcRenderer.invoke('launcher:launch', entryId),
  revealConfig: () => ipcRenderer.invoke('config:reveal')
});
