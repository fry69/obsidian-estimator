import path from "node:path";
import { execSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { cloudflare } from "@cloudflare/vite-plugin";

import pkg from "./package.json" with { type: "json" };

const CROCK32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I, L, O, U
function crock32Tag(len = 5) {                      // 5 chars = 32⁵
  let out = "";
  for (let i = 0; i < len; i++) out += CROCK32[randomInt(32)];
  return out;
}


function gitShort() {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "nogit";
  }
}

const BUILD_TAG      = crock32Tag(5);                             // e.g. "4GF7V"
const BUILD_TIME_ISO = new Date().toISOString();               // e.g. 2025-10-23T12:34:56.789Z
const BUILD_COMMIT   = gitShort();                             // e.g. a1b2c3d
const BUILD_ID       = `${BUILD_COMMIT}-${BUILD_TAG}`;    // distinct per build
const APP_VERSION    = pkg.version || "0.0.0";                 // from package.json

process.env.VITE_BUILD_ID = BUILD_ID;
process.env.VITE_BUILD_TIME = BUILD_TIME_ISO;
process.env.VITE_BUILD_COMMIT = BUILD_COMMIT;
process.env.VITE_APP_VERSION = APP_VERSION;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // forces skipWaiting + clientsClaim
      manifest: false, // we don't use a manifest.json
      workbox: {
        // defaults already precache your build; keep cleanup enabled
        cleanupOutdatedCaches: true,
        sourcemap: true,
      },
      // keep SW disabled in dev unless you know you want it:
      devOptions: { enabled: false },
    }),
    cloudflare(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
