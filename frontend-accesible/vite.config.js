import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";

const certPath = "./certs/local-cert.pem";
const keyPath = "./certs/local-key.pem";
const https =
  existsSync(certPath) && existsSync(keyPath)
    ? {
        cert: readFileSync(certPath),
        key: readFileSync(keyPath),
      }
    : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    https,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
