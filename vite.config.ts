import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
// @ts-expect-error shared plain JavaScript middleware is also used by the production launcher
import { staticFiles } from './scripts/files.mjs';
export default defineConfig({ plugins: [react(), { name: 'local-trip-files', configureServer(server) { server.middlewares.use(staticFiles(new URL('./trips', import.meta.url).pathname, '/trips/')); } }], server: { host: '127.0.0.1', watch: { ignored: ['**/trips/**'] } } });
