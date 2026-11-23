// Bundles report-src/render.js (olomol's renderer) into report/olomol-render.js:
// one classic script, as a page opened from file:// can't load modules.
import { defineConfig } from 'vite';

export default defineConfig({
  logLevel: 'warn',
  define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"bench"', __BUILD_DATE__: '""', __RELEASE_DATE__: '""', __COMMIT__: '""', __RDKIT_WASM_SIZE__: 0, __INDIGO_WASM_SIZE__: 0, __OCL_RESOURCES_SIZE__: 0 },
  build: {
    outDir: new URL('../report/', import.meta.url).pathname,
    emptyOutDir: false,
    copyPublicDir: false,
    minify: true,
    lib: { entry: new URL('render.js', import.meta.url).pathname, formats: ['iife'], name: 'olomolRenderBundle', fileName: () => 'olomol-render.js' },
  },
});
