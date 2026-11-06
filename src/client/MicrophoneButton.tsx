import { useEffect, useRef } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { InputActions, InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { effectiveRecordingSeconds } from '../config.js'
import { isEarsErrorCode } from '../errors.js'
import type { EarsSettings } from '../config.js'
import { AudioLevelMonitor } from '../asr/audio-level.js'
import { RealtimeAudioCaptureSession, isRealtimeAudioCaptureAvailable } from './realtime-audio-capture.js'
import type { EarsRemote } from '../remote.js'
import styles from './MicrophoneButton.module.css'
import { classifyVoiceFailure, failureMessage, remoteFailureDetail, remoteFailureParams } from './voice-error.js'
import { VoiceDraftWriter } from './voice-draft-writer.js'
import { observeComposerSubmission } from './composer-submit.js'
import { matchesShortcut } from '../shortcut.js'
import { fallbackTranslate, localizedErrorText, type Translate } from './settings-locale.js'
import { playClick, resumeSounds, retainSounds } from './sounds.js'
import { createVoiceStateSetter, useVoiceInputSession, type VoiceInputSession } from './voice-session.js'

type RecordingWork = {
  readonly controller: AbortController
  readonly writer: VoiceDraftWriter
  readonly epoch: number
  capture: RealtimeAudioCaptureSession | null
  ready: Promise<string> | null
  sessionId: string | null
  levelMonitor: AudioLevelMonitor | null
  timer: ReturnType<typeof setTimeout> | null
  stopping: Promise<void> | null
}

type VoiceInputButtonProps = {
  readonly useInput: SnapshotSelectorHook<InputState>
  readonly inputActions: InputActions
  readonly remote: EarsRemote
  readonly useEarsSettings: SnapshotSelectorHook<EarsSettings>
  readonly voiceSession: VoiceInputSession
  readonly t?: Translate
  readonly earsT?: Translate
}

export function MicrophoneButton({ useInput, inputActions, remote, useEarsSettings, voiceSession, t: slotT, earsT }: VoiceInputButtonProps) {
  const t = slotT ?? earsT ?? fallbackTranslate
  const voiceSnapshot = useVoiceInputSession(voiceSession)
  const state = voiceSnapshot.state
  const setState = createVoiceStateSetter(voiceSession)
  const recordingRef = useRef<RecordingWork | null>(null)
  const stopRecordingRef = useRef<(() => void | Promise<void>) | null>(null)
  const inputPhase = useInput((value) => value.phase)
  const actionsRef = useRef(inputActions)
  const settings = useEarsSettings((value) => value)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const mountedRef = useRef(true)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const toggleRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    actionsRef.current = inputActions
  }, [inputActions])

  useEffect(() => {
    // The hotkey runs on window CAPTURE so it outranks text input: editor
    // keydown handlers (which bubble and may stopPropagation/preventDefault)
    // never see a matched combination, so pressing the shortcut inside the
    // composer cannot be swallowed by the input layer. Escape independently
    // ends active voice work before Agent interruption; other keys are left
    // untouched when the configurable chord does not match or is disabled.
    let composing = false
    let compositionEndsAt = 0
    const onCompositionStart = () => { composing = true }
    const onCompositionEnd = () => {
      composing = false
      // Some browsers end composition before dispatching its confirming key.
      compositionEndsAt = Date.now() + 10
    }
    const onBlur = () => {
      composing = false
      compositionEndsAt = 0
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || composing || Date.now() < compositionEndsAt || event.repeat) return
      const element = buttonRef.current
      if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
        const voiceState = voiceSession.getSnapshot().state
        const hasVoiceTask = voiceState === 'starting' || voiceState === 'recording' || voiceState === 'transcribing'
        if (hasVoiceTask && document.visibilityState === 'visible' && element !== null && element.offsetParent !== null) {
          event.preventDefault()
          // Agent interruption observes window BUBBLE. Consume this occurrence
          // in capture, including other listeners on the same window target.
          event.stopImmediatePropagation()
          voiceSession.requestEnd()
          return
        }
      }
      const current = settingsRef.current
      if (current.voiceShortcutEnabled === false) return
      if (!matchesShortcut(current.voiceShortcut, event)) return
      const target = event.target
      if (target instanceof Element && target.closest('[role="dialog"]') !== null) return
      if (document.visibilityState !== 'visible') return
      if (element === null || element.offsetParent === null) return
      event.preventDefault()
      event.stopPropagation()
      toggleRef.current?.()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('compositionstart', onCompositionStart, true)
    window.addEventListener('compositionend', onCompositionEnd, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('compositionstart', onCompositionStart, true)
      window.removeEventListener('compositionend', onCompositionEnd, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [voiceSession])

  useEffect(() => {
    stopRecordingRef.current = null
    const stop = voiceSession.onStopRequested(() => { void stopRecordingRef.current?.() })
    const cancel = voiceSession.onCancelRequested((preserveDraft) => {
      const work = recordingRef.current
      if (work !== null) retireRecording(work, !preserveDraft)
    })
    return () => { stop(); cancel() }
  }, [voiceSession])

  useEffect(() => {
    const button = buttonRef.current
    if (button === null) return
    return observeComposerSubmission(button, inputActions, () => voiceSession.requestEnd())
  }, [inputActions, voiceSession])

  useEffect(() => {
    // Slash commands lock the input before consuming its document.
    if (['adjudicating', 'submitting', 'sending'].includes(inputPhase)) voiceSession.requestEnd()
  }, [inputPhase, voiceSession])

  useEffect(() => {
    mountedRef.current = true
    const releaseSounds = retainSounds()
    return () => {
      mountedRef.current = false
      stopRecordingRef.current = null
      const work = recordingRef.current
      if (work !== null) {
        const ownsEpoch = voiceSession.isCurrentEpoch(work.epoch)
        retireRecording(work)
        if (ownsEpoch) voiceSession.setState('idle')
      }
      releaseSounds()
    }
  }, [voiceSession])

  function isCurrentRecording(work: RecordingWork): boolean {
    return mountedRef.current && recordingRef.current === work && !work.controller.signal.aborted && voiceSession.isCurrentEpoch(work.epoch)
  }

  function cancelRemoteSession(sessionId: string): void {
    // Cleanup is best effort; the Host also bounds idle session lifetime.
    void remote.cancelRealtime(sessionId).catch(() => undefined)
  }

  function retireRecording(work: RecordingWork, discard = false): void {
    if (work.controller.signal.aborted) return
    if (discard) work.writer.cancel()
    else work.writer.freeze()
    work.controller.abort()
    voiceSession.invalidateRecording(work.epoch)
    if (recordingRef.current === work) recordingRef.current = null
    if (work.timer !== null) clearTimeout(work.timer)
    work.timer = null
    work.levelMonitor?.stop()
    work.levelMonitor = null
    work.capture?.abort()
    work.capture = null
    const sessionId = work.sessionId
    work.sessionId = null
    if (sessionId !== null) cancelRemoteSession(sessionId)
  }

  function failRecording(work: RecordingWork, error: unknown): void {
    if (!isCurrentRecording(work)) return
    retireRecording(work)
    applyVoiceFailure(voiceSession, error)
  }

  const active = state === 'starting' || state === 'recording'
  const busy = state === 'transcribing'
  if (!active && !busy && !isRealtimeAudioCaptureAvailable()) {
    return <Tooltip label={t('voiceUnavailableRecorder')} side="top" delayMs={200} portal>
      <button ref={buttonRef} type="button" aria-label={t('voiceUnavailable')} aria-disabled="true" className={styles.button}><MicrophoneIcon /></button>
    </Tooltip>
  }

  const stopRecording = (work = recordingRef.current): Promise<void> => {
    if (work === null || !isCurrentRecording(work)) return Promise.resolve()
    if (work.stopping !== null) return work.stopping
    if (work.timer !== null) clearTimeout(work.timer)
    work.timer = null
    playToggleClick(settingsRef.current, 0.4)
    const capture = work.capture
    if (capture === null) {
      retireRecording(work)
      setState('idle')
      return Promise.resolve()
    }
    work.levelMonitor?.stop()
    work.levelMonitor = null
    setState('transcribing')
    work.stopping = (async () => {
      try {
        await capture.stop()
        if (!isCurrentRecording(work)) return
        const sessionId = await work.ready!
        if (!isCurrentRecording(work)) return
        const result = await remote.finishRealtime(sessionId, work.controller.signal)
        if (!isCurrentRecording(work)) return
        if (!result.ok) throw result.error
        if (result.value.status === 'error') throw result.value
        if (!work.writer.finalize(result.value.text.trim())) throw new Error(t('qwenDraftChanged'))
        retireRecording(work)
        setState('idle')
      } catch (error) {
        failRecording(work, error)
      }
    })()
    return work.stopping
  }

  const startRealtimeRecording = async () => {
    if (recordingRef.current !== null) return
    const work: RecordingWork = {
      controller: new AbortController(),
      writer: new VoiceDraftWriter(actionsRef.current),
      epoch: voiceSession.beginRecording(),
      capture: null, ready: null, sessionId: null, levelMonitor: null, timer: null, stopping: null
    }
    recordingRef.current = work
    setState('starting')
    const openRemote = async () => {
      const started = await remote.startRealtime(work.controller.signal)
      if (!started.ok) throw started.error
      const id = started.value.sessionId
      if (!isCurrentRecording(work)) {
        cancelRemoteSession(id)
        throw new DOMException('Recording startup cancelled', 'AbortError')
      }
      work.sessionId = id
      return id
    }
    try {
      // Capture immediately while the local model starts.
      const capture = await RealtimeAudioCaptureSession.create()
      if (!isCurrentRecording(work)) { capture.abort(); return }
      work.capture = capture
      work.ready = openRemote()
      capture.start(async (audioBase64) => {
        if (!isCurrentRecording(work)) return
        try {
          const result = await remote.sendRealtimeAudio(work.sessionId!, audioBase64, work.controller.signal)
          if (!isCurrentRecording(work)) return
          if (!result.ok) throw result.error
          // Full hypotheses may shorten through native Prefix Rollback.
          work.writer.update(result.value.text.trim())
        } catch (error) {
          if (!isCurrentRecording(work)) return
          failRecording(work, error)
          throw error // The capture queue records its failed delivery too.
        }
      }, work.ready.then(() => undefined))
      setState('recording')
      work.timer = setTimeout(() => { void stopRecording(work) }, Math.max(1, effectiveRecordingSeconds(settingsRef.current)) * 1000)
      try {
        work.levelMonitor = capture.createLevelMonitor((level) => {
          if (isCurrentRecording(work)) voiceSession.pushAudioLevel(level)
        })
      } catch {
        // Recognition remains usable without the optional waveform analyser.
      }
      await work.ready
    } catch (error) {
      failRecording(work, error)
    }
  }

  stopRecordingRef.current = () => stopRecording()
  const prewarmMicrophone = () => {
    if (settingsRef.current.voiceSoundsEnabled !== false) resumeSounds()
  }

  const toggle = () => {
    if (settingsRef.current.voiceSoundsEnabled !== false) resumeSounds()
    const work = recordingRef.current
    if (work !== null) { void stopRecording(work); return }
    playToggleClick(settingsRef.current, 0.5)
    void startRealtimeRecording()
  }
  toggleRef.current = toggle

  const failureDetail = localizedErrorText(t, voiceSnapshot.detailCode, voiceSnapshot.detail || t('voiceError'), voiceSnapshot.detailParams)
  const tooltipLabel = busy
    ? t('voiceBusy')
    : active
      ? t('voiceStop')
      : state === 'upstream-error'
          ? t('voiceUpstreamAsr', { detail: failureDetail })
          : state === 'error'
            ? failureDetail
            : t('voiceStart')
  const ariaLabel = busy ? t('voiceBusy') : active ? t('voiceStop') : t('voiceStart')

  return (
    <Tooltip label={tooltipLabel} side="top" delayMs={200} portal>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-pressed={active}
        disabled={busy}
        className={styles.button}
        data-state={state}
        onPointerEnter={prewarmMicrophone}
        onPointerDown={prewarmMicrophone}
        onFocus={prewarmMicrophone}
        onClick={toggle}
      >
        <MicrophoneIcon />
      </button>
    </Tooltip>
  )
}

function playToggleClick(settings: EarsSettings, intensity: number): void {
  if (settings.voiceSoundsEnabled === false) return
  playClick(intensity)
}

function applyVoiceFailure(session: VoiceInputSession, error: unknown): void {
  const code = error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined
  const message = error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : failureMessage(error)
  const detail = remoteFailureDetail({ code, message })
  const detailCode = isEarsErrorCode(code) ? code : undefined
  const detailParams = remoteFailureParams(error)
  const kind = classifyVoiceFailure(detail, code)
  if (kind === 'empty') {
    session.setState('idle')
    return
  }
  if (kind === 'config') {
    session.setState('error', '', detailCode, detailParams)
    return
  }
  session.setState('upstream-error', detail, detailCode, detailParams)
}

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M8 1.75a2.25 2.25 0 0 0-2.25 2.25v3.5a2.25 2.25 0 0 0 4.5 0V4A2.25 2.25 0 0 0 8 1.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12.25V14M5.5 14h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  )
}
