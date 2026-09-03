const { app, BrowserWindow, protocol, shell, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const APP_SCHEME = "opentakeoff";
const APP_HOST = "app";

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

if (process.platform === "win32" && process.env.LOCALAPPDATA) {
  app.setPath("userData", path.join(process.env.LOCALAPPDATA, "OpenTakeoff"));
}

app.setName("OpenTakeoff");

function distPath() {
  return path.join(app.getAppPath(), "dist");
}

function contentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js":
    case ".mjs": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".pdf": return "application/pdf";
    case ".txt": return "text/plain; charset=utf-8";
    case ".wasm": return "application/wasm";
    default: return "application/octet-stream";
  }
}

async function appResponse(request) {
  const root = path.resolve(distPath());
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname || "/");

  if (url.host !== APP_HOST) {
    return new Response("Not found", { status: 404 });
  }
  if (pathname === "/") pathname = "/index.html";

  let target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const stat = await fs.promises.stat(target);
    if (stat.isDirectory()) target = path.join(target, "index.html");
  } catch {
    if (path.extname(pathname)) {
      return new Response("Not found", { status: 404 });
    }
    target = path.join(root, "index.html");
  }

  try {
    const body = await fs.promises.readFile(target);
    return new Response(body, {
      headers: {
        "content-type": contentType(target),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return new Response(String(error?.message || error), { status: 500 });
  }
}

function applySecurityHeaders() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src * data: blob:",
      "worker-src 'self' blob:",
      "frame-src https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
        "X-Content-Type-Options": ["nosniff"],
      },
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: "#f4efe0",
    icon: path.join(app.getAppPath(), "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.removeMenu();
  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const next = new URL(url);
    if (next.protocol !== `${APP_SCHEME}:`) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(`${APP_SCHEME}://${APP_HOST}/`);
}

app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, appResponse);
  applySecurityHeaders();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
