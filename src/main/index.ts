import { app, BrowserWindow, ipcMain, nativeTheme, Menu, dialog, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as store from './store'
import type { Preferences, Result } from '../shared/model'

app.setName('Dayflow')
let mainWindow: BrowserWindow | null = null
let allowClose = false
let quitting = false
function background(): string {
  return nativeTheme.shouldUseDarkColors ? '#181818' : '#ffffff'
}
function createWindow(): void {
  allowClose = false
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 460,
    minHeight: 560,
    show: false,
    title: 'Dayflow',
    icon,
    backgroundColor: background(),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 18, y: 22 },
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: background(),
            symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#0d0d0d',
            height: 64
          }
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.on('close', (event) => {
    if (!allowClose) {
      event.preventDefault()
      mainWindow?.webContents.send('dayflow:close')
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
    if (quitting) app.quit()
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })
  const revealFallback = setTimeout(() => mainWindow?.show(), 10000)
  revealFallback.unref()
  mainWindow.once('show', () => clearTimeout(revealFallback))
  mainWindow.on('closed', () => clearTimeout(revealFallback))
  if (is.dev && process.env.ELECTRON_RENDERER_URL)
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.show()
    mainWindow?.focus()
  })
  app.on('before-quit', (event) => {
    quitting = true
    if (mainWindow && !allowClose) {
      event.preventDefault()
      mainWindow.webContents.send('dayflow:close')
    }
  })
  app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.setIcon(icon)
    electronApp.setAppUserModelId('com.dayflow.app')
    function handle<T>(channel: string, operation: (...args: never[]) => T | Promise<T>): void {
      ipcMain.handle(`dayflow:${channel}`, async (event, ...args): Promise<Result<T>> => {
        if (
          event.sender !== mainWindow?.webContents ||
          event.senderFrame !== mainWindow.webContents.mainFrame
        )
          return { ok: false, error: 'state' }
        try {
          return { ok: true, value: await operation(...(args as never[])) }
        } catch (error) {
          console.error(`Dayflow ${channel}:`, error)
          return { ok: false, error: error instanceof store.ServiceError ? error.code : 'storage' }
        }
      })
    }
    handle('llm-providers', store.llmProviders)
    handle('fetch-provider-models', store.fetchProviderModels)
    handle('save-provider', store.saveProvider)
    handle('delete-provider', store.deleteProvider)
    handle('save-model', store.saveModel)
    handle('delete-model', store.deleteModel)
    handle('bootstrap', store.bootstrap)
    handle('tasks', store.tasks)
    handle('create-task', store.createTask)
    handle('task-status', store.setTaskStatus)
    handle('list', store.list)
    handle('find', store.find)
    handle('create', store.create)
    handle('edit', store.edit)
    handle('change', store.change)
    handle('preference', store.preference)
    handle('reports', store.reports)
    handle('save-reports', store.saveReports)
    handle('create-report', store.createReport)
    handle('delete-report', store.deleteReport)
    let selectedDirectory: string | null = null
    handle('choose-data-directory', async () => {
      if (!mainWindow) throw new store.ServiceError('state')
      const result = await dialog.showOpenDialog(mainWindow, {
        defaultPath: store.dataDirectory(),
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      selectedDirectory = result.canceled ? null : (result.filePaths[0] ?? null)
      return selectedDirectory
    })
    handle('migrate-data-directory', (path: string) => {
      if (!selectedDirectory || path !== selectedDirectory) throw new store.ServiceError('state')
      selectedDirectory = null
      return store.migrateDataDirectory(path)
    })
    handle('open-data-directory', async () => {
      const error = await shell.openPath(store.dataDirectory())
      if (error) throw new store.ServiceError('storage')
      return null
    })
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
        { role: 'editMenu' },
        { role: 'windowMenu' }
      ])
    )
    ipcMain.on('dayflow:ready', (event) => {
      if (event.sender === mainWindow?.webContents) mainWindow.show()
    })
    ipcMain.on('dayflow:cancel-close', (event) => {
      if (event.sender === mainWindow?.webContents) quitting = false
    })
    ipcMain.on('dayflow:finish-close', (event) => {
      if (event.sender === mainWindow?.webContents) {
        allowClose = true
        mainWindow.close()
      }
    })
    nativeTheme.on('updated', () => {
      mainWindow?.setBackgroundColor(background())
      if (process.platform !== 'darwin')
        mainWindow?.setTitleBarOverlay({
          color: background(),
          symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#0d0d0d'
        })
      mainWindow?.webContents.send('dayflow:system-theme', nativeTheme.shouldUseDarkColors)
    })
    try {
      const prefs: Preferences = store.preferences()
      nativeTheme.themeSource = prefs.themeMode
    } catch {
      /* bootstrap exposes failure */
    }
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
    createWindow()
    app.on('activate', () => {
      if (!mainWindow) createWindow()
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
