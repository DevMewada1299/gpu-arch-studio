// Shared non-component constants. Kept out of component files so React Fast
// Refresh works (component files should export only components).

export const BENCHMARKS = ["dct8x8", "vectoradd", "gemm", "bfs"] as const;
export type Benchmark = (typeof BENCHMARKS)[number];
