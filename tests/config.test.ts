import { describe, expect, it } from 'vitest'
import { DEFAULT_EARS_SETTINGS, MAX_QWEN3_PROMPT_LENGTH, repairInvalidEarsSettings, validateEarsSettings } from '../src/config.js'
describe('Qwen/general settings validation', () => {
  it('accepts both model sizes and retained nondefault options', () => {
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, localQwenModel: '0.6b-8bit', localQwenIdleTtlMinutes: 17, localQwenPrompt: 'Context', voiceSoundsEnabled: false })).not.toThrow()
  })
  it.each([
    { localQwenModel: 'unknown' }, { localQwenIdleTtlMinutes: 0 }, { localQwenIdleTtlMinutes: 1441 },
    { localQwenPrompt: 'x'.repeat(MAX_QWEN3_PROMPT_LENGTH + 1) }, { maxRecordingSeconds: 601 }, { voiceShortcut: 'bad key' }, { voiceSoundsEnabled: 'yes' }
  ])('rejects and repairs invalid retained values', (patch) => {
    const settings = { ...DEFAULT_EARS_SETTINGS, ...patch } as typeof DEFAULT_EARS_SETTINGS
    expect(() => validateEarsSettings(settings)).toThrow()
    const repaired = repairInvalidEarsSettings(settings)
    expect(repaired.settings).toEqual(DEFAULT_EARS_SETTINGS)
    expect(repaired.repairedFields).toEqual(Object.keys(patch))
  })
})
