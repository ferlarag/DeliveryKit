import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const { DELIVERYKIT_API_TARGET = "http://localhost:8080" } = loadEnv(
    mode,
    import.meta.dirname,
    "DELIVERYKIT_",
  );

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: Object.fromEntries(
        ["/webhooks", "/endpoints", "/deliveries", "/health"].map((path) => [
          path,
          DELIVERYKIT_API_TARGET,
        ]),
      ),
    },
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "src") },
    },
  };
});
