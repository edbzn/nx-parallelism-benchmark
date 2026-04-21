// scripts/scaffold.mjs - generates N packages with substantial source files
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const NUM_PACKAGES = parseInt(process.env.NUM_PACKAGES || '24', 10);
const FILES_PER_PKG = parseInt(process.env.FILES_PER_PKG || '30', 10);
const FNS_PER_FILE = parseInt(process.env.FNS_PER_FILE || '20', 10);

function mkdir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeIfChanged(file, content) {
  mkdir(path.dirname(file));
  fs.writeFileSync(file, content);
}

// Generate one synthetic TS module that does "real work" when bundled
function genModule(pkgIdx, fileIdx) {
  const fns = [];
  for (let i = 0; i < FNS_PER_FILE; i++) {
    fns.push(`export function fn_${pkgIdx}_${fileIdx}_${i}(a: number, b: number): number {
  const arr = Array.from({ length: 32 }, (_, k) => (a * k + b) ^ ${i});
  return arr.reduce((acc, v, k) => acc + Math.imul(v, k + 1) % 7919, 0);
}
export const CONST_${pkgIdx}_${fileIdx}_${i} = { kind: 'k_${i}', label: 'label-${pkgIdx}-${fileIdx}-${i}' } as const;
export type Shape_${pkgIdx}_${fileIdx}_${i} = { id: number; value: string; meta: { created: number; kind: 'k_${i}' } };`);
  }
  return fns.join('\n\n') + '\n';
}

function genIndex(pkgIdx) {
  const imports = [];
  const reexports = [];
  for (let f = 0; f < FILES_PER_PKG; f++) {
    imports.push(`import * as m${f} from './m${f}.js';`);
    reexports.push(`export * from './m${f}.js';`);
  }
  const body = `
const modules = [${Array.from({ length: FILES_PER_PKG }, (_, f) => `m${f}`).join(', ')}];
export function runAll(): number {
  let total = 0;
  for (const mod of modules) {
    for (const key of Object.keys(mod)) {
      const v = (mod as any)[key];
      if (typeof v === 'function') total += v(1, 2);
    }
  }
  return total;
}
`;
  return imports.join('\n') + '\n\n' + reexports.join('\n') + '\n' + body;
}

function genSpec(pkgIdx, specIdx) {
  // CPU-bound work so vitest's internal thread pool is actually exercised.
  // Each spec file runs in its own worker thread (up to maxThreads at once).
  return `import { describe, it, expect } from 'vitest';

function heavy(seed) {
  let x = seed | 0;
  for (let i = 0; i < 500_000; i++) {
    x = Math.imul(x ^ (x >>> 13), 0x5bd1e995) + i;
  }
  return x;
}

describe('pkg-${pkgIdx} spec-${specIdx}', () => {
  for (let i = 0; i < 8; i++) {
    it('heavy ' + i, () => {
      expect(typeof heavy(i + ${specIdx} * 7 + ${pkgIdx} * 13)).toBe('number');
    });
  }
});
`;
}

function genProjectJson(name) {
  return JSON.stringify({
    name,
    $schema: '../../node_modules/nx/schemas/project-schema.json',
    sourceRoot: `packages/${name}/src`,
    projectType: 'library',
    targets: {
      build: {
        executor: 'nx:run-commands',
        options: {
          command: `node ../../scripts/build.mjs ${name}`,
          cwd: `packages/${name}`
        }
      },
      test: {
        executor: 'nx:run-commands',
        options: {
          command: 'vitest run --reporter=basic',
          cwd: `packages/${name}`
        }
      }
    }
  }, null, 2);
}

function genVitestConfig() {
  // Simulate a realistic inner thread pool. Each vitest process uses up to 4
  // worker threads. This is the point of the benchmark: Nx --parallel stacks
  // on top of this inner parallelism.
  return `import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    pool: 'threads',
    poolOptions: { threads: { minThreads: 1, maxThreads: 4 } },
  },
});
`;
}

function genTsconfig() {
  return JSON.stringify({
    extends: '../../tsconfig.base.json',
    compilerOptions: { outDir: 'dist' },
    include: ['src/**/*.ts']
  }, null, 2);
}

for (let p = 0; p < NUM_PACKAGES; p++) {
  const name = `pkg-${p}`;
  const dir = path.join(ROOT, 'packages', name);
  mkdir(path.join(dir, 'src'));
  for (let f = 0; f < FILES_PER_PKG; f++) {
    writeIfChanged(path.join(dir, 'src', `m${f}.ts`), genModule(p, f));
  }
  writeIfChanged(path.join(dir, 'src', 'index.ts'), genIndex(p));
  for (let s = 0; s < 8; s++) {
    writeIfChanged(path.join(dir, 'src', `spec${s}.spec.ts`), genSpec(p, s));
  }
  writeIfChanged(path.join(dir, 'project.json'), genProjectJson(name));
  writeIfChanged(path.join(dir, 'vitest.config.ts'), genVitestConfig());
  writeIfChanged(path.join(dir, 'tsconfig.json'), genTsconfig());
  writeIfChanged(path.join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0', type: 'module' }, null, 2));
}

console.log(`Scaffolded ${NUM_PACKAGES} packages (${FILES_PER_PKG} files, ${FNS_PER_FILE} fns each).`);
