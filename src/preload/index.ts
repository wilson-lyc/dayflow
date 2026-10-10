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
  tasks: () => ipcRenderer.invoke('dayflow:tasks'),
  createTask: (input) => ipcRenderer.invoke('dayflow:create-task', input),
  setTaskStatus: (id, status, updatedAt, beforeId) =>
    ipcRenderer.invoke('dayflow:task-status', id, status, updatedAt, beforeId),
  fetchProviderModels: (id) => ipcRenderer.invoke('dayflow:fetch-provider-models', id),
  llmProviders: () => ipcRenderer.invoke('dayflow:llm-providers'),
  saveProvider: (input) => ipcRenderer.invoke('dayflow:save-provider', input),
  deleteProvider: (id) => ipcRenderer.invoke('dayflow:delete-provider', id),
  saveModel: (input) => ipcRenderer.invoke('dayflow:save-model', input),
  deleteModel: (id) => ipcRenderer.invoke('dayflow:delete-model', id),
  bootstrap: () => ipcRenderer.invoke('dayflow:bootstrap'),
  list: (date) => ipcRenderer.invoke('dayflow:list', date),
  find: (id) => ipcRenderer.invoke('dayflow:find', id),
  create: (input) => ipcRenderer.invoke('dayflow:create', input),
  edit: (id, content, at, zone, taskId) =>
    ipcRenderer.invoke('dayflow:edit', id, content, at, zone, taskId),
  change: (id, action) => ipcRenderer.invoke('dayflow:change', id, action),
  preference: (key, value) => ipcRenderer.invoke('dayflow:preference', key, value),
  reports: () => ipcRenderer.invoke('dayflow:reports'),
  saveReports: (writes) => ipcRenderer.invoke('dayflow:save-reports', writes),
  createReport: (date) => ipcRenderer.invoke('dayflow:create-report', date),
  deleteReport: (date, previous) => ipcRenderer.invoke('dayflow:delete-report', date, previous),
  chooseDataDirectory: () => ipcRenderer.invoke('dayflow:choose-data-directory'),
  migrateDataDirectory: (path) => ipcRenderer.invoke('dayflow:migrate-data-directory', path),
  openDataDirectory: () => ipcRenderer.invoke('dayflow:open-data-directory'),
  finishClose: () => ipcRenderer.send('dayflow:finish-close'),
  cancelClose: () => ipcRenderer.send('dayflow:cancel-close'),
  ready: () => ipcRenderer.send('dayflow:ready'),
  onClose: (callback) => subscribe('dayflow:close', callback),
  onSystemTheme: (callback) => subscribe('dayflow:system-theme', callback)
}
contextBridge.exposeInMainWorld('api', api)
