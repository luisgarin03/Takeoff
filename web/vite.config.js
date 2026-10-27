import { APP_NAME } from "./src/brand/appName.js";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { assertPublicCloudEnv } from "./src/lib/supabase/config.js";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// The one source of truth for the app version — package.json — inlined as
// __APP_VERSION__ so contributions can carry generator_version without a
// runtime fetch. Guarded with `typeof` at the use site so the Node test
// runner (no Vite, no define) sees plain undefined instead of a crash.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const OCR_ASSETS = Object.freeze({
  "worker.min.js": fileURLToPath(new URL("./node_modules/tesseract.js/dist/worker.min.js", import.meta.url)),
  "tesseract-core-simd-lstm.wasm.js": fileURLToPath(new URL("./node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", import.meta.url)),
  "eng.traineddata.gz": fileURLToPath(new URL("./node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", import.meta.url)),
});

function localOcrAssets() {
  return {
    name: "local-ocr-assets",
    configureServer(server) {
      server.middlewares.use("/ocr", (request, response, next) => {
        const name = decodeURIComponent(String(request.url || "").split(/[?#]/, 1)[0]).replace(/^\/+/, "");
        const source = OCR_ASSETS[name];
        if (!source || !existsSync(source)) return next();
        response.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/gzip");
        createReadStream(source).pipe(response);
      });
    },
    closeBundle() {
      const destination = fileURLToPath(new URL("./dist/ocr", import.meta.url));
      mkdirSync(destination, { recursive: true });
      for (const [name, source] of Object.entries(OCR_ASSETS)) copyFileSync(source, join(destination, name));
    },
  };
}

// OpenTakeoff is a client-only static app: the takeoff canvas runs entirely in
// the browser (pdf.js + canvas + the geometry libs), persists to IndexedDB /
// localStorage, and builds to a static `dist/` you can host anywhere (GitHub
// Pages, Vercel, Netlify, an S3 bucket).
//
// The `/ai` proxy is OPTIONAL — it only matters if you run the bring-your-own-
// model AI sandbox in `../server` (see server/README.md). Without it, the app
// works fully; the AI hooks just stay dormant.
export default defineConfig(({ mode }) => {
  // Fail before Vite can inline an accidentally supplied privileged key.
  assertPublicCloudEnv(loadEnv(mode, process.cwd(), "VITE_"));
  return {
  plugins: [react(), localOcrAssets(), {
    name: "app-display-name",
    transformIndexHtml(html) {
      const escaped = APP_NAME.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      return html.replaceAll("%APP_NAME%", escaped);
    },
  }],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    proxy: {
      "/ai": "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  };
});
