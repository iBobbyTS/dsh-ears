/** Plugin identity and update-check helpers. */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLUGIN_LICENSE = 'MIT'
export const PLUGIN_REPOSITORY_URL = 'https://github.com/iBobbyTS/dsh-ears'
export const PLUGIN_REPOSITORY_SLUG = '@iBobbyTS/dsh-ears'
export const DSH_COMPATIBILITY = '>=0.2.2-rc.1'
export type AboutInfo = {
  readonly repository: string
  readonly repositorySlug: string
  readonly version: string
  readonly license: string
  readonly dshCompatibility: string
}

export function readInstalledAboutInfo(packageJsonPath = resolvePackageJsonPath()): AboutInfo {
  const raw = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    version?: unknown
    license?: unknown
    repository?: unknown
  }
  const version = typeof raw.version === 'string' && raw.version.trim() !== '' ? raw.version.trim() : '0.0.0'
  const license = typeof raw.license === 'string' && raw.license.trim() !== '' ? raw.license.trim() : PLUGIN_LICENSE
  const repository = repositoryUrlFromPackage(raw.repository)
  return {
    repository,
    repositorySlug: repositorySlugFromUrl(repository),
    version,
    license,
    dshCompatibility: DSH_COMPATIBILITY
  }
}

export function repositoryUrlFromPackage(value: unknown): string {
  const raw = typeof value === 'string'
    ? value
    : value !== null && typeof value === 'object' && 'url' in value && typeof value.url === 'string'
      ? value.url
      : ''
  const url = raw.trim().replace(/^git\+/, '').replace(/\.git$/, '')
  return url !== '' ? url : PLUGIN_REPOSITORY_URL
}

export function repositorySlugFromUrl(url: string): string {
  const match = /github\.com\/([^/]+\/[^/]+)/i.exec(url)
  return match === null ? PLUGIN_REPOSITORY_SLUG : `@${match[1].replace(/\.git$/, '')}`
}

export function resolvePackageJsonPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
}
