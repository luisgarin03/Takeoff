"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");

const CHANNEL = "desktop-updates:state";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 10 * 1000;

let checking = null;
let configured = false;
let state = {
  supported: false,
  currentVersion: "",
  phase: "idle",
  availableVersion: "",
  releaseName: "",
  releaseDate: "",
  releaseNotes: "",
  percent: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
  error: "",
};

function cleanNotes(notes) {
  const value = Array.isArray(notes) ? notes.map((item) => item?.note || "").join("\n") : String(notes || "");
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
}

function broadcast() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(CHANNEL, state);
  }
}

function updateState(patch) {
  state = { ...state, ...patch };
  broadcast();
  return state;
}

function trustedRenderer(event) {
  return String(event.senderFrame?.url || "").startsWith("opentakeoff://app/");
}

function requireTrustedRenderer(event) {
  if (!trustedRenderer(event)) throw new Error("Update controls are available only inside the installed app.");
}

async function checkForUpdates() {
  if (!state.supported) return state;
  if (checking) return checking;
  checking = (async () => {
    updateState({ phase: "checking", error: "" });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error("Update check failed", error);
      updateState({ phase: "error", error: "Updates could not be checked. Verify your internet connection and try again." });
    } finally {
      checking = null;
    }
    return state;
  })();
  return checking;
}

function registerIpc() {
  ipcMain.handle("desktop-updates:get-state", (event) => {
    requireTrustedRenderer(event);
    return state;
  });
  ipcMain.handle("desktop-updates:check", (event) => {
    requireTrustedRenderer(event);
    return checkForUpdates();
  });
  ipcMain.handle("desktop-updates:download", async (event) => {
    requireTrustedRenderer(event);
    if (!state.supported) return state;
    if (state.phase !== "available" && state.phase !== "error") return state;
    updateState({ phase: "downloading", percent: 0, transferred: 0, total: 0, error: "" });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error("Update download failed", error);
      updateState({ phase: "error", error: "The update could not be downloaded. Try again later." });
    }
    return state;
  });
  ipcMain.handle("desktop-updates:install", (event) => {
    requireTrustedRenderer(event);
    if (state.supported && state.phase === "ready") {
      updateState({ phase: "installing", error: "" });
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
    }
    return state;
  });
}

function configureEvents() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on("checking-for-update", () => updateState({ phase: "checking", error: "" }));
  autoUpdater.on("update-available", (info) => updateState({
    phase: "available",
    availableVersion: String(info?.version || ""),
    releaseName: String(info?.releaseName || "").slice(0, 200),
    releaseDate: String(info?.releaseDate || ""),
    releaseNotes: cleanNotes(info?.releaseNotes),
    percent: 0,
    error: "",
  }));
  autoUpdater.on("update-not-available", () => updateState({ phase: "current", availableVersion: "", percent: 0, error: "" }));
  autoUpdater.on("download-progress", (progress) => updateState({
    phase: "downloading",
    percent: Math.max(0, Math.min(100, Number(progress?.percent) || 0)),
    transferred: Number(progress?.transferred) || 0,
    total: Number(progress?.total) || 0,
    bytesPerSecond: Number(progress?.bytesPerSecond) || 0,
    error: "",
  }));
  autoUpdater.on("update-downloaded", (info) => updateState({
    phase: "ready",
    availableVersion: String(info?.version || state.availableVersion || ""),
    percent: 100,
    error: "",
  }));
  autoUpdater.on("error", (error) => {
    console.error("Updater error", error);
    updateState({ phase: "error", error: "Updates are temporarily unavailable. Try again later." });
  });
}

function setupUpdater() {
  if (configured) return;
  configured = true;
  state = {
    ...state,
    supported: process.platform === "win32" && app.isPackaged,
    currentVersion: app.getVersion(),
  };
  registerIpc();
  if (!state.supported) return;
  configureEvents();
  const first = setTimeout(() => { checkForUpdates(); }, INITIAL_CHECK_DELAY_MS);
  first.unref?.();
  const interval = setInterval(() => { checkForUpdates(); }, CHECK_INTERVAL_MS);
  interval.unref?.();
}

module.exports = { setupUpdater };
