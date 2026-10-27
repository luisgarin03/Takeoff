import { APP_NAME } from "./src/brand/appName.js";
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.opentakeoff.app',
  appName: APP_NAME,
  webDir: 'dist'
};

export default config;
