import { readFileSync } from "node:fs";
import { APP_NAME } from "./src/brand/appName.js";

const { build } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
export default {
  ...build,
  productName: APP_NAME,
  nsis: { ...build.nsis, artifactName: "${productName}-Setup-x64.${ext}", shortcutName: APP_NAME },
};
