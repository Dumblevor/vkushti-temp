import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/seed.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // The shared workspace package ships TypeScript source, so bundle it in.
  noExternal: ['@spotter/shared'],
  clean: true,
  sourcemap: true,
});
