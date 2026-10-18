import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: '/blueorbit/',
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/blueorbit/api": {
        target: "http://127.0.0.1:3000",
        rewrite: (path) => path.replace(/^\/blueorbit/, ""),
      },
      "/api": "http://127.0.0.1:3000",
    },
    watch: {
      ignored: ["**/public/**"],
    },
  },
});
