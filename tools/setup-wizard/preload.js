'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('wizard', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  checkEnv: () => ipcRenderer.invoke('env:check'),
  openUrl: (url) => ipcRenderer.invoke('open:url', url),
  authStart: () => ipcRenderer.invoke('auth:start'),
  authPoll: () => ipcRenderer.invoke('auth:poll'),
  fork: () => ipcRenderer.invoke('repo:fork'),
  chooseDir: () => ipcRenderer.invoke('dir:choose'),
  clone: (args) => ipcRenderer.invoke('setup:clone', args),
  validateExistingClone: (dir) => ipcRenderer.invoke('setup:validateExistingClone', dir),
  validateGadgetId: (args) => ipcRenderer.invoke('gadget:validateId', args),
  createGadget: (args) => ipcRenderer.invoke('gadget:create', args),
  runDev: (args) => ipcRenderer.invoke('dev:run', args),
  onLog: (callback) => ipcRenderer.on('wizard:log', (_event, line) => callback(line)),
  onDevReady: (callback) => ipcRenderer.on('wizard:dev-ready', (_event, url) => callback(url)),
  onDevExit: (callback) => ipcRenderer.on('wizard:dev-exit', (_event, code) => callback(code)),
})
