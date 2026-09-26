import { defineConfig } from "vite";

// Node cannot strip TypeScript inside node_modules, so the CLI validator ships as bundled JavaScript,
// with its libraries inlined: the published package has no runtime dependencies.
export default defineConfig({
  publicDir: false,
  ssr: { noExternal: true },
  build: {
    ssr: "src/validate.ts",
    outDir: "dist-node",
    target: "node22",
    rolldownOptions: { output: { entryFileNames: "validate.mjs" } },
  },
});
