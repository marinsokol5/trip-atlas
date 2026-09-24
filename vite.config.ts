import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import licenseModule, { type Dependency } from "rollup-plugin-license";
import { defineConfig } from "vite";
// The CommonJS plugin exports its function directly; its types declare an ES default.
const license = licenseModule as unknown as typeof licenseModule.default;
// @ts-expect-error shared plain JavaScript middleware is also used by the production launcher
import { staticFiles } from "./scripts/files.mjs";
// @ts-expect-error shared with the production launcher
import { localRequests } from "./scripts/http.mjs";

export default defineConfig({
  plugins: [
    react(),
    // Bundled libraries' licenses, regenerated on every build; minification drops their comments.
    license({
      thirdParty: {
        includePrivate: false,
        allow: {
          test: "(MIT OR ISC OR BSD-2-Clause OR BSD-3-Clause OR Apache-2.0)",
          failOnUnlicensed: true,
          failOnViolation: true,
        },
        output: {
          file: fileURLToPath(
            new URL("./dist/THIRD_PARTY_LICENSES.txt", import.meta.url),
          ),
          template: (dependencies: Dependency[]) =>
            dependencies
              .map(
                (d: Dependency) =>
                  `${d.name}@${d.version} (${d.license})\n\n${d.licenseText?.trim() ?? ""}${d.noticeText ? `\n\n${d.noticeText.trim()}` : ""}`,
              )
              .join(`\n\n${"-".repeat(72)}\n\n`) + "\n",
        },
      },
    }),
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
