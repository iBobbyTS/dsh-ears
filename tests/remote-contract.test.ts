import { describe, expect, it } from 'vitest'
import { earsSettingsPatchSchema, earsSettingsViewSchema, remoteTextResultSchema } from '../src/remote-contract.js'
import { DEFAULT_EARS_SETTINGS, MAX_QWEN3_PROMPT_LENGTH } from '../src/config.js'
import { TYPERT } from '../src/typert.js'
import { TYPERT_REMOTE } from '../src/remote.js'
import { EARS_REMOTE_DESCRIPTORS } from '../src/remote-definitions.js'
describe('Qwen-only Remote contract', () => {
  it('accepts retained fields and rejects every removed feature patch', () => {
    expect(earsSettingsPatchSchema.parse({ localQwenModel: '0.6b-8bit', localQwenPrompt: '' })).toEqual({ localQwenModel: '0.6b-8bit', localQwenPrompt: '' })
    for (const field of ['asrBackend', 'webSpeechLanguage', 'localWhisperModel', 'cloudAsrProvider', 'cloudAsrGroqApiKey', 'polishingEnabled', 'polishPrompt']) expect(() => earsSettingsPatchSchema.parse({ [field]: 'obsolete' }), field).toThrow()
    expect(() => earsSettingsPatchSchema.parse({ localQwenPrompt: 'x'.repeat(MAX_QWEN3_PROMPT_LENGTH + 1) })).toThrow()
    expect(() => earsSettingsPatchSchema.parse({ localQwenIdleTtlMinutes: 0 })).toThrow()
  })
  it('projects only retained settings and metadata', () => {
    const parsed = earsSettingsViewSchema.parse({ available: true, writable: true, settings: { ...DEFAULT_EARS_SETTINGS, cloudAsrGroqApiKey: 'obsolete', polishPrompt: 'obsolete' }, overridden: [], defaultPolishRoute: {} })
    expect(parsed).toEqual({ available: true, writable: true, settings: DEFAULT_EARS_SETTINGS, overridden: [] })
  })
  it('shares exactly the retained descriptor table with strict codec factories', () => {
    expect(TYPERT.invocations).toBe(EARS_REMOTE_DESCRIPTORS)
    expect(TYPERT_REMOTE.descriptors).toBe(EARS_REMOTE_DESCRIPTORS)
    expect(EARS_REMOTE_DESCRIPTORS.map(({ method }) => method).sort()).toEqual(['getAbout', 'getSettings', 'updateSettings', 'getQwenModelState', 'downloadQwenModel', 'cancelQwenModelDownload', 'deleteQwenModel', 'startQwenService', 'unloadQwenService', 'startRealtime', 'sendRealtimeAudio', 'finishRealtime', 'cancelRealtime'].sort())
    const codecs = EARS_REMOTE_DESCRIPTORS.flatMap((descriptor) => [...descriptor.parameters.map(({ codec }) => codec), descriptor.result])
    expect(codecs).toHaveLength(24)
    for (const codec of codecs) {
      expect(codec.mode).toBe('strict')
      expect(typeof codec.create().parse).toBe('function')
      expect(() => codec.create().parse(19999)).toThrow()
    }
    expect(EARS_REMOTE_DESCRIPTORS.every(({ service }) => service === 'dshEarsQwen')).toBe(true)
    expect(EARS_REMOTE_DESCRIPTORS.filter((item) => 'cancellation' in item).map(({ method }) => method).sort()).toEqual(['updateSettings', 'startRealtime', 'sendRealtimeAudio', 'finishRealtime'].sort())
  })
  it('retains structured failures without explicit undefined fields', () => {
    expect(remoteTextResultSchema.parse({ status: 'error', code: 'asr.unexpected', message: 'failed', params: { detail: 'worker failed' } })).toMatchObject({ params: { detail: 'worker failed' } })
  })
})
