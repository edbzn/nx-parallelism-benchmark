// scripts/build.mjs - invoke esbuild directly (no cache, realistic bundling)
import * as esbuild from 'esbuild';
import path from 'node:path';

const name = process.argv[2] || 'unknown';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'es2022',
  format: 'esm',
  outfile: path.join('dist', 'index.mjs'),
  minify: true,
  sourcemap: true,
  logLevel: 'error',
  treeShaking: true,
});
