// scripts/bench.mjs - sweep --parallel and collect wall-clock metrics
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TARGET = process.env.TARGET || 'build';
const PARALLEL_VALUES = (process.env.PARALLEL_VALUES || '1,2,4,8,12').split(',').map(Number);
const RUNS = parseInt(process.env.RUNS || '3', 10);
const WARMUP = parseInt(process.env.WARMUP || '1', 10);
const OUT = process.env.OUT || 'results.json';

// Safety: refuse to run with parallel values that could saturate the machine.
// Cap at the physical logical CPU count (even when pinned to fewer CPUs via
// taskset, the Node/Vitest processes themselves still exist on the host and
// consume RAM). The vitest inner pool is also capped to 4 in vitest.config.ts,
// so max live threads = max(parallel) * 4 which stays bounded.
const MAX_SAFE = os.cpus().length;
for (const v of PARALLEL_VALUES) {
  if (v > MAX_SAFE) {
    console.error(`Refusing: parallel=${v} > safe cap ${MAX_SAFE} on ${os.cpus().length}-CPU machine.`);
    process.exit(1);
  }
}
// Rough RAM guard: assume ~350MB per Nx-spawned process. Abort if the peak
// parallel value would exceed 60% of total memory.
const MAX_PARALLEL = Math.max(...PARALLEL_VALUES);
const estBytes = MAX_PARALLEL * 350 * 1024 * 1024;
if (estBytes > os.totalmem() * 0.6) {
  console.error(
    `Refusing: peak parallel=${MAX_PARALLEL} would need ~${(estBytes / 1e9).toFixed(1)}GB (>60% of ${(os.totalmem() / 1e9).toFixed(1)}GB RAM).`
  );
  process.exit(1);
}

// Optional CPU pinning so the benchmark reflects a realistic CI machine size
// instead of the whole dev box. Set CPU_SET="0-7" to run on 8 logical CPUs.
const CPU_SET = process.env.CPU_SET || '';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const finalCmd = CPU_SET ? 'taskset' : cmd;
    const finalArgs = CPU_SET ? ['-c', CPU_SET, cmd, ...args] : args;
    const child = spawn(finalCmd, finalArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NX_TUI: 'false', CI: 'true', FORCE_COLOR: '0' },
    });
    let stderr = '';
    child.stderr.on('data', d => (stderr += d));
    child.stdout.on('data', () => {}); // drain
    child.on('error', reject);
    child.on('exit', (code) => {
      const ms = performance.now() - started;
      if (code !== 0) return reject(new Error(`exit ${code}\n${stderr}`));
      resolve(ms);
    });
  });
}

function stats(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / sorted.length;
  const stdev = Math.sqrt(variance);
  return { mean, median, min, max, stdev };
}

const results = {
  env: {
    node: process.version,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model,
    totalMemGB: +(os.totalmem() / 1e9).toFixed(1),
    platform: `${os.platform()} ${os.release()}`,
    target: TARGET,
    runs: RUNS,
    warmup: WARMUP,
    cpuSet: CPU_SET || null,
    timestamp: new Date().toISOString(),
  },
  samples: [],
};

console.log(`Bench target=${TARGET} parallel=[${PARALLEL_VALUES.join(',')}] runs=${RUNS} warmup=${WARMUP}`);

for (const p of PARALLEL_VALUES) {
  const times = [];
  // warmup
  for (let w = 0; w < WARMUP; w++) {
    await run('npx', ['nx', 'run-many', '-t', TARGET, `--parallel=${p}`, '--skip-nx-cache', '--output-style=static']);
  }
  for (let r = 0; r < RUNS; r++) {
    const ms = await run('npx', ['nx', 'run-many', '-t', TARGET, `--parallel=${p}`, '--skip-nx-cache', '--output-style=static']);
    times.push(ms);
    console.log(`  parallel=${p} run ${r + 1}/${RUNS}: ${ms.toFixed(0)}ms`);
  }
  const s = stats(times);
  results.samples.push({ parallel: p, times, ...s });
  console.log(`parallel=${p} -> mean=${s.mean.toFixed(0)}ms median=${s.median.toFixed(0)}ms min=${s.min.toFixed(0)}ms`);
}

fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`\nWrote ${OUT}`);

// Pretty table
console.log('\nSummary:');
console.log('parallel | mean(ms) | median(ms) | min(ms) | stdev(ms)');
console.log('---------|----------|------------|---------|----------');
for (const s of results.samples) {
  console.log(
    `${String(s.parallel).padStart(8)} | ${s.mean.toFixed(0).padStart(8)} | ${s.median.toFixed(0).padStart(10)} | ${s.min.toFixed(0).padStart(7)} | ${s.stdev.toFixed(0).padStart(9)}`
  );
}
