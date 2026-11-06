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
import { isSupersededMediaCapture, reuseInFlightPromise } from './voice-capture.js'
import { VoiceDraftWriter } from './voice-draft-writer.js'
import { observeComposerSubmission } from './composer-submit.js'
import { matchesShortcut } from '../shortcut.js'
import { fallbackTranslate, localizedErrorText, type Translate } from './settings-locale.js'
import { playClick, resumeSounds, retainSounds } from './sounds.js'
import { createVoiceStateSetter, useVoiceInputSession, type VoiceInputSession } from './voice-session.js'

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
  const realtimeCaptureRef = useRef<RealtimeAudioCaptureSession | null>(null)
  const realtimeRemoteSessionIdRef = useRef<string | null>(null)
  const realtimeReadyRef = useRef<Promise<string> | null>(null)
  const realtimeStartAbortRef = useRef<AbortController | null>(null)
  const realtimeWriterRef = useRef<VoiceDraftWriter | null>(null)
  const levelMonitorRef = useRef<AudioLevelMonitor | null>(null)
  const mediaStartCancelledRef = useRef(false)
  const mediaStartGenerationRef = useRef(0)
  const transcribeAbortRef = useRef<AbortController | null>(null)
  const realtimeStopPromiseRef = useRef<{ key: RealtimeAudioCaptureSession; promise: Promise<void> } | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    const stop = voiceSession.onStopRequested(() => {
      void stopRecordingRef.current?.()
    })
    const cancel = voiceSession.onCancelRequested((preserveDraft) => {
      mediaStartGenerationRef.current += 1
      transcribeAbortRef.current?.abort()
      mediaStartCancelledRef.current = true
      realtimeStartAbortRef.current?.abort()
      realtimeStartAbortRef.current = null
      realtimeReadyRef.current = null
      clearRecordingTimer(recordingTimerRef)
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
      const realtimeCapture = realtimeCaptureRef.current
      realtimeCaptureRef.current = null
      realtimeCapture?.abort()
      const sessionId = realtimeRemoteSessionIdRef.current
      realtimeRemoteSessionIdRef.current = null
      if (sessionId !== null) void remote.cancelRealtime(sessionId)
      const writer = realtimeWriterRef.current
      if (preserveDraft) writer?.finalize(writer.text)
      else writer?.cancel()
      realtimeWriterRef.current = null
    })
    return () => {
      stop()
      cancel()
    }
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
      voiceSession.setState('idle')
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
      realtimeStartAbortRef.current?.abort()
      realtimeStartAbortRef.current = null
      realtimeReadyRef.current = null
      realtimeCaptureRef.current?.abort()
      realtimeCaptureRef.current = null
      const realtimeSessionId = realtimeRemoteSessionIdRef.current
      realtimeRemoteSessionIdRef.current = null
      if (realtimeSessionId !== null) void remote.cancelRealtime(realtimeSessionId)
      realtimeWriterRef.current?.cancel()
      realtimeWriterRef.current = null
      transcribeAbortRef.current?.abort()
      clearRecordingTimer(recordingTimerRef)
      releaseSounds()
    }
  }, [voiceSession])

  const active = state === 'starting' || state === 'recording'
  const busy = state === 'transcribing'
  if (!active && !busy && !isRealtimeAudioCaptureAvailable()) {
    return <Tooltip label={t('voiceUnavailableRecorder')} side="top" delayMs={200} portal>
      <button ref={buttonRef} type="button" aria-label={t('voiceUnavailable')} aria-disabled="true" className={styles.button}><MicrophoneIcon /></button>
    </Tooltip>
  }

  const stopRealtimeRecording = () => {
    const capture = realtimeCaptureRef.current
    const ready = realtimeReadyRef.current
    let sessionId = realtimeRemoteSessionIdRef.current
    if (capture === null || (sessionId === null && ready === null)) return Promise.resolve()
    const writer = realtimeWriterRef.current
    return reuseInFlightPromise(realtimeStopPromiseRef, capture, async () => {
      playToggleClick(settingsRef.current, 0.4)
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
      const controller = new AbortController()
      transcribeAbortRef.current = controller
      const epoch = voiceSession.captureEpoch()
      setState('transcribing')
      try {
        await capture.stop()
        sessionId ??= await ready!
        if (!mountedRef.current || controller.signal.aborted || !voiceSession.isCurrentEpoch(epoch)) return
        const result = await remote.finishRealtime(sessionId, controller.signal)
        if (!mountedRef.current || controller.signal.aborted || !voiceSession.isCurrentEpoch(epoch)) return
        if (!result.ok) {
          applyVoiceFailure(voiceSession, result.error)
          return
        }
        if (result.value.status === 'error') {
          applyVoiceFailure(voiceSession, result.value)
          return
        }
        const transcript = result.value.text.trim()
        if (realtimeWriterRef.current === writer) realtimeWriterRef.current = null
        if (writer === null) { setState('idle'); return }
        if (!writer.finalize(transcript)) {
          applyVoiceFailure(voiceSession, new Error(t('qwenDraftChanged')))
          return
        }
        setState('idle')
      } catch (error) {
        if (mountedRef.current && !controller.signal.aborted && voiceSession.isCurrentEpoch(epoch)) applyVoiceFailure(voiceSession, error)
      } finally {
        if (realtimeCaptureRef.current === capture) {
          realtimeCaptureRef.current = null
        }
        if (realtimeReadyRef.current === ready) realtimeReadyRef.current = null
        if (realtimeRemoteSessionIdRef.current === sessionId) realtimeRemoteSessionIdRef.current = null
        if (transcribeAbortRef.current === controller) transcribeAbortRef.current = null
        if (sessionId !== null) void remote.cancelRealtime(sessionId)
        writer?.cancel()
        if (realtimeWriterRef.current === writer) realtimeWriterRef.current = null
      }
    })
  }

  const startRealtimeRecording = async () => {
    const writer = new VoiceDraftWriter(actionsRef.current)
    realtimeWriterRef.current = writer
    const startController = new AbortController()
    realtimeStartAbortRef.current = startController
    const generation = ++mediaStartGenerationRef.current
    mediaStartCancelledRef.current = false
    setState('starting')
    let capture: RealtimeAudioCaptureSession | undefined
    let sessionId: string | undefined
    let ready: Promise<string> | undefined
    const abandoned = () => !mountedRef.current || startController.signal.aborted || realtimeStartAbortRef.current !== startController || isSupersededMediaCapture(mediaStartGenerationRef.current, generation) || mediaStartCancelledRef.current
    const openRemote = async () => {
      const started = await remote.startRealtime(startController.signal)
      if (!started.ok) throw started.error
      const id = started.value.sessionId
      sessionId = id
      if (abandoned()) {
        // The startup catch owns cancellation of this closure's remote ID.
        throw new DOMException('Recording startup cancelled', 'AbortError')
      }
      realtimeRemoteSessionIdRef.current = id
      return id
    }
    try {
      // Capture immediately while the local model starts.
      capture = await RealtimeAudioCaptureSession.create()
      if (abandoned()) {
        capture.abort()
        if (sessionId !== undefined) await remote.cancelRealtime(sessionId)
        return
      }
      ready = openRemote()
      realtimeReadyRef.current = ready
      const epoch = voiceSession.captureEpoch()
      realtimeCaptureRef.current = capture
      if (sessionId !== undefined) realtimeRemoteSessionIdRef.current = sessionId
      capture.start(async (audioBase64) => {
        const result = await remote.sendRealtimeAudio(sessionId!, audioBase64)
        if (!mountedRef.current || !voiceSession.isCurrentEpoch(epoch)) return
        if (!result.ok) throw result.error
        const transcript = result.value.text.trim()
        // Send the full hypothesis so native Prefix Rollback can shorten it.
        writer.update(transcript)
      }, ready?.then(() => undefined))
      setState('recording')
      armRecordingTimer(recordingTimerRef, effectiveRecordingSeconds(settingsRef.current), () => void stopRecording())
      try {
        levelMonitorRef.current = capture.createLevelMonitor((level) => voiceSession.pushAudioLevel(level))
      } catch {
        // Realtime recognition remains usable when the optional waveform analyser is unavailable.
      }
      if (ready !== undefined) await ready
      if (realtimeStartAbortRef.current === startController) realtimeStartAbortRef.current = null
    } catch (error) {
      capture?.abort()
      if (sessionId !== undefined) await remote.cancelRealtime(sessionId)
      if (realtimeCaptureRef.current === capture) realtimeCaptureRef.current = null
      if (realtimeRemoteSessionIdRef.current === sessionId) realtimeRemoteSessionIdRef.current = null
      const ownsStart = realtimeStartAbortRef.current === startController
      if (ownsStart) realtimeStartAbortRef.current = null
      if (realtimeReadyRef.current === ready) realtimeReadyRef.current = null
      if (!mountedRef.current || startController.signal.aborted || !ownsStart || isSupersededMediaCapture(mediaStartGenerationRef.current, generation)) return
      clearRecordingTimer(recordingTimerRef)
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
      if (mediaStartCancelledRef.current) setState('idle')
      else applyVoiceFailure(voiceSession, error)
      writer.cancel()
      if (realtimeWriterRef.current === writer) realtimeWriterRef.current = null
    }
  }

  const stopRecording = async () => {
    clearRecordingTimer(recordingTimerRef)
    if (state === 'starting' && realtimeCaptureRef.current === null && realtimeRemoteSessionIdRef.current === null) {
      playToggleClick(settingsRef.current, 0.4)
      mediaStartCancelledRef.current = true
      realtimeStartAbortRef.current?.abort()
      realtimeStartAbortRef.current = null
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
      setState('idle')
      return
    }
    await stopRealtimeRecording()
  }
  stopRecordingRef.current = stopRecording
  const prewarmMicrophone = () => {
    if (settingsRef.current.voiceSoundsEnabled !== false) resumeSounds()
  }

  const toggle = () => {
    if (settingsRef.current.voiceSoundsEnabled !== false) resumeSounds()
    if (active) {
      void stopRecording()
      return
    }
    if (busy) return
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

function armRecordingTimer(timerRef: { current: ReturnType<typeof setTimeout> | null }, seconds: number, stop: () => void): void {
  clearRecordingTimer(timerRef)
  timerRef.current = setTimeout(stop, Math.max(1, seconds) * 1000)
}

function clearRecordingTimer(timerRef: { current: ReturnType<typeof setTimeout> | null }): void {
  if (timerRef.current === null) return
  clearTimeout(timerRef.current)
  timerRef.current = null
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
