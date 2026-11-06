import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'

const root = fileURLToPath(new URL('..', import.meta.url))
process.chdir(root)
// lib is the only generated directory this build owns.
rmSync('lib', { recursive: true, force: true })
await build({ config: 'tsdown.config.ts' })
