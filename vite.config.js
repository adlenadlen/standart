import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  root: 'src',                 // все исходники будут в /src
  publicDir: '../public',      // /public копируется «как есть»
  build: {
    outDir: '../dist',         // итоговый билд попадёт в /dist
    emptyOutDir: true,
    assetsDir: '_assets',
    cssMinify: 'lightningcss',
    cssCodeSplit: true,        // отдельные CSS только там, где нужны
    target: 'es2018',
    sourcemap: mode !== 'production'
  },
  esbuild: { legalComments: 'none' }
}));
