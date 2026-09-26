# Third-party notices

OpenTakeoff is Apache-2.0 licensed. It builds on the following open-source projects,
which retain their own licenses:

| Project | License | Use |
|---|---|---|
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | Apache-2.0 | PDF parsing & rendering (incl. the bundled `pdf.worker`) |
| [React](https://github.com/facebook/react) / `react-dom` | MIT | UI runtime |
| [React Router](https://github.com/remix-run/react-router) | MIT | Routing |
| [Vite](https://github.com/vitejs/vite) | MIT | Build tool / dev server |
| [fflate](https://github.com/101arrowz/fflate) | MIT | Unzipping dropped `.zip` plan sets (lazy-loaded) |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | MIT | Wrapping dropped images into PDFs (lazy-loaded) |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 | Type-checking the geometry libs |
| [tsx](https://github.com/privatenumber/tsx) | MIT | Running TS tests under Node |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) (`@modelcontextprotocol/sdk`) | MIT | The `mcp/` server's protocol layer (stdio + in-memory test transport) |
| [Zod](https://github.com/colinhacks/zod) | MIT | Tool-input validation in `mcp/` |

The optional AI sandbox (`/server`) additionally uses
[FastAPI](https://github.com/fastapi/fastapi) (MIT), [Starlette](https://github.com/encode/starlette) (BSD-3-Clause),
[Uvicorn](https://github.com/encode/uvicorn) (BSD-3-Clause), and [Pydantic](https://github.com/pydantic/pydantic) (MIT).

`pdf.js` is distributed under the Apache License 2.0; a copy of that license is
available at <https://github.com/mozilla/pdf.js/blob/master/LICENSE>.

## Startup and application artwork

- Blueprint icon **1373067**, designed by **Magnific (formerly Freepik) from Flaticon**: <https://www.flaticon.com/free-icon/blueprint_1373067>. Flaticon free license with attribution, **not Apache-2.0**. Source PNG and generated platform variants are distributed with the app.
- **SelfMadeSystem**, Uiverse **warm-lion-64** background: <https://uiverse.io/SelfMadeSystem/warm-lion-64>, MIT. Scoped CSS and a static native splash frame.

Full notices ship in `web/public/asset-licenses.txt`; the startup screen links to `web/public/credits.html`. Regenerate icons with `python3 web/scripts/generate-app-icons.py` (Pillow required only for generation).
