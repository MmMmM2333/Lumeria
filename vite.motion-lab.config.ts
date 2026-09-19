import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    optimizeDeps: { entries: ["motion-lab.html"] },
    build: {
      emptyOutDir: true,
      outDir: "dist/motion-lab",
      rollupOptions: {
        input: fileURLToPath(new URL("./motion-lab.html", import.meta.url)),
      },
    },
  }),
);
