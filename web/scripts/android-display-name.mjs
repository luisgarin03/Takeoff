import { APP_NAME } from "../src/brand/appName.js";

// Android string resources accept a quoted value, preserving spaces/apostrophes.
process.stdout.write(JSON.stringify(APP_NAME));
