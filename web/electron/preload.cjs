"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// A deliberately narrow bridge: the renderer can operate only the fixed,
// signed release feed configured in the packaged main process. It cannot set a
// URL, open a file, execute a command, or access Node.js.
contextBridge.exposeInMainWorld("desktopUpdates", Object.freeze({
  getState: () => ipcRenderer.invoke("desktop-updates:get-state"),
  check: () => ipcRenderer.invoke("desktop-updates:check"),
  download: () => ipcRenderer.invoke("desktop-updates:download"),
  install: () => ipcRenderer.invoke("desktop-updates:install"),
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, next) => callback(next);
    ipcRenderer.on("desktop-updates:state", listener);
    return () => ipcRenderer.removeListener("desktop-updates:state", listener);
  },
}));
