import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// @ts-expect-error shared plain JavaScript middleware is also used by the production launcher
import { staticFiles } from "./scripts/files.mjs";
// @ts-expect-error shared with the production launcher
import { localRequests } from "./scripts/http.mjs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-trip-files",
      configureServer(server) {
        server.middlewares.use(localRequests);
        server.middlewares.use(
          staticFiles(
            fileURLToPath(new URL("./trips", import.meta.url)),
            "/trips/",
            { documents: true },
          ),
        );
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    cors: false,
    watch: { ignored: ["**/trips/**"] },
    fs: {
      // Trip files must use the document middleware, never Vite's module transforms.
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "**/trips/**",
      ],
    },
  },
});
