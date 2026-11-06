import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InputState, TokenSpan } from '@deepseek-ai/dsh-client-ui-conversation/client'
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

// Minimal read-only composer surface used by the real submission adapter.
class ComposerElement {
  constructor(readonly owner: object) {}
  closest(selector: string) { return selector === '[data-composer-card]' ? this.owner : this }
  contains(target: unknown) { return target === this }
  disabled = false
  offsetParent: object | null = {}
  getAttribute() { return null }
}

function composerSurface(readDraft: () => string) {
  const listeners = new Map<string, EventListener>()
  const card = {
    isConnected: true,
    contains: (element: unknown) => element === editor,
    querySelector: () => editor,
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type)
  }
  const editor = new ComposerElement(card)
  Object.defineProperty(editor, 'textContent', { get: readDraft })
  const microphone = new ComposerElement(card)
  const send = new ComposerElement(card)
  return { microphone, gesture: (type: 'click' | 'keydown') => listeners.get(type)?.({
    type, target: type === 'keydown' ? editor : send, key: 'Enter'
  } as unknown as Event) }
}

function windowKey(values: Record<string, unknown> = {}) {
  const event = {
    key: 'Escape', code: 'Escape', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
    isComposing: false, repeat: false, keyCode: 27,
    preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), stopPropagation: vi.fn(),
    ...values
  }
  const agentInterrupt = vi.fn()
  const registered = vi.mocked(window.addEventListener).mock.calls
  for (const [type, listener, capture] of registered) {
    if (type !== 'keydown' || capture !== true) continue
    ;(listener as (event: KeyboardEvent) => void)(event as unknown as KeyboardEvent)
    if (event.stopImmediatePropagation.mock.calls.length > 0) break
  }
  // Match the host's fixed-input observer, which runs at window bubble.
  if (event.stopImmediatePropagation.mock.calls.length === 0 && event.stopPropagation.mock.calls.length === 0) agentInterrupt()
  return { event, agentInterrupt }
}

function windowComposition(type: 'compositionstart' | 'compositionend') {
  const call = vi.mocked(window.addEventListener).mock.calls.find(([name]) => name === type)
  ;(call?.[1] as (() => void) | undefined)?.()
}

type Startup = { ok: true; value: { sessionId: string } }
function setup(initialDraft = '') {
  const startup = deferred<Startup>()
  const capture = fakeCapture()
  captureMock.create.mockResolvedValue(capture)
  const voiceSession = new VoiceInputSession()
  const settings = {
    ...DEFAULT_EARS_SETTINGS,
    maxRecordingSeconds: 2,
    voiceSoundsEnabled: false
  }
  const remote = {
    startRealtime: vi.fn((_signal: AbortSignal) => startup.promise),
    cancelRealtime: vi.fn(async () => ({ ok: true, value: { cancelled: true } })),
    finishRealtime: vi.fn(async (_sessionId: string, _signal?: AbortSignal) => ({ ok: true, value: { status: 'ok', text: 'speech' } })),
    sendRealtimeAudio: vi.fn(async (_sessionId: string, _audio: string, _signal?: AbortSignal) => ({ ok: true, value: { text: '', final: false } })),
  }
  let draft = initialDraft
  let revision = 0
  const inputActions = {
    captureInsertion: () => ({ start: draft.length, end: draft.length, draftRev: revision }),
    insertText: vi.fn((text: string, span: TokenSpan) => {
      if (span.draftRev !== revision) return false
      draft = draft.slice(0, span.start) + text + draft.slice(span.end)
      revision++
      return true
    }),
    setDraft: vi.fn((text: string) => { draft = text; revision++ })
  }
  const composer = composerSurface(() => draft)
  const cleanups: Array<() => void> = []
  const props = {
    useInput: (select: (state: InputState) => unknown) => select({ draft } as InputState),
    inputActions,
    remote,
    useEarsSettings: (select: (value: typeof settings) => unknown) => select(settings),
    voiceSession
  } as unknown as Parameters<typeof MicrophoneButton>[0]
  const render = () => {
    hooks.index = 0
    const tree = MicrophoneButton(props)
    if (hooks.initial) {
      const button = tree.props.children as { ref: { current: unknown } }
      button.ref.current = composer.microphone
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
  return { startup, capture, remote, voiceSession, render, unmount, inputActions, composer, settings, draft: () => draft }
}

beforeEach(() => {
  vi.useFakeTimers()
  hooks.refs = []
  hooks.index = 0
  hooks.initial = true
  hooks.effects = []
  captureMock.create.mockReset()
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('Element', ComposerElement)
  vi.stubGlobal('document', { visibilityState: 'visible' })
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('voice Escape priority', () => {
  it.each(['starting', 'recording', 'transcribing'] as const)('ends %s before the agent interrupt observer', async (state) => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    app.voiceSession.setState(state)
    const { event, agentInterrupt } = windowKey()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce()
    expect(agentInterrupt).not.toHaveBeenCalled()
    expect(app.capture.abort).toHaveBeenCalledOnce()
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    app.startup.resolve({ ok: true, value: { sessionId: 'escaped-loading' } })
    await settle()
    expect(app.remote.cancelRealtime).toHaveBeenCalledWith('escaped-loading')
    expect(app.remote.finishRealtime).not.toHaveBeenCalled()
    expect(app.draft()).toBe('')
    app.unmount()
  })

  it('preserves the visible transcript and passes the next Escape to the host', async () => {
    const app = setup()
    app.render().props.onClick()
    app.startup.resolve({ ok: true, value: { sessionId: 'escaped-stream' } })
    await settle()
    app.remote.sendRealtimeAudio.mockResolvedValue({ ok: true, value: { text: 'keep this draft', final: false } })
    const send = app.capture.start.mock.calls[0]![0]
    await send('audio')
    const first = windowKey()
    expect(first.agentInterrupt).not.toHaveBeenCalled()
    expect(app.draft()).toBe('keep this draft')
    expect(app.inputActions.insertText).toHaveBeenCalledOnce()
    await send('late audio')
    expect(app.inputActions.insertText).toHaveBeenCalledOnce()
    const next = windowKey()
    expect(next.event.preventDefault).not.toHaveBeenCalled()
    expect(next.agentInterrupt).toHaveBeenCalledOnce()
    expect(app.remote.finishRealtime).not.toHaveBeenCalled()
    app.unmount()
  })

  it('works independently of the configurable voice shortcut switch', async () => {
    const app = setup()
    app.settings.voiceShortcutEnabled = false
    app.render().props.onClick()
    await settle()
    expect(windowKey().agentInterrupt).not.toHaveBeenCalled()
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    app.unmount()
  })

  it.each([{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }])('does not intercept a non-plain Escape %j', async (values) => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    const { event } = windowKey(values)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled()
    expect(app.voiceSession.getSnapshot().state).toBe('recording')
    app.unmount()
  })

  it('tracks composition when the browser does not set isComposing on Escape', async () => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    windowComposition('compositionstart')
    expect(windowKey().event.preventDefault).not.toHaveBeenCalled()
    windowComposition('compositionend')
    expect(windowKey().event.preventDefault).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(11)
    expect(windowKey().event.preventDefault).toHaveBeenCalledOnce()
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    app.unmount()
  })

  it('resets an unfinished composition when the window loses focus', async () => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    windowComposition('compositionstart')
    const blur = vi.mocked(window.addEventListener).mock.calls.find(([name]) => name === 'blur')
    ;(blur?.[1] as (() => void) | undefined)?.()
    expect(windowKey().event.preventDefault).toHaveBeenCalledOnce()
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    app.unmount()
    expect(window.removeEventListener).toHaveBeenCalledWith('blur', blur?.[1])
  })

  it.each(['hidden', 'offscreen', 'idle'] as const)('leaves %s voice views out of Escape arbitration', async (view) => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    if (view === 'hidden') vi.stubGlobal('document', { visibilityState: 'hidden' })
    if (view === 'offscreen') app.composer.microphone.offsetParent = null
    if (view === 'idle') app.voiceSession.setState('idle')
    expect(windowKey().event.preventDefault).not.toHaveBeenCalled()
    expect(app.capture.abort).not.toHaveBeenCalled()
    app.unmount()
  })

  it('releases key and composition capture listeners on unmount', () => {
    const app = setup()
    app.render()
    app.unmount()
    for (const name of ['keydown', 'compositionstart', 'compositionend']) {
      const registration = vi.mocked(window.addEventListener).mock.calls.find(([type]) => type === name)
      expect(registration?.[2]).toBe(true)
      expect(window.removeEventListener).toHaveBeenCalledWith(name, registration?.[1], true)
    }
  })
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

  it.each(['click', 'keydown'] as const)('ends voice through the actual %s submission observer after the host sends', async (gesture) => {
    const app = setup()
    app.render().props.onClick()
    app.startup.resolve({ ok: true, value: { sessionId: 'submitted' } })
    await settle()
    app.remote.sendRealtimeAudio.mockResolvedValue({ ok: true, value: { text: 'spoken message', final: false } })
    await app.capture.start.mock.calls[0]![0]('audio')
    expect(app.draft()).toBe('spoken message')
    app.composer.gesture(gesture)
    const sent = app.draft() // The host owns message capture and delivery.
    app.inputActions.setDraft('')
    await settle()
    expect(sent).toBe('spoken message')
    expect(app.draft()).toBe('')
    expect(app.capture.abort).toHaveBeenCalledOnce()
    expect(app.remote.cancelRealtime).toHaveBeenCalledWith('submitted')
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    expect(app.remote.finishRealtime).not.toHaveBeenCalled()
    app.unmount()
  })

  it('ends capture on send during cold start and cancels the late remote session', async () => {
    const app = setup()
    app.render().props.onClick()
    await settle()
    app.voiceSession.requestEnd()
    expect(app.capture.abort).toHaveBeenCalledOnce()
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    expect(app.remote.startRealtime.mock.calls[0]?.[0].aborted).toBe(true)
    app.startup.resolve({ ok: true, value: { sessionId: 'sent-during-load' } })
    await settle()
    expect(app.remote.cancelRealtime).toHaveBeenCalledWith('sent-during-load')
    expect(app.remote.finishRealtime).not.toHaveBeenCalled()
    expect(app.inputActions.insertText).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(app.capture.stop).not.toHaveBeenCalled()
    app.unmount()
  })

  it('preserves current Qwen text on send and ignores late streaming results', async () => {
    const app = setup()
    app.render().props.onClick()
    app.startup.resolve({ ok: true, value: { sessionId: 'sent-stream' } })
    await settle()
    const send = app.capture.start.mock.calls[0]![0]
    app.remote.sendRealtimeAudio.mockResolvedValue({ ok: true, value: { text: 'current speech', final: false } })
    await send('first')
    expect(app.draft()).toBe('current speech')
    const late = deferred<{ ok: true; value: { text: string; final: boolean } }>()
    app.remote.sendRealtimeAudio.mockReturnValueOnce(late.promise)
    const pending = send('last')
    app.voiceSession.requestEnd()
    expect(app.draft()).toBe('current speech')
    expect(app.inputActions.insertText).toHaveBeenCalledOnce()
    app.inputActions.setDraft('') // The host consumes the sent document.
    late.resolve({ ok: true, value: { text: 'late speech', final: true } })
    await pending
    expect(app.draft()).toBe('')
    expect(app.inputActions.insertText).toHaveBeenCalledOnce()
    expect(app.capture.abort).toHaveBeenCalledOnce()
    expect(app.remote.cancelRealtime).toHaveBeenCalledWith('sent-stream')
    expect(app.remote.finishRealtime).not.toHaveBeenCalled()
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    app.unmount()
  })

  it('ignores a final result arriving after sending while stopped recognition is pending', async () => {
    const app = setup()
    const finish = deferred<{ ok: true; value: { status: 'ok'; text: string } }>()
    app.remote.finishRealtime.mockReturnValueOnce(finish.promise)
    app.render().props.onClick()
    app.startup.resolve({ ok: true, value: { sessionId: 'finishing' } })
    await settle()
    app.render().props.onClick()
    await settle()
    expect(app.remote.finishRealtime).toHaveBeenCalledOnce()
    app.voiceSession.requestEnd()
    finish.resolve({ ok: true, value: { status: 'ok', text: 'late final' } })
    await settle()
    expect(app.draft()).toBe('')
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
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

})


describe('Qwen recording text ownership', () => {
  async function streaming(app: ReturnType<typeof setup>, text = 'accepted partial') {
    app.render().props.onClick()
    app.startup.resolve({ ok: true, value: { sessionId: 'first' } })
    await settle()
    app.remote.sendRealtimeAudio.mockResolvedValue({ ok: true, value: { text, final: false } })
    const send = app.capture.start.mock.calls[0]![0]
    await send('first audio')
    return send
  }

  it.each(['finish rejection', 'finish error envelope', 'capture stop failure'] as const)('preserves accepted partial text after %s', async (failure) => {
    const app = setup('unrelated: ')
    await streaming(app)
    if (failure === 'finish rejection') app.remote.finishRealtime.mockRejectedValueOnce(new Error('finish failed'))
    else if (failure === 'finish error envelope') app.remote.finishRealtime.mockResolvedValueOnce({ ok: true, value: { status: 'error', code: 'asr.unexpected', message: 'finish failed' } } as never)
    else app.capture.stop.mockRejectedValueOnce(new Error('capture delivery failed'))
    app.render().props.onClick()
    await settle()
    expect(app.draft()).toBe('unrelated: accepted partial')
    expect(app.voiceSession.getSnapshot().state).toBe('upstream-error')
    expect(app.remote.cancelRealtime).toHaveBeenCalledWith('first')
    expect(app.inputActions.setDraft).not.toHaveBeenCalled()
    app.unmount()
    expect(app.draft()).toBe('unrelated: accepted partial')
  })

  it('isolates a late old packet from a new recording after a capture failure', async () => {
    const app = setup()
    const send = await streaming(app, 'old partial')
    const oldReply = deferred<{ ok: true; value: { text: string; final: boolean } }>()
    app.remote.sendRealtimeAudio.mockReturnValueOnce(oldReply.promise)
    const pending = send('old pending')
    const oldSignal = app.remote.sendRealtimeAudio.mock.calls.at(-1)?.[2]
    app.capture.stop.mockRejectedValueOnce(new Error('delivery timed out'))
    app.render().props.onClick()
    await settle()
    expect(oldSignal).toBeInstanceOf(AbortSignal)
    expect(oldSignal?.aborted).toBe(true)
    expect(app.draft()).toBe('old partial')
    const newer = fakeCapture()
    captureMock.create.mockResolvedValueOnce(newer)
    app.remote.startRealtime.mockResolvedValueOnce({ ok: true, value: { sessionId: 'second' } })
    app.render().props.onClick()
    await settle()
    app.remote.sendRealtimeAudio.mockResolvedValueOnce({ ok: true, value: { text: 'new words', final: false } })
    await newer.start.mock.calls[0]![0]('new packet')
    oldReply.resolve({ ok: true, value: { text: 'stale overwrite', final: false } })
    await pending
    expect(app.draft()).toBe('old partialnew words')
    expect(app.voiceSession.getSnapshot().state).toBe('recording')
    expect(newer.abort).not.toHaveBeenCalled()
    app.render().props.onClick()
    await settle()
    expect(app.remote.finishRealtime).toHaveBeenCalledWith('second', expect.any(AbortSignal))
    expect(app.draft()).toBe('old partialspeech')
    app.unmount()
  })

  it('preserves accepted words on unmount and ignores a pending packet', async () => {
    const app = setup('before ')
    const send = await streaming(app)
    const reply = deferred<{ ok: true; value: { text: string; final: boolean } }>()
    app.remote.sendRealtimeAudio.mockReturnValueOnce(reply.promise)
    const pending = send('pending')
    app.unmount()
    expect(app.draft()).toBe('before accepted partial')
    reply.resolve({ ok: true, value: { text: 'late', final: true } })
    await pending
    expect(app.draft()).toBe('before accepted partial')
    expect(app.capture.abort).toHaveBeenCalledOnce()
    expect(app.remote.cancelRealtime).toHaveBeenCalledWith('first')
  })

  it('discards only its unedited span and ignores a pending final result', async () => {
    const app = setup('before ')
    await streaming(app)
    const finish = deferred<{ ok: true; value: { status: 'ok'; text: string } }>()
    app.remote.finishRealtime.mockReturnValueOnce(finish.promise)
    app.render().props.onClick()
    await settle()
    app.voiceSession.requestCancel()
    expect(app.draft()).toBe('before ')
    finish.resolve({ ok: true, value: { status: 'ok', text: 'late final' } })
    await settle()
    expect(app.draft()).toBe('before ')
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    app.unmount()
  })

  it('keeps a manual edit through discard, a late final, and unmount', async () => {
    const app = setup('before ')
    await streaming(app)
    app.inputActions.setDraft('before accepted partial manual edit')
    const finish = deferred<{ ok: true; value: { status: 'ok'; text: string } }>()
    app.remote.finishRealtime.mockReturnValueOnce(finish.promise)
    app.render().props.onClick()
    await settle()
    app.voiceSession.requestCancel()
    finish.resolve({ ok: true, value: { status: 'ok', text: 'late final' } })
    await settle()
    app.unmount()
    expect(app.draft()).toBe('before accepted partial manual edit')
  })

  it('finalizes just the owned span and retains it after unmount', async () => {
    const app = setup('before ')
    await streaming(app)
    app.render().props.onClick()
    await settle()
    expect(app.draft()).toBe('before speech')
    expect(app.voiceSession.getSnapshot().state).toBe('idle')
    expect(app.inputActions.setDraft).not.toHaveBeenCalled()
    app.unmount()
    expect(app.draft()).toBe('before speech')
  })
  it.each(['late success', 'late rejection'] as const)('keeps the new recording and its timer after submit followed by an old final %s', async (outcome) => {
    const app = setup('before ')
    await streaming(app)
    const oldFinish = deferred<{ ok: true; value: { status: 'ok'; text: string } }>()
    app.remote.finishRealtime.mockReturnValueOnce(oldFinish.promise)
    app.render().props.onClick()
    await settle()
    expect(app.voiceSession.getSnapshot().state).toBe('transcribing')
    app.composer.gesture('click')
    app.inputActions.setDraft('') // The Host consumes its submitted document.
    await settle()
    const oldSignal = app.remote.finishRealtime.mock.calls[0]?.[1]
    expect(oldSignal?.aborted).toBe(true)
    app.inputActions.setDraft('next: ')
    const newer = fakeCapture()
    captureMock.create.mockResolvedValueOnce(newer)
    app.remote.startRealtime.mockResolvedValueOnce({ ok: true, value: { sessionId: 'newer' } })
    app.render().props.onClick()
    await settle()
    app.remote.sendRealtimeAudio.mockResolvedValueOnce({ ok: true, value: { text: 'new words', final: false } })
    await newer.start.mock.calls[0]![0]('new packet')
    if (outcome === 'late success') oldFinish.resolve({ ok: true, value: { status: 'ok', text: 'old final' } })
    else oldFinish.reject(new Error('old finish failed'))
    await settle()
    expect(app.draft()).toBe('next: new words')
    expect(app.voiceSession.getSnapshot().state).toBe('recording')
    expect(newer.abort).not.toHaveBeenCalled()
    expect(app.remote.cancelRealtime).not.toHaveBeenCalledWith('newer')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(newer.stop).toHaveBeenCalledOnce()
    expect(app.remote.finishRealtime).toHaveBeenCalledWith('newer', expect.any(AbortSignal))
    expect(app.draft()).toBe('next: speech')
    app.unmount()
  })

  it('preserves a manual edit before late streaming and final results', async () => {
    const app = setup('before ')
    const send = await streaming(app)
    const reply = deferred<{ ok: true; value: { text: string; final: boolean } }>()
    app.remote.sendRealtimeAudio.mockReturnValueOnce(reply.promise)
    const pending = send('pending')
    app.inputActions.setDraft('before accepted partial, typed')
    reply.resolve({ ok: true, value: { text: 'revised old words', final: false } })
    await pending
    app.render().props.onClick()
    await settle()
    expect(app.draft()).toBe('before accepted partial, typed')
    expect(app.voiceSession.getSnapshot().state).toBe('upstream-error')
    app.unmount()
    expect(app.draft()).toBe('before accepted partial, typed')
  })

  it('freezes the span and aborts audio work immediately on a live send error', async () => {
    const app = setup('before ')
    const send = await streaming(app)
    app.remote.sendRealtimeAudio.mockRejectedValueOnce(new Error('feed failed'))
    await expect(send('bad packet')).rejects.toThrow('feed failed')
    expect(app.draft()).toBe('before accepted partial')
    expect(app.voiceSession.getSnapshot().state).toBe('upstream-error')
    expect(app.capture.abort).toHaveBeenCalledOnce()
    expect(app.remote.sendRealtimeAudio.mock.calls.at(-1)?.[2]?.aborted).toBe(true)
    await send('packet after failure')
    expect(app.remote.sendRealtimeAudio).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(app.capture.stop).not.toHaveBeenCalled()
    app.unmount()
  })

})
