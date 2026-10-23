import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'openfeature/web': 'src/openfeature/web.ts',
    'openfeature/server': 'src/openfeature/server.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  external: ['@openfeature/web-sdk', '@openfeature/server-sdk', '@openfeature/core'],
});
