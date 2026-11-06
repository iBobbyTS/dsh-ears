import { afterEach, describe, expect, it } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { ROOT, copyCandidate, verifyMapsAndLinks } from '../scripts/check-dist.mjs'
import { assertNoInstallBuild, verifyPackage } from '../scripts/verify-package.mjs'

const scratch: string[] = []
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ears-dist-test-'))
  scratch.push(root)
  copyCandidate(ROOT, root)
  cpSync(join(ROOT, 'lib'), join(root, 'lib'), { recursive: true })
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  return root
}

describe('distribution failure boundaries', () => {
  it.each(['modified', 'missing', 'extra'] as const)('rejects a %s artifact without overwriting maintained output', (kind) => {
    const root = fixture()
    const artifact = join(root, 'lib/index.js')
    const original = readFileSync(artifact)
    if (kind === 'modified') writeFileSync(artifact, Buffer.concat([original, Buffer.from('\n// intentional drift\n')]))
    if (kind === 'missing') rmSync(artifact)
    if (kind === 'extra') writeFileSync(join(root, 'lib/untracked-extra.js'), '// intentional extra\n')
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts/check-dist.mjs'), '--root', root, '--rebuild-only'], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Distribution check failed:')
    expect(result.stderr).toContain(kind === 'extra' ? 'extra: untracked-extra.js' : kind === 'missing' ? 'missing: index.js' : 'stale lib/index.js')
    expect(result.stderr).toContain('pnpm build:runtime')
    if (kind === 'missing') expect(existsSync(artifact)).toBe(false)
    else if (kind === 'modified') expect(readFileSync(artifact).equals(original)).toBe(false)
    else expect(existsSync(join(root, 'lib/untracked-extra.js'))).toBe(true)
  })

  it('rejects a real tarball that omits the Python worker', async () => {
    const root = fixture()
    const manifestPath = join(root, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.files = manifest.files.filter((file: string) => file !== 'python/qwen3_worker.py')
    writeFileSync(manifestPath, JSON.stringify(manifest))
    const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', root], { cwd: root, encoding: 'utf8' }))[0]
    const unpacked = join(root, 'unpacked')
    mkdirSync(unpacked)
    execFileSync('tar', ['-xzf', join(root, packed.filename), '-C', unpacked, '--strip-components=1'])
    expect(existsSync(join(unpacked, 'python/qwen3_worker.py'))).toBe(false)
    await expect(verifyPackage(unpacked, { loadRemotes: false })).rejects.toThrow('missing package file: python/qwen3_worker.py')
  })

  it('refuses installation/Git compilation hooks before packing', () => {
    for (const name of ['build', 'prepare', 'prepack', 'preinstall', 'install', 'postinstall', 'prepublish']) {
      expect(() => assertNoInstallBuild({ scripts: { [name]: 'tsdown' } })).toThrow(name)
    }
  })

  it('accepts the actual packed documentation and self-contained maps', async () => {
    const root = fixture()
    const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', root], { cwd: root, encoding: 'utf8' }))[0]
    const unpacked = join(root, 'unpacked')
    mkdirSync(unpacked)
    execFileSync('tar', ['-xzf', join(root, packed.filename), '-C', unpacked, '--strip-components=1'])
    await verifyPackage(unpacked, { loadRemotes: false })
    expect(() => verifyMapsAndLinks(unpacked)).not.toThrow()
    expect(existsSync(join(unpacked, 'node_modules'))).toBe(false)
    expect(existsSync(join(unpacked, 'src'))).toBe(false)
  })
})
