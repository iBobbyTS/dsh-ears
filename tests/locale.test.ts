import { describe, expect, it } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { localeEn, localeZh, localizedErrorText, type Translate } from '../src/client/settings-locale.js'

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
}

describe('dsh-ears locale dictionaries', () => {
  it('keeps the Chinese and English dictionaries balanced', () => {
    expect(Object.keys(localeEn).sort()).toEqual(Object.keys(localeZh).sort())
  })

  it('keeps template parameters aligned across locales', () => {
    for (const key of Object.keys(localeZh) as Array<keyof typeof localeZh>) {
      expect(placeholders(localeEn[key])).toEqual(placeholders(localeZh[key]))
    }
  })

  it('never ends any locale entry with a full stop', () => {
    for (const key of Object.keys(localeZh) as Array<keyof typeof localeZh>) {
      expect(localeZh[key]).not.toMatch(/[。.]$/)
      expect(localeEn[key]).not.toMatch(/[。.]$/)
    }
  })

  it('provides localized text for every structured error code', () => {
    const t = ((key: string, params?: Record<string, unknown>) => `${key}:${JSON.stringify(params ?? {})}`) as Translate
    for (const code of Object.values(EARS_ERROR_CODES)) {
      expect(localizedErrorText(t, code, 'fallback', { detail: 'detail', model: 'tiny', percent: 42, status: 500 })).not.toBe('fallback')
    }
    expect(localizedErrorText(t, 'future.error', 'fallback')).toBe('fallback')
  })
})
