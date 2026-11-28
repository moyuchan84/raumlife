import { build } from 'esbuild';
await build({ entryPoints: ['builder/main.ts'], bundle: true, minify: true, format: 'iife', outfile: 'builder/dist/main.js', target: 'es2022' });
console.log('built builder/dist/main.js');
