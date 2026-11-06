import { describe, expect, it } from 'vitest'
import { isSettingsFieldInvalid, parseSettingsField } from '../src/client/settings-fields.js'
describe('Qwen/general field parsing', () => {
  it('parses numeric and toggle fields', () => {
    expect(parseSettingsField('localQwenIdleTtlMinutes', '17')).toBe(17)
    expect(parseSettingsField('voiceSoundsEnabled', 'off')).toBe(false)
    expect(parseSettingsField('localQwenPrompt', '  context  ')).toBe('  context  ')
  })
  it('validates retained settings independently', () => {
    expect(isSettingsFieldInvalid('localQwenIdleTtlMinutes', '0')).toBe(true)
    expect(isSettingsFieldInvalid('localQwenModel', '0.6b-8bit')).toBe(false)
    expect(isSettingsFieldInvalid('localQwenPrompt', '')).toBe(false)
    expect(isSettingsFieldInvalid('voiceShortcut', 'ctrl+shift+space')).toBe(false)
    expect(isSettingsFieldInvalid('voiceSoundsEnabled', 'maybe')).toBe(true)
    expect(isSettingsFieldInvalid('maxRecordingSeconds', '')).toBe(false)
  })
})
