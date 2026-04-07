import { contextBridge, ipcRenderer } from 'electron'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      ipcRenderer: {
        send: (channel, ...args) => {
          const validChannels = ['complete-devotion', 'close-kiosk', 'snooze', 'skip-today', 'minimize-window']
          if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, ...args)
          }
        },
        on: (channel, func) => {
          const validChannels = ['window-visibility', 'reset-ui', 'window-show']
          if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (_, ...args) => func(...args))
          }
        },
        removeListener: (channel, func) => {
          const validChannels = ['window-visibility', 'reset-ui', 'window-show']
          if (validChannels.includes(channel)) {
            ipcRenderer.removeListener(channel, func)
          }
        },
        invoke: (channel, ...args) => {
          const validChannels = ['get-settings', 'save-settings', 'fetch-esv', 'fetch-esv-audio', 'fetch-ai', 'get-custom-commentaries', 'save-custom-commentary', 'get-today-reading', 'get-all-books']
          if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args)
          }
          return Promise.reject(new Error(`Invalid channel: ${channel}`))
        }
      }
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = {
    ipcRenderer
  }
}
