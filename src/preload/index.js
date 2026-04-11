import { contextBridge, ipcRenderer } from 'electron'

if (process.contextIsolated) {
  try {
    // Maps the original listener function -> its ipcRenderer wrapper.
    // Required so removeListener can correctly unregister the specific wrapper
    // that was registered — not the original func which ipcRenderer never saw.
    const listenerMap = new Map()

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
            const wrapper = (_, ...args) => func(...args)
            listenerMap.set(func, wrapper)
            ipcRenderer.on(channel, wrapper)
          }
        },
        removeListener: (channel, func) => {
          const validChannels = ['window-visibility', 'reset-ui', 'window-show']
          if (validChannels.includes(channel)) {
            const wrapper = listenerMap.get(func)
            if (wrapper) {
              ipcRenderer.removeListener(channel, wrapper)
              listenerMap.delete(func)
            }
          }
        },
        invoke: (channel, ...args) => {
          const validChannels = ['get-settings', 'save-settings', 'fetch-esv', 'fetch-esv-audio', 'fetch-ai', 'get-custom-commentaries', 'save-custom-commentary', 'get-today-reading', 'get-all-books', 'get-version']
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
