import { contextBridge, ipcRenderer } from 'electron'
import type { DayflowAPI } from '../shared/model'
function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}
const api: DayflowAPI = {
  bootstrap: () => ipcRenderer.invoke('dayflow:bootstrap'),
  list: (date) => ipcRenderer.invoke('dayflow:list', date),
  find: (id) => ipcRenderer.invoke('dayflow:find', id),
  create: (draft, epoch) => ipcRenderer.invoke('dayflow:create', draft, epoch),
  edit: (id, content, at, zone) => ipcRenderer.invoke('dayflow:edit', id, content, at, zone),
  change: (id, action) => ipcRenderer.invoke('dayflow:change', id, action),
  cache: (draft, epoch) => ipcRenderer.invoke('dayflow:cache', draft, epoch),
  preference: (key, value) => ipcRenderer.invoke('dayflow:preference', key, value),
  finishClose: () => ipcRenderer.send('dayflow:finish-close'),
  cancelClose: () => ipcRenderer.send('dayflow:cancel-close'),
  ready: () => ipcRenderer.send('dayflow:ready'),
  onClose: (callback) => subscribe('dayflow:close', callback),
  onSystemTheme: (callback) => subscribe('dayflow:system-theme', callback),
  onCacheReset: (callback) => subscribe('dayflow:cache-reset', callback)
}
contextBridge.exposeInMainWorld('api', api)
