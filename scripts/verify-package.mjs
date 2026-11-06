import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { CLIENT_EXTERNALS } from './browser-modules.mjs'

export function assertNoInstallBuild(manifest) {
  for (const name of ['build', 'prepare', 'prepack', 'preinstall', 'install', 'postinstall', 'prepublish']) {
    assert.ok(!manifest.scripts?.[name], `package.json must not declare installation/Git build hook: ${name}`)
  }
}

/** Verify the actual unpacked package, or the maintained package before packing. */
export async function verifyPackage(root, { loadRemotes = true } = {}) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assertNoInstallBuild(manifest)
  const requireFile = (file) => assert.ok(typeof file === 'string' && existsSync(join(root, file)) && statSync(join(root, file)).isFile(), `missing package file: ${file}`)
  assert.equal(manifest.name, 'dsh-ears')
  assert.equal(manifest.version, '0.4.3')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.engines.dsh, '>=0.2.2-rc.1')
  assert.equal(manifest.main, 'lib/index.js')
  assert.ok(!manifest.types, 'this plugin does not publish a declaration SDK')
  requireFile(manifest.main)
  for (const name of ['.', './client', './typert', './remote']) {
    assert.equal(typeof manifest.exports[name], 'string', `exports[${name}] must name the delivered runtime`)
    requireFile(manifest.exports[name])
  }
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json')
  for (const file of ['python/qwen3_worker.py', 'locale/en.json', 'locale/zh.json', 'README.md', 'README.en.md', 'LICENSE']) requireFile(file)
  requireFile(manifest.icon)
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  requireFile(manifest.dsh.bundle.patch)
  const patch = readFileSync(join(root, manifest.dsh.bundle.patch), 'utf8')
  assert.match(patch, /- id: dsh-ears\s+name: dsh-ears/u, 'bundle patch must insert this package')
  assert.equal(manifest.dsh.client.platform, 'web')
  for (const name of ['@fugood/whisper.node', '@deepseek-ai/dsh-credentials', '@deepseek-ai/dsh-llm', 'zustand', 'immer']) {
    assert.ok(!manifest.dependencies?.[name] && !manifest.peerDependencies?.[name], `removed or Host-owned runtime dependency: ${name}`)
  }
  for (const name of ['@deepseek-ai/dsh-client-store', 'react']) assert.ok(manifest.peerDependencies[name], `Host platform module must be a peer: ${name}`)
  assert.ok(manifest.dependencies.zod, 'Host codec parsing requires its ordinary zod dependency')
  for (const language of ['en', 'zh']) {
    const dictionary = JSON.parse(readFileSync(join(root, 'locale', `${language}.json`), 'utf8'))
    for (const key of ['title', 'description']) assert.ok(dictionary.meta[key]?.trim(), `locale/${language}.json meta.${key} is empty`)
  }
  const client = readFileSync(join(root, 'lib/client.js'), 'utf8')
  assert.ok(!/\bprocess\.env\b/u.test(client), 'Client has an unresolved process.env')
  const requires = [...client.matchAll(/\brequire\(["']([^"']+)["']\)/gu)].map((match) => match[1])
  for (const name of requires) assert.ok(CLIENT_EXTERNALS.includes(name), `Client external is absent from the target platform module table: ${name}`)
  for (const name of ['@deepseek-ai/dsh-client-store', 'zod', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives']) assert.ok(requires.includes(name), `Client must share the Host platform module: ${name}`)
  let registration
  runInNewContext(client, { window: { __ModuleLoader__: { load(value) { registration = value } } } })
  assert.equal(registration?.id, manifest.name, 'Client registration identity differs from package')
  assert.equal(typeof registration?.factory, 'function', 'Client factory is missing')
  for (const icon of ['IconChevronDownOutlineRegular', 'IconLoadingOutlineRegular', 'IconStopFillRegular', 'IconTrashOutlineRegular']) assert.ok(client.includes(icon), `Client icon missing: ${icon}`)
  for (const file of readdirSync(join(root, 'lib')).filter((file) => file.endsWith('.d.ts'))) assert.fail(`unused declaration output: lib/${file}`)
  if (loadRemotes) {
    const module = await import(pathToFileURL(join(root, manifest.exports['./remote'])).href)
    const descriptors = module.TYPERT_REMOTE.descriptors
    const expected = ['getAbout', 'getSettings', 'updateSettings', 'getQwenModelState', 'downloadQwenModel', 'cancelQwenModelDownload', 'deleteQwenModel', 'startQwenService', 'unloadQwenService', 'startRealtime', 'sendRealtimeAudio', 'finishRealtime', 'cancelRealtime']
    assert.deepEqual(descriptors.map(({ method }) => method).sort(), expected.sort(), 'Remote surface differs from the retained Qwen/general contract')
    const codecs = descriptors.flatMap((descriptor) => [...descriptor.parameters.map(({ codec }) => codec), descriptor.result])
    assert.equal(codecs.length, 24)
    for (const codec of codecs) {
      assert.equal(codec.mode, 'strict')
      assert.equal(typeof codec.create, 'function')
      assert.equal(typeof codec.create().parse, 'function')
    }
    for (const { id } of descriptors) assert.ok(client.includes(id), `Client descriptor missing: ${id}`)
  }
  return manifest
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await verifyPackage(root); console.log('Package contract verified for dsh-ears@0.4.3') }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
