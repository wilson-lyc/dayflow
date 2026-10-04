import { app, BrowserWindow, ipcMain, nativeTheme, Menu } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
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
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: 'Dayflow',
    backgroundColor: background(),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 18, y: 22 },
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: background(),
            symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#0a0a0a',
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
    electronApp.setAppUserModelId('com.dayflow.app')
    function handle<T>(channel: string, operation: (...args: never[]) => T): void {
      ipcMain.handle(`dayflow:${channel}`, (event, ...args): Result<T> => {
        if (
          event.sender !== mainWindow?.webContents ||
          event.senderFrame !== mainWindow.webContents.mainFrame
        )
          return { ok: false, error: 'state' }
        try {
          return { ok: true, value: operation(...(args as never[])) }
        } catch (error) {
          console.error(`Dayflow ${channel}:`, error)
          return { ok: false, error: error instanceof store.ServiceError ? error.code : 'storage' }
        }
      })
    }
    handle('bootstrap', store.bootstrap)
    handle('list', store.list)
    handle('find', store.find)
    handle('create', store.create)
    handle('edit', store.edit)
    handle('change', store.change)
    handle('preference', store.preference)
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
          symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#0a0a0a'
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
