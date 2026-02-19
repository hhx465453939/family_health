import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, "..");
  const env = loadEnv(mode, envDir, "");
  const host = env.FH_SERVER_HOST || "127.0.0.1";
  const port = env.FH_SERVER_PORT || "8000";
  const apiTarget = env.FH_API_TARGET || env.VITE_API_TARGET || `http://${host}:${port}`;

  return {
    envDir,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/health": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
