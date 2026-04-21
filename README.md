# nx-parallelism-benchmark

A minimal Nx workspace that measures how `nx run-many --parallel=N` interacts with the internal parallelism of modern tools (esbuild, vitest). Used as the companion repro for [The Nx --parallel pitfall: when more is less](https://edbzn.dev).

## Layout

```
packages/pkg-*   # 24 synthetic TS packages (scaffolded)
scripts/scaffold.mjs  # generates packages/
scripts/build.mjs     # direct esbuild call used as the `build` target
scripts/bench.mjs     # sweeps --parallel and writes a JSON results file
```

## Reproduce

```bash
pnpm install
node scripts/scaffold.mjs

# Build sweep (pin to 8 CPUs to reflect a typical CI runner):
CPU_SET=0-7 TARGET=build RUNS=3 WARMUP=1 \
  PARALLEL_VALUES=1,2,4,6,8,12 \
  OUT=results-build-8cpu.json \
  node scripts/bench.mjs

# Test sweep:
CPU_SET=0-7 TARGET=test RUNS=3 WARMUP=1 \
  PARALLEL_VALUES=1,2,4,6,8,12 \
  OUT=results-test-8cpu.json \
  node scripts/bench.mjs
```

## Safety

`scripts/bench.mjs` refuses any `--parallel` value greater than 50% of the host's logical CPU count. Each vitest process is also capped at `maxThreads: 4` in `vitest.config.ts` so that Nx's `--parallel` is the variable under test and the benchmark cannot saturate the machine.

## Results

See the blog post for the headline numbers. Raw JSON outputs are committed as `results-*.json`.
