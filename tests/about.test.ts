import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  PLUGIN_REPOSITORY_SLUG,
  PLUGIN_REPOSITORY_URL,
  readInstalledAboutInfo,
  repositorySlugFromUrl,
  repositoryUrlFromPackage
} from '../src/about.js'
import { EARS_REMOTE_DESCRIPTORS } from '../src/remote-definitions.js'

describe('installed about info', () => {
  it('reads the package identity from package.json', () => {
    const about = readInstalledAboutInfo()
    expect(about.repository).toBe(PLUGIN_REPOSITORY_URL)
    expect(about.repositorySlug).toBe(PLUGIN_REPOSITORY_SLUG)
    expect(about.version).toBe('0.4.3')
    expect(about.license).toBe('MIT')
    expect(about.dshCompatibility).toBe('>=0.2.2-rc.1')
    expect(about).not.toHaveProperty('updateCommand')
    const descriptor = EARS_REMOTE_DESCRIPTORS.find(({ method }) => method === 'getAbout')
    expect(descriptor?.result.create().parse(about)).toEqual(about)
  })

  it('normalizes a git repository URL into a GitHub slug', () => {
    expect(repositoryUrlFromPackage({ url: 'git+https://github.com/iBobbyTS/dsh-ears.git' })).toBe(PLUGIN_REPOSITORY_URL)
    expect(repositorySlugFromUrl(PLUGIN_REPOSITORY_URL)).toBe('@iBobbyTS/dsh-ears')
  })

  it('falls back when a package.json field is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-ears-about-'))
    const path = join(dir, 'package.json')
    await writeFile(path, '{}\n')
    expect(readInstalledAboutInfo(path)).toEqual({
      repository: PLUGIN_REPOSITORY_URL,
      repositorySlug: PLUGIN_REPOSITORY_SLUG,
      version: '0.0.0',
      license: 'MIT',
      dshCompatibility: '>=0.2.2-rc.1'
    })
  })
})
