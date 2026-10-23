import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  external: ['react', '@forgeops/fluxgate'],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
