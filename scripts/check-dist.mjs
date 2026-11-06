import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertNoInstallBuild, verifyPackage } from './verify-package.mjs'
import { runCompatibilitySmoke } from './compat-smoke.mjs'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INPUTS = ['src', 'scripts', 'assets', 'locale', 'python', 'docs', 'README.md', 'README.en.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE', 'CHANGELOG.md', 'cordis.patch.yml', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.host.json', 'tsconfig.client.json', 'tsdown.config.ts', 'tsdown.client.ts']
export function files(root) {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    assert.ok(!entry.isSymbolicLink(), `distribution must not contain symlinks: ${join(root, entry.name)}`)
    return entry.isDirectory() ? files(join(root, entry.name)).map((file) => `${entry.name}/${file}`) : [entry.name]
  }).sort()
}
export function copyCandidate(root, candidate) {
  mkdirSync(candidate, { recursive: true })
  for (const path of INPUTS) if (existsSync(join(root, path))) cpSync(join(root, path), join(candidate, path), { recursive: true })
}
export function compareDist(current, rebuilt) {
  const actual = files(current)
  const expected = files(rebuilt)
  const missing = expected.filter((file) => !actual.includes(file))
  const extra = actual.filter((file) => !expected.includes(file))
  assert.ok(missing.length === 0 && extra.length === 0, `lib file set differs; missing: ${missing.join(', ') || '(none)'}; extra: ${extra.join(', ') || '(none)'}; run pnpm build:runtime`)
  assert.ok(expected.length > 0, 'independent runtime build produced no files')
  for (const path of expected) assert.ok(readFileSync(join(current, path)).equals(readFileSync(join(rebuilt, path))), `stale lib/${path}; run pnpm build:runtime`)
}
export function verifyMapsAndLinks(root) {
  for (const path of files(root)) {
    if (path.endsWith('.map')) {
      const map = JSON.parse(readFileSync(join(root, path), 'utf8'))
      assert.equal(map.version, 3, `invalid sourcemap: ${path}`)
      for (let index = 0; index < map.sources.length; index++) {
        const source = map.sources[index]
        assert.ok(!isAbsolute(source) && !/^[a-z]:|\/Users\/|\\/iu.test(source), `machine-specific map source in ${path}: ${source}`)
        assert.ok(typeof map.sourcesContent?.[index] === 'string' || existsSync(resolve(dirname(join(root, path)), map.sourceRoot ?? '', source)), `unresolved map source in ${path}: ${source}`)
      }
    }
    if (path.endsWith('.js')) {
      const body = readFileSync(join(root, path), 'utf8')
      const map = body.match(/\/\/# sourceMappingURL=([^\s]+)/u)?.[1]
      assert.ok(map && existsSync(resolve(dirname(join(root, path)), map)), `missing JS sourcemap: ${path}`)
    }
    if (path.endsWith('.md')) {
      for (const match of readFileSync(join(root, path), 'utf8').matchAll(/\]\(([^)]+)\)/gu)) {
        const link = match[1].split('#')[0]
        if (!link || /^[a-z]+:|^\//iu.test(link)) continue
        const destination = resolve(dirname(join(root, path)), decodeURIComponent(link))
        assert.ok(destination.startsWith(root + '/') && existsSync(destination), `broken packed documentation link in ${path}: ${link}`)
      }
    }
  }
}
function run(command, args, cwd) { return execFileSync(command, args, { cwd, stdio: 'inherit' }) }
export async function checkDist({ root = ROOT, rebuildOnly = false } = {}) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  // Refuse implicit compilers before npm/pnpm can see any pack or Git candidate.
  assertNoInstallBuild(manifest)
  const scratch = mkdtempSync(join(tmpdir(), 'ears-dist-'))
  const candidate = join(scratch, 'candidate')
  try {
    // Copy current dirty/untracked editing inputs, never HEAD or daily Profile.
    copyCandidate(root, candidate)
    symlinkSync(join(root, 'node_modules'), join(candidate, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    run(process.execPath, ['scripts/build-runtime.mjs'], candidate)
    // Comparison precedes all changes to maintained lib. This checker never replaces it.
    compareDist(join(root, 'lib'), join(candidate, 'lib'))
    console.log('Independent complete runtime file set and content match the current candidate')
    if (rebuildOnly) return
    await verifyPackage(root)
    const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', scratch], { cwd: root, encoding: 'utf8' }))[0]
    const tarball = join(scratch, packed.filename)
    const unpacked = join(scratch, 'packed')
    mkdirSync(unpacked)
    run('tar', ['-xzf', tarball, '-C', unpacked, '--strip-components=1'], root)
    await verifyPackage(unpacked, { loadRemotes: false })
    compareDist(join(unpacked, 'lib'), join(candidate, 'lib'))
    verifyMapsAndLinks(unpacked)
    // Development-only node_modules is not part of either installation candidate.
    rmSync(join(candidate, 'node_modules'), { recursive: true, force: true })
    await runCompatibilitySmoke({ projectRoot: root, packageSpec: tarball, dshVersion: '0.2.2-rc.1', scenario: 'canonical', browser: true })
    // Main/CI owns this disposable Git fixture, never the real repository's history.
    run('git', ['init', '--quiet'], candidate)
    run('git', ['add', '.'], candidate)
    run('git', ['-c', 'user.name=Delivery Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'prebuilt candidate'], candidate)
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: candidate, encoding: 'utf8' }).trim()
    await runCompatibilitySmoke({ projectRoot: root, packageSpec: `git+${pathToFileURL(candidate).href}#${commit}`, dshVersion: '0.2.2-rc.1', scenario: 'fresh', browser: true })
    console.log('Verified packed exports/resources/maps/docs, target DSH tarball/Git acquisition, Host and real browser Client loading')
  } finally { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootIndex = process.argv.indexOf('--root')
  try { await checkDist({ root: rootIndex < 0 ? ROOT : resolve(process.argv[rootIndex + 1]), rebuildOnly: process.argv.includes('--rebuild-only') }) }
  catch (error) { console.error(`Distribution check failed: ${error.message}`); process.exitCode = 1 }
}
