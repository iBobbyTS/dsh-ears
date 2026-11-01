import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { MicrophoneButton } from '../src/client/MicrophoneButton.js'
import { VoiceInputSession } from '../src/client/voice-session.js'

const hooks = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>,
  index: 0,
  initial: true,
  effects: [] as Array<() => void | (() => void)>
}))
const captureMock = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('react', () => ({
  useRef: (initial: unknown) => {
    const index = hooks.index++
    return hooks.refs[index] ??= { current: initial }
  },
  useEffect: (effect: () => void | (() => void)) => {
    if (hooks.initial) hooks.effects.push(effect)
  },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot()
}))
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Tooltip: () => null }))
vi.mock('../src/client/realtime-audio-capture.js', () => ({
  RealtimeAudioCaptureSession: { create: captureMock.create },
  isRealtimeAudioCaptureAvailable: () => true
}))
vi.mock('../src/client/sounds.js', () => ({
  playClick: vi.fn(), resumeSounds: vi.fn(), retainSounds: () => () => undefined
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Drain the finite startup/stop promise chains without wall-clock sleeps.
async function settle() {
  for (let index = 0; index < 30; index++) await Promise.resolve()
}

function fakeCapture() {
  let ready: Promise<void> | undefined
  return {
    start: vi.fn((_send: (chunk: string) => Promise<void>, gate?: Promise<void>) => {
      ready = gate
      void gate?.catch(() => undefined)
    }),
    stop: vi.fn(async () => { await ready }),
    abort: vi.fn(),
    createLevelMonitor: vi.fn(() => ({ stop: vi.fn() }))
  }
}

type Startup = { ok: true; value: { sessionId: string } }
function setup(backend: 'local-qwen3' | 'cloud-openai' = 'local-qwen3') {
  const startup = deferred<Startup>()
  const capture = fakeCapture()
  captureMock.create.mockResolvedValue(capture)
  const voiceSession = new VoiceInputSession()
  const settings = {
    ...DEFAULT_EARS_SETTINGS,
    asrBackend: backend,
    cloudAsrProvider: 'tencent',
    cloudAsrTencentService: 'realtime',
    maxRecordingSeconds: 2,
    voiceSoundsEnabled: false
  }
  const remote = {
    startRealtime: vi.fn((_signal: AbortSignal) => startup.promise),
    cancelRealtime: vi.fn(async () => ({ ok: true, value: { cancelled: true } })),
    finishRealtime: vi.fn(async () => ({ ok: true, value: { status: 'ok', text: 'speech' } })),
    sendRealtimeAudio: vi.fn(async () => ({ ok: true, value: { text: '', final: false } }))
  }
  let draft = ''
  let revision = 0
  const inputActions = {
    captureInsertion: () => ({ start: draft.length, end: draft.length, draftRev: revision }),
    insertText: vi.fn((text: string) => { draft = text; revision++; return true }),
    setDraft: vi.fn((text: string) => { draft = text })
  }
  const cleanups: Array<() => void> = []
  const props = {
    useInput: (select: (state: InputState) => unknown) => select({ draft } as InputState),
    inputActions,
    remote,
    useEarsSettings: (select: (value: typeof settings) => unknown) => select(settings),
    useEarsBackends: (select: (value: unknown) => unknown) => select({ status: 'ready', backends: [] }),
    useEarsWhisper: (select: (value: unknown) => unknown) => select({ status: 'loading' }),
    voiceSession
  } as unknown as Parameters<typeof MicrophoneButton>[0]
  const render = () => {
    hooks.index = 0
    const tree = MicrophoneButton(props)
    if (hooks.initial) {
      hooks.initial = false
      for (const effect of hooks.effects) {
        const cleanup = effect()
        if (cleanup) cleanups.push(cleanup)
      }
    }
    return tree.props.children as { props: { onClick: () => void } }
  }
  const unmount = () => {
    for (const cleanup of cleanups.splice(0)) cleanup()
    voiceSession.dispose()
  }
  return { startup, capture, remote, voiceSession, render, unmount, inputActions, draft: () => draft }
}

beforeEach(() => {
  vi.useFakeTimers()
  hooks.refs = []
  hooks.index = 0
  hooks.initial = true
  hooks.effects = []
  captureMock.create.mockReset()
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('microphone realtime startup lifecycle', () => {
  it('starts local capture and its timer while model startup is pending', async () => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    expect(app.remote.startRealtime).toHaveBeenCalledOnce()
    expect(app.capture.start).toHaveBeenCalledOnce()
    expect(app.capture.start.mock.calls[0]?.[1]).toBeInstanceOf(Promise)
    expect(app.voiceSession.getSnapshot().state).toBe('recording')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(app.capture.stop).toHaveBeenCalledOnce()
    expect(app.voiceSession.getSnapshot().state).toBe('transcribing')
    expect(app.remote.finishRealtime).not.toHaveBeenCalled()
    app.startup.resolve({ ok: true, value: { sessionId: 'local' } })
    await settle()
    expect(app.remote.finishRealtime).toHaveBeenCalledWith('local', expect.any(AbortSignal))
    expect(app.draft()).toBe('speech')
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    app.unmount()
  })

  it('stops during model startup and finishes only after readiness, once', async () => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    app.render().props.onClick()
    app.voiceSession.requestStop()
    expect(app.capture.stop).toHaveBeenCalledOnce()
    expect(app.voiceSession.getSnapshot().state).toBe('transcribing')
    expect(app.remote.finishRealtime).not.toHaveBeenCalled()
    app.startup.resolve({ ok: true, value: { sessionId: 'local' } })
    await settle()
    expect(app.remote.finishRealtime).toHaveBeenCalledOnce()
    expect(app.draft()).toBe('speech')
    app.unmount()
  })

  it('discards a stopped cold start and cleans a late session without writing', async () => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    app.render().props.onClick()
    app.voiceSession.requestCancel()
    expect(app.capture.abort).toHaveBeenCalledOnce()
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    const signal = app.remote.startRealtime.mock.calls[0]?.[0]
    expect(signal).toBeDefined()
    expect(signal?.aborted).toBe(true)
    app.startup.resolve({ ok: true, value: { sessionId: 'discarded' } })
    await settle()
    expect(app.remote.cancelRealtime).toHaveBeenCalledWith('discarded')
    expect(app.remote.finishRealtime).not.toHaveBeenCalled()
    expect(app.inputActions.insertText).not.toHaveBeenCalled()
    app.unmount()
  })

  it('keeps a newer recording intact when a discarded startup resolves late', async () => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    app.render().props.onClick()
    app.voiceSession.requestCancel()
    const newerStartup = deferred<Startup>()
    const newerCapture = fakeCapture()
    app.remote.startRealtime.mockReturnValueOnce(newerStartup.promise)
    captureMock.create.mockResolvedValueOnce(newerCapture)
    app.render().props.onClick()
    await settle()
    newerStartup.resolve({ ok: true, value: { sessionId: 'newer' } })
    await settle()
    app.startup.resolve({ ok: true, value: { sessionId: 'older' } })
    await settle()
    expect(app.remote.cancelRealtime).toHaveBeenCalledWith('older')
    expect(app.remote.cancelRealtime).not.toHaveBeenCalledWith('newer')
    expect(newerCapture.abort).not.toHaveBeenCalled()
    expect(app.voiceSession.getSnapshot().state).toBe('recording')
    app.render().props.onClick()
    await settle()
    expect(app.remote.finishRealtime).toHaveBeenCalledWith('newer', expect.any(AbortSignal))
    expect(app.draft()).toBe('speech')
    app.unmount()
  })

  it('unmounts during loading and cancels the late remote session', async () => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    app.unmount()
    expect(app.capture.abort).toHaveBeenCalledOnce()
    app.startup.resolve({ ok: true, value: { sessionId: 'unmounted' } })
    await settle()
    expect(app.remote.cancelRealtime).toHaveBeenCalledWith('unmounted')
    expect(app.remote.finishRealtime).not.toHaveBeenCalled()
    expect(app.inputActions.insertText).not.toHaveBeenCalled()
  })

  it('closes capture and clears the recording timer when startup fails', async () => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    app.startup.reject(new Error('Model unavailable'))
    await settle()
    expect(app.capture.abort).toHaveBeenCalledOnce()
    expect(app.voiceSession.getSnapshot().state).toBe('upstream-error')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(app.capture.stop).not.toHaveBeenCalled()
    expect(app.remote.finishRealtime).not.toHaveBeenCalled()
    app.unmount()
  })

  it('preserves cloud connect-before-capture and cancels pending microphone acquisition', async () => {
    const app = setup('cloud-openai')
    const acquisition = deferred<ReturnType<typeof fakeCapture>>()
    captureMock.create.mockReturnValue(acquisition.promise)
    app.render().props.onClick()
    await settle()
    expect(captureMock.create).not.toHaveBeenCalled()
    app.startup.resolve({ ok: true, value: { sessionId: 'cloud' } })
    await settle()
    expect(captureMock.create).toHaveBeenCalledOnce()
    app.render().props.onClick()
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    acquisition.resolve(app.capture)
    await settle()
    expect(app.capture.abort).toHaveBeenCalledOnce()
    expect(app.capture.start).not.toHaveBeenCalled()
    expect(app.remote.cancelRealtime).toHaveBeenCalledWith('cloud')
    app.unmount()
  })
})
