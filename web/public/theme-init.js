// Set the theme before first paint (no flash of the wrong theme). Stored choice
// wins; otherwise the app starts in its black/dark theme. lib/theme.js keeps
// explicit choices in sync after load (toggle and other tabs).
//
// This lives as a same-origin file rather than an inline <script> ON PURPOSE:
// it lets the deployed app ship a strict Content-Security-Policy with
// `script-src 'self'` (no 'unsafe-inline', no per-file hash to keep in sync) —
// see public/_headers. It must stay a render-blocking classic script in <head>
// (no async/defer) so it runs before the first paint.
(function () {
  var t = null;
  try { t = localStorage.getItem("opentakeoff_theme"); } catch (e) {}
  if (t !== "light" && t !== "dark") t = "dark";
  document.documentElement.setAttribute("data-theme", t);
  document.querySelector('meta[name="theme-color"]')
    .setAttribute("content", t === "dark" ? "#121c2c" : "#f4efe0");
})();
