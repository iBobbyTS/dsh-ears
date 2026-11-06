import { defineConfig } from 'tsdown'
import { clientBundle } from './tsdown.client.ts'

export default defineConfig([
  {
    name: 'dsh-ears',
    entry: {
      index: 'src/index.ts',
      typert: 'src/typert.ts',
      remote: 'src/remote.ts'
    },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    dts: false,
    clean: false,
    sourcemap: true,
    outExtensions: () => ({
      js: '.js',
      dts: '.d.ts'
    })
  },
  clientBundle('dsh-ears', 'src/client.ts')
])
