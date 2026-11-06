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
  it.each([['English', localeEn], ['Chinese', localeZh]] as const)('keeps newer upstream versions informational in %s', (_name, dictionary) => {
    reactMocks.useEffect.mockClear()
    reactMocks.useState.mockReset()
    reactMocks.useState.mockImplementation((initial) => {
      if (initial === 'general') return ['about', vi.fn()]
      if (initial !== null && typeof initial === 'object' && initial.status === 'idle') {
        return [{ status: 'update-available', installed: '0.4.3', latest: '9.9.9' }, vi.fn()]
      }
      return [initial, vi.fn()]
    })
    const tree = EarsSettingsSection({
      useEarsCard: (selector) => selector(cardState),
      earsT: (key, params) => dictionary[key].replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] === undefined ? match : String(params[name])),
      flush: vi.fn(),
      loadAbout: vi.fn(async () => null),
      checkForUpdate: vi.fn(async () => ({ status: 'update-available' as const, installed: '0.4.3', latest: '9.9.9' }))
    } as Parameters<typeof EarsSettingsSection>[0])
    const elements = renderHostElements(tree)
    const actions = elements.filter((element) => element.type === 'button' && element.props?.role !== 'tab')
    expect(actions).toHaveLength(1)
    expect(textContent(actions)).toBe(dictionary.aboutCheckAction)
    expect(textContent(elements)).toContain(dictionary.aboutCheck)
    expect(textContent(elements)).toContain('9.9.9')
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
      checkForUpdate: vi.fn(async () => ({ status: 'unpublished' as const, installed: '0.1.0', latest: null }))
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
