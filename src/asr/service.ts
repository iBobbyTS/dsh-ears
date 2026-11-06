import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { remoteErrorOf, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SettingsForms } from '@deepseek-ai/dsh-settings'
import { DEFAULT_EARS_SETTINGS, repairInvalidEarsSettings, validateEarsSettings, type EarsSettings } from '../config.js'
import { Qwen3Runtime, Qwen3RealtimeAsrSession } from './qwen3-runtime.js'
import { remoteTextFailure, remoteTextSuccess, type EarsSettingsPatch, type EarsSettingsView, type RemoteTextResult, type AboutInfo, type Qwen3ModelState } from '../remote-contract.js'
import { applyFlatSettingsPatchWithSettings, flatSettingsPatchToStoredPatch, flattenOverriddenSettings, flattenStoredSettings, unflattenEarsSettings } from '../settings-store.js'
import { findEarsSettingsForm, readEarsSettingsRaw, replaceEarsSettingsSection, updateEarsSettingsPatch } from '../settings/host-settings.js'
import { readInstalledAboutInfo } from '../about.js'
import { EARS_ERROR_CODES, EarsError, earsErrorCode, earsErrorParams, sanitizeEarsErrorParams, sanitizeEarsErrorText, type EarsErrorCode } from '../errors.js'
const REALTIME_SESSION_IDLE_TIMEOUT_MS = 60_000
interface GenericRealtimeAsrSession {
  open(signal?: AbortSignal): Promise<void>
  sendAudio(audio: Uint8Array, signal?: AbortSignal): Promise<{ text: string; final: boolean }>
  finish(signal?: AbortSignal): Promise<string>
  close(): void
}

type RealtimeSessionEntry = {
  session: GenericRealtimeAsrSession
  timer: ReturnType<typeof setTimeout>
}

export class QwenService extends TypertRemoteService {
  private readonly qwen3 = new Qwen3Runtime()
  private readonly realtimeSessions = new Map<string, RealtimeSessionEntry>()
  constructor(ctx: Context) {
    super(ctx, 'dshEarsQwen', { namespace: 'dshEars' })
    ctx.effect(() => () => {
      this.qwen3.dispose()
      for (const entry of this.realtimeSessions.values()) { clearTimeout(entry.timer); entry.session.close() }
      this.realtimeSessions.clear()
    }, 'dsh-ears Qwen runtime lifecycle')
  }
  getSettings(): EarsSettingsView {
    const provider = this.settingsProvider()
    if (provider === undefined) return { available: false, writable: false, settings: DEFAULT_EARS_SETTINGS, recoveredSettingsFields: [], overridden: [] }
    const snapshot = this.readSettingsSnapshot()
    const form = findEarsSettingsForm(provider, true)
    return { available: true, writable: provider.writable, settings: snapshot.settings, recoveredSettingsFields: [...snapshot.repairedFields], overridden: flattenOverriddenSettings(form?.user) }
  }
  async updateSettings(patch: EarsSettingsPatch, signal: AbortSignal): Promise<EarsSettingsView> {
    const provider = this.settingsProvider()
    if (provider === undefined) return this.getSettings()
    signal.throwIfAborted()
    const current = this.readSettingsSnapshot()
    const { requested, next } = applyFlatSettingsPatchWithSettings(current.stored, patch)
    validateEarsSettings(requested)
    if (current.repairedFields.length > 0) await replaceEarsSettingsSection(provider, next, current.revision)
    else await updateEarsSettingsPatch(provider, flatSettingsPatchToStoredPatch(patch), current.revision)
    return this.getSettings()
  }
  async getQwenModelState(model: string): Promise<Qwen3ModelState> {
    return this.qwen3.state(model, this.optionalSettings().localQwenIdleTtlMinutes)
  }

  async downloadQwenModel(model: string): Promise<Qwen3ModelState> {
    return this.qwen3.download(model)
  }

  async cancelQwenModelDownload(model: string): Promise<Qwen3ModelState> {
    return this.qwen3.cancelDownload(model)
  }

  async deleteQwenModel(model: string): Promise<Qwen3ModelState> {
    return this.qwen3.deleteModel(model)
  }

  async startQwenService(model: string): Promise<Qwen3ModelState> {
    return this.qwen3.load(model, this.optionalSettings().localQwenIdleTtlMinutes)
  }

  async unloadQwenService(model: string): Promise<Qwen3ModelState> {
    return this.qwen3.unloadModel(model)
  }

  getAbout(): AboutInfo {
    return readInstalledAboutInfo()
  }

  async startRealtime(signal: AbortSignal): Promise<{ sessionId: string }> {
    let session: GenericRealtimeAsrSession | undefined
    let registered = false
    try {
      signal.throwIfAborted()
      const settings = this.requireSettings()
      session = new Qwen3RealtimeAsrSession(this.qwen3, settings.localQwenModel, settings.localQwenIdleTtlMinutes, settings.localQwenPrompt)
      await session.open(signal)
      signal.throwIfAborted()
      const sessionId = randomUUID()
      this.realtimeSessions.set(sessionId, {
        session,
        timer: this.scheduleRealtimeSessionExpiry(sessionId, session)
      })
      registered = true
      return { sessionId }
    } catch (error) {
      if (session !== undefined && !registered) session.close()
      if (signal.aborted) signal.throwIfAborted()
      if (error instanceof EarsError) throw error
      const message = error instanceof Error && error.message.trim() !== '' ? error.message.trim() : 'Realtime recognition failed to start'
      throw new EarsError(EARS_ERROR_CODES.asrUnexpected, message)
    }
  }

  async sendRealtimeAudio(sessionId: string, audioBase64: string, signal: AbortSignal): Promise<{ text: string; final: boolean }> {
    signal.throwIfAborted()
    const entry = this.realtimeSessions.get(sessionId)
    if (entry === undefined) throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Realtime session was not found')
    const audio = decodeAudio(audioBase64)
    try {
      const result = await entry.session.sendAudio(audio, signal)
      if (this.realtimeSessions.get(sessionId) === entry) this.refreshRealtimeSessionExpiry(sessionId, entry)
      return result
    } catch (error) {
      // A failed send leaves the provider stream's state uncertain. Release
      // the socket and registry entry so later calls cannot use a dead stream.
      this.removeRealtimeSession(sessionId, entry.session)
      throw error
    }
  }

  async finishRealtime(sessionId: string, signal: AbortSignal): Promise<RemoteTextResult> {
    const entry = this.realtimeSessions.get(sessionId)
    try {
      signal.throwIfAborted()
      if (entry === undefined) throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Realtime session was not found')
      const text = await entry.session.finish(signal)
      return remoteTextSuccess(text)
    } catch (error) {
      return toRemoteTextFailure(error, signal, EARS_ERROR_CODES.asrUnexpected, 'Realtime recognition failed')
    } finally {
      this.removeRealtimeSession(sessionId, entry?.session)
    }
  }

  async cancelRealtime(sessionId: string): Promise<{ cancelled: true }> {
    this.removeRealtimeSession(sessionId)
    return { cancelled: true }
  }

  private scheduleRealtimeSessionExpiry(sessionId: string, session: GenericRealtimeAsrSession): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      const entry = this.realtimeSessions.get(sessionId)
      if (entry?.session !== session) return
      entry.session.close()
      clearTimeout(entry.timer)
      this.realtimeSessions.delete(sessionId)
    }, REALTIME_SESSION_IDLE_TIMEOUT_MS)
  }

  private refreshRealtimeSessionExpiry(sessionId: string, entry: RealtimeSessionEntry): void {
    clearTimeout(entry.timer)
    entry.timer = this.scheduleRealtimeSessionExpiry(sessionId, entry.session)
  }

  private removeRealtimeSession(sessionId: string, expectedSession?: GenericRealtimeAsrSession): void {
    const entry = this.realtimeSessions.get(sessionId)
    if (entry === undefined || (expectedSession !== undefined && entry.session !== expectedSession)) return
    clearTimeout(entry.timer)
    entry.session.close()
    this.realtimeSessions.delete(sessionId)
  }

  private requireSettings(): EarsSettings {
    if (this.settingsProvider() === undefined) throw new EarsError(EARS_ERROR_CODES.settingsUnavailable, 'dsh-ears settings are unavailable')
    return this.readSettingsSnapshot().settings
  }
  private settingsProvider(): SettingsForms | undefined { return this.ctx.get('settings') }
  private optionalSettings(): EarsSettings { return this.settingsProvider() === undefined ? DEFAULT_EARS_SETTINGS : this.readSettingsSnapshot().settings }
  private readSettingsSnapshot() {
    const rawState = readEarsSettingsRaw(this.settingsProvider())
    const repair = repairInvalidEarsSettings(flattenStoredSettings(rawState.raw))
    return { ...rawState, settings: repair.settings, stored: unflattenEarsSettings(repair.settings), repairedFields: repair.repairedFields }
  }
}
function toRemoteTextFailure(error: unknown, signal: AbortSignal, fallbackCode: EarsErrorCode, fallbackMessage: string): RemoteTextResult {
  if (signal.aborted) signal.throwIfAborted()
  if (remoteErrorOf(error) !== undefined) throw error
  const knownCode = earsErrorCode(error)
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const diagnostic = sanitizeEarsErrorText(rawMessage)
  const message = knownCode === undefined
    ? diagnostic === '' ? fallbackMessage : `${fallbackMessage}: ${diagnostic}`
    : diagnostic === '' ? fallbackMessage : diagnostic
  const params = sanitizeEarsErrorParams(earsErrorParams(error) ?? (knownCode === undefined && diagnostic !== '' ? { detail: diagnostic } : undefined))
  return remoteTextFailure(knownCode ?? fallbackCode, message, params)
}

function decodeAudio(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'The recorded audio is not valid base64')
  const audio = Buffer.from(value, 'base64')
  if (audio.byteLength === 0) throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, 'The recorded audio is empty')
  if (audio.byteLength > 24 * 1024 * 1024) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, 'The recorded audio is too large')
  return new Uint8Array(audio)
}
