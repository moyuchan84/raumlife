import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist/client', { recursive: true });
await build({
  entryPoints: ['src/client/main.ts'],
  bundle: true,
  outfile: 'dist/client/app.js',
  format: 'iife',
  target: 'es2020',
  sourcemap: true,
  minify: process.argv.includes('--min'),
  logLevel: 'info',
});
await copyFile('src/client/index.html', 'dist/client/index.html');
await copyFile('src/client/style.css', 'dist/client/style.css');
