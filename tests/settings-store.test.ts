import { describe, expect, it } from 'vitest'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { applyFlatSettingsPatch, flatSettingsPatchToStoredPatch, flattenOverriddenSettings, flattenStoredSettings, normalizeStoredEarsSettings, unflattenEarsSettings } from '../src/settings-store.js'
describe('retained Qwen persistence', () => {
  const settings = { ...DEFAULT_EARS_SETTINGS, localQwenModel: '0.6b-8bit', localQwenIdleTtlMinutes: 17, localQwenPrompt: '  domain terms  ', voiceShortcutEnabled: false, voiceShortcut: 'ctrl+alt+space', voiceSoundsEnabled: false }
  it('reads the actual existing nested Qwen/general paths and ignores obsolete settings', () => {
    const raw = { ...unflattenEarsSettings(settings), cloudAsr: { groq: { apiKey: 'synthetic' } }, polishing: { enabled: true }, asrBackend: 'web-speech' }
    expect(flattenStoredSettings(raw)).toEqual(settings)
    expect(normalizeStoredEarsSettings(raw)).toEqual(unflattenEarsSettings(settings))
    expect(Object.keys(flattenStoredSettings(raw))).toEqual(Object.keys(DEFAULT_EARS_SETTINGS))
  })
  it('saves a single retained field without copying defaults or obsolete settings into the patch', () => {
    const patch = { localQwenPrompt: '', cloudAsrGroqApiKey: 'obsolete', polishingEnabled: true } as never
    expect(flatSettingsPatchToStoredPatch(patch)).toEqual({ recognition: { localQwen: { prompt: '' } } })
    expect(flattenStoredSettings(applyFlatSettingsPatch(unflattenEarsSettings(settings), patch))).toEqual({ ...settings, localQwenPrompt: '' })
    expect(flattenOverriddenSettings({ recognition: { localQwen: { prompt: '' }, backend: 'web-speech' }, polishing: { enabled: true } })).toEqual(['localQwenPrompt'])
  })
})
