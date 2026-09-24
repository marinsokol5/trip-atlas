import { defineConfig } from "vite";

// Node cannot strip TypeScript inside node_modules, so the CLI validator ships as bundled JavaScript.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: "src/validate.ts",
    outDir: "dist-node",
    target: "node22",
    rolldownOptions: { output: { entryFileNames: "validate.mjs" } },
  },
});
