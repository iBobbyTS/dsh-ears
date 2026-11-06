import { describe, expect, it, vi } from 'vitest'
import type { EarsCardState } from '../src/client/settings-controller.js'
import { EarsSettingsSection, localeEn, localeZh } from '../src/client/settings.js'

const reactMocks = vi.hoisted(() => ({
  useEffect: vi.fn(),
  useState: vi.fn()
}))

vi.mock('react', () => ({
  useEffect: reactMocks.useEffect,
  useId: () => 'settings-test',
  useRef: <T>(initial: T) => ({ current: initial }),
  useState: reactMocks.useState,
  useSyncExternalStore: vi.fn()
}))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  Input: () => null,
  Menu: ({ anchor }: { anchor: unknown }) => anchor,
  Tooltip: ({ children }: { children: unknown }) => children
}))

vi.mock('@thesvg/react/github', () => ({
  default: () => null
}))

const field = (text: string) => ({ text, overridden: false, invalid: false })
const cardState: EarsCardState = {
  available: true, writable: true, loaded: true, loadFailed: false, recoveredSettingsFields: [], saving: false, failed: false, dirty: true, invalid: false,
  localQwenModel: field('0.6b-8bit'), localQwenIdleTtlMinutes: field('17'), localQwenPrompt: field('Context'),
  maxRecordingSeconds: field('120'), voiceShortcutEnabled: field('on'), voiceShortcut: field('ctrl+shift+space'), voiceSoundsEnabled: field('off'), settingsDisplayName: field('dsh-ears')
}

describe('EarsSettingsSection lifecycle', () => {
  it.each([['English', localeEn], ['Chinese', localeZh]] as const)('links updates to the fork instructions in %s', (_name, dictionary) => {
    reactMocks.useEffect.mockClear()
    reactMocks.useState.mockReset()
    reactMocks.useState.mockImplementation((initial) => initial === 'general' ? ['about', vi.fn()] : initial === null ? [{ repository: 'https://github.com/iBobbyTS/dsh-ears', repositorySlug: '@iBobbyTS/dsh-ears', version: '0.4.3', license: 'MIT', dshCompatibility: '>=0.2.2-rc.1' }, vi.fn()] : [initial, vi.fn()])
    const tree = EarsSettingsSection({
      useEarsCard: (selector) => selector(cardState), earsT: (key) => dictionary[key], flush: vi.fn(), loadAbout: vi.fn(async () => null)
    } as Parameters<typeof EarsSettingsSection>[0])
    const elements = renderHostElements(tree)
    const link = elements.find((element) => element.type === 'a' && element.props?.href === 'https://github.com/iBobbyTS/dsh-ears#install')
    expect(textContent(link)).toBe(dictionary.aboutUpdatesLink)
    expect(textContent(elements)).not.toContain('npm')
  })

  it('flushes pending auto-saves when the settings section unmounts', () => {
    reactMocks.useEffect.mockClear()
    reactMocks.useState.mockReset()
    reactMocks.useState.mockImplementation((initial) => [initial, vi.fn()])
    const flush = vi.fn()

    EarsSettingsSection({
      useEarsCard: (selector) => selector(cardState),
      earsT: (key) => localeEn[key],
      edit: vi.fn(),
      flush,
      loadAbout: vi.fn(async () => null),
    })

    const lifecycleEffect = reactMocks.useEffect.mock.calls.find(([, dependencies]) => Array.isArray(dependencies) && dependencies.length === 0)
    expect(lifecycleEffect).toBeDefined()
    const cleanup = lifecycleEffect?.[0]()
    expect(cleanup).toBeTypeOf('function')
    cleanup?.()
    expect(flush).toHaveBeenCalledOnce()
  })

})

interface ElementLike {
  type?: unknown
  props?: Record<string, unknown>
}

function renderHostElements(node: unknown): ElementLike[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return []
  if (Array.isArray(node)) return node.flatMap(renderHostElements)
  const element = node as ElementLike
  if (typeof element.type === 'function') return renderHostElements(element.type(element.props ?? {}))
  return [element, ...renderHostElements(element.props?.children)]
}

function textContent(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join('')
  const element = node as ElementLike
  return textContent(element.props?.children)
}
