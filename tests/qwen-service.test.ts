import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { QwenService } from '../src/asr/service.js'
import { Qwen3RealtimeAsrSession } from '../src/asr/qwen3-runtime.js'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { createFakeSettingsForms, settingsDocument } from './helpers/settings-forms.js'
describe('Qwen Host settings owner', () => {
  it('works without an LLM and preserves all retained settings on one-field writes', async () => {
    const settings = { ...DEFAULT_EARS_SETTINGS, localQwenModel: '0.6b-8bit', localQwenPrompt: 'Context', localQwenIdleTtlMinutes: 17, voiceSoundsEnabled: false }
    const stored = { ...settingsDocument(settings), polishing: { enabled: true }, cloudAsr: { groq: { apiKey: 'synthetic' } } }
    const provider = createFakeSettingsForms({ stored })
    const context = new Context()
    context.provide('settings', provider as never)
    const service = new QwenService(context)
    expect(service.getSettings().settings).toEqual(settings)
    expect(provider.replace).not.toHaveBeenCalled()
    const result = await service.updateSettings({ localQwenPrompt: '' }, new AbortController().signal)
    expect(result.settings).toEqual({ ...settings, localQwenPrompt: '' })
    expect(provider.update).toHaveBeenCalledExactlyOnceWith('dsh-ears', { recognition: { localQwen: { prompt: '' } } }, 0)
    expect(provider.userSection()).toEqual({ recognition: { localQwen: { prompt: '' } } })
    expect(Object.keys(result)).not.toContain('defaultPolishRoute')
  })
  it('refuses an invalid field before writing and respects cancellation', async () => {
    const provider = createFakeSettingsForms()
    const context = new Context()
    context.provide('settings', provider as never)
    const service = new QwenService(context)
    await expect(service.updateSettings({ localQwenIdleTtlMinutes: 0 }, new AbortController().signal)).rejects.toThrow()
    const abort = new AbortController(); abort.abort()
    await expect(service.updateSettings({ localQwenPrompt: 'late' }, abort.signal)).rejects.toThrow()
    expect(provider.update).not.toHaveBeenCalled()
  })
})


describe('Qwen Host realtime registry', () => {
  afterEach(() => {
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function createService(): QwenService {
    const context = new Context()
    context.provide('settings', createFakeSettingsForms() as never)
    return new QwenService(context)
  }

  it('does not extend the 60-second idle deadline for invalid audio', async () => {
    vi.useFakeTimers()
    vi.spyOn(Qwen3RealtimeAsrSession.prototype, 'open').mockResolvedValue()
    const sendAudio = vi.spyOn(Qwen3RealtimeAsrSession.prototype, 'sendAudio').mockResolvedValue({ text: 'partial', final: false })
    const close = vi.spyOn(Qwen3RealtimeAsrSession.prototype, 'close').mockImplementation(() => undefined)
    const service = createService()
    const signal = new AbortController().signal
    const { sessionId } = await service.startRealtime(signal)

    // Establish a working registration at t=0; this successful send leaves the
    // same t=60,000 deadline as startup.
    await expect(service.sendRealtimeAudio(sessionId, 'AQ==', signal)).resolves.toEqual({ text: 'partial', final: false })
    vi.advanceTimersByTime(59_999)
    expect(close).not.toHaveBeenCalled()
    // Lookup precedes decoding: audioInvalid proves this session is still live
    // just before expiry, rather than missing or already closed.
    await expect(service.sendRealtimeAudio(sessionId, 'not-base64', signal)).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrAudioInvalid
    })
    expect(sendAudio).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(close).toHaveBeenCalledOnce()
    await expect(service.sendRealtimeAudio(sessionId, 'AQ==', signal)).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrUnexpected,
      message: 'Realtime session was not found'
    })
    expect(sendAudio).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('closes an opened session exactly once if startup aborts before registration', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const open = vi.spyOn(Qwen3RealtimeAsrSession.prototype, 'open').mockResolvedValue()
    const close = vi.spyOn(Qwen3RealtimeAsrSession.prototype, 'close').mockImplementation(() => undefined)
    const service = createService()

    // open() has returned an already resolved Promise, but startRealtime's
    // post-open continuation has not yet run or registered the session.
    const starting = service.startRealtime(controller.signal)
    expect(open).toHaveBeenCalledOnce()
    controller.abort()
    await expect(starting).rejects.toMatchObject({ name: 'AbortError' })
    expect(close).toHaveBeenCalledOnce()
    // Every registration schedules an idle timer; an aborted start owns none.
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes and unregisters a session after an audio send fails', async () => {
    vi.useFakeTimers()
    vi.spyOn(Qwen3RealtimeAsrSession.prototype, 'open').mockResolvedValue()
    const sendAudio = vi.spyOn(Qwen3RealtimeAsrSession.prototype, 'sendAudio').mockRejectedValueOnce(new Error('worker feed failed'))
    const close = vi.spyOn(Qwen3RealtimeAsrSession.prototype, 'close').mockImplementation(() => undefined)
    const service = createService()
    const signal = new AbortController().signal
    const { sessionId } = await service.startRealtime(signal)

    await expect(service.sendRealtimeAudio(sessionId, 'AQ==', signal)).rejects.toThrow('worker feed failed')
    expect(close).toHaveBeenCalledOnce()
    await expect(service.sendRealtimeAudio(sessionId, 'AQ==', signal)).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrUnexpected,
      message: 'Realtime session was not found'
    })
    expect(sendAudio).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(close).toHaveBeenCalledOnce()
  })
})
