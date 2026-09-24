import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ command }) => ({
  // Development serves both labs and browser fixtures from the repository.
  // Building uses the lab root so the artifact is dist/motion-lab/index.html.
  root: fileURLToPath(new URL(command === "build" ? "./src/motionLab/" : "./", import.meta.url)),
  optimizeDeps: { entries: [
    fileURLToPath(new URL("./src/motionLab/index.html", import.meta.url)),
    fileURLToPath(new URL("./tests/browser/importLab/index.html", import.meta.url)),
  ] },
  build: {
    emptyOutDir: true,
    outDir: fileURLToPath(new URL("./dist/motion-lab/", import.meta.url)),
    rollupOptions: {
      input: fileURLToPath(new URL("./src/motionLab/index.html", import.meta.url)),
    },
  },
  // Hutch replaces its generated devkit directory during native builds. Watching
  // it keeps directory handles open on Windows and blocks that replacement.
  server: { watch: { ignored: ["**/.hutch/**", "**/target/**", "**/.codex-dev/**", "**/artifacts/**", "**/build/**"] } },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith("fluent-"),
        },
      },
    }),
    Icons({ compiler: "vue3" }),
  ],
}));
