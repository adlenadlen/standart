import { defineConfig } from 'vite';
import { resolve, join } from 'path';
import { readdirSync, statSync } from 'fs';

function findHtmlEntries(rootDir) {
  const entries = {};
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (name.toLowerCase() === 'index.html') {
        // ключ для Rollup: main для корня, иначе на основе подпапки
        const rel = full.replace(rootDir + '/', '');
        const key = rel === 'index.html'
          ? 'main'
          : rel.replace(/\/index\.html$/i, '').replace(/\//g, '-');
        entries[key] = resolve(full);
      }
    }
  }
  walk(rootDir);
  return entries;
}

export default defineConfig(({ mode }) => {
  const rootPath = resolve(__dirname, 'src');
  const inputs = findHtmlEntries(rootPath);

  return {
    root: 'src',
    publicDir: '../public',
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      assetsDir: '_assets',
      cssMinify: 'lightningcss',
      cssCodeSplit: true,
      target: 'es2018',
      sourcemap: mode !== 'production',
      rollupOptions: { input: inputs }
    },
    esbuild: { legalComments: 'none' }
  };
});
