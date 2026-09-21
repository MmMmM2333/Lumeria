import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  optimizeDeps: { entries: ["motion-lab.html", "import-lab.html"] },
  build: {
    emptyOutDir: true,
    outDir: "dist/motion-lab",
    rollupOptions: {
      input: fileURLToPath(new URL("./motion-lab.html", import.meta.url)),
    },
  },
  server: { watch: { ignored: ["**/target/**", "**/.codex-dev/**", "**/artifacts/**", "**/build/**"] } },
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
});
