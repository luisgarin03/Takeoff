import { CloudError } from "./supabase/errors.js";
let loaded;
function loadPicker() {
  if (window.google?.picker) return Promise.resolve();
  if (!loaded) loaded = new Promise((resolve, reject) => {
    const fail = () => { loaded = null; reject(new CloudError("OTK_PICKER", "Google Drive picker could not load. Check your connection and try again.")); };
    const init = () => window.gapi.load("picker", { callback: resolve, onerror: fail, timeout: 15000, ontimeout: fail });
    if (window.gapi) { init(); return; }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js"; script.async = true;
    const timer = setTimeout(fail, 20000);
    script.onload = () => { clearTimeout(timer); init(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); fail(); };
    document.head.appendChild(script);
  });
  return loaded;
}
export async function pickDriveFiles(drive) {
  await loadPicker();
  const { accessToken, developerKey, appId } = await drive.sharePicker();
  return new Promise((resolve) => {
    const g = window.google.picker;
    const picker = new g.PickerBuilder().setDeveloperKey(developerKey).setAppId(appId)
      .setOAuthToken(accessToken).setOrigin(window.location.origin)
      .setTitle("Choose the .otk project and any supporting files to share")
      .enableFeature(g.Feature.MULTISELECT_ENABLED)
      .addView(new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false))
      .setCallback((data) => {
        if (data.action === g.Action.PICKED) { picker.dispose(); resolve(data.docs.map((doc) => ({ id: doc.id, name: doc.name }))); }
        else if (data.action === g.Action.CANCEL) { picker.dispose(); resolve(null); }
      }).build();
    picker.setVisible(true);
  });
}
