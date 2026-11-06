import { describe, expect, it } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { classifyVoiceFailure, remoteFailureDetail } from '../src/client/voice-error.js'
describe('Qwen failure classification', () => {
  it('distinguishes empty speech, unavailable settings, and worker failure', () => {
    expect(classifyVoiceFailure('anything', EARS_ERROR_CODES.asrNoTranscript)).toBe('empty')
    expect(classifyVoiceFailure('anything', EARS_ERROR_CODES.settingsUnavailable)).toBe('config')
    expect(classifyVoiceFailure('worker failed', EARS_ERROR_CODES.asrUnexpected)).toBe('upstream')
  })
  it('retains useful worker detail', () => {
    expect(remoteFailureDetail({ code: 'HOST_FAILURE', message: 'Worker failed' })).toBe('Worker failed')
    expect(remoteFailureDetail({ code: 'worker.failure', message: 'Stopped' })).toBe('worker.failure: Stopped')
  })
})
