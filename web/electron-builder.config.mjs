import { readFileSync } from "node:fs";
import { APP_NAME } from "./src/brand/appName.js";

const { build } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
export default {
  ...build,
  productName: APP_NAME,
  forceCodeSigning: !!process.env.CSC_LINK,
  publish: [{
    provider: "github",
    owner: process.env.UPDATE_GITHUB_OWNER || "luisgarin03",
    repo: process.env.UPDATE_GITHUB_REPO || "Takeoff",
    releaseType: "release",
  }],
  win: {
    ...build.win,
    ...(process.env.WINDOWS_PUBLISHER_NAME ? { publisherName: [process.env.WINDOWS_PUBLISHER_NAME] } : {}),
    verifyUpdateCodeSignature: true,
  },
  nsis: { ...build.nsis, artifactName: "${productName}-Setup-x64.${ext}", shortcutName: APP_NAME },
};
