import { EARS_REMOTE_DESCRIPTORS } from './remote-definitions.js'

const signatures = {
  getAbout: 'getAbout(): AboutInfo',
  getSettings: 'getSettings(): EarsSettingsView',
  updateSettings: 'updateSettings(patch: EarsSettingsPatch, signal: AbortSignal): Promise<EarsSettingsView>',
  getQwenModelState: 'getQwenModelState(model: string): Promise<Qwen3ModelState>',
  downloadQwenModel: 'downloadQwenModel(model: string): Promise<Qwen3ModelState>',
  cancelQwenModelDownload: 'cancelQwenModelDownload(model: string): Promise<Qwen3ModelState>',
  deleteQwenModel: 'deleteQwenModel(model: string): Promise<Qwen3ModelState>',
  startQwenService: 'startQwenService(model: string): Promise<Qwen3ModelState>',
  unloadQwenService: 'unloadQwenService(model: string): Promise<Qwen3ModelState>',
  startRealtime: 'startRealtime(signal: AbortSignal): Promise<RealtimeSession>',
  sendRealtimeAudio: 'sendRealtimeAudio(sessionId: string, audioBase64: string, signal: AbortSignal): Promise<RealtimeTranscript>',
  finishRealtime: 'finishRealtime(sessionId: string, signal: AbortSignal): Promise<RemoteTextResult>',
  cancelRealtime: 'cancelRealtime(sessionId: string): Promise<RealtimeCancelled>'
} as const

export const TYPERT = {
  package: 'dsh-ears',
  face: 'host',
  schemas: [],
  invocations: EARS_REMOTE_DESCRIPTORS,
  model: {
    services: [{
      key: 'dshEarsQwen',
      exportName: 'QwenService',
      summary: 'Host-owned local Qwen3-ASR MLX recognition and settings.',
      tags: [],
      members: EARS_REMOTE_DESCRIPTORS.map(({ method }) => ({ kind: 'method' as const, name: method, signature: signatures[method] })),
      types: [
        { name: 'EarsSettings', declaration: 'export interface EarsSettings { localQwenModel: string; localQwenIdleTtlMinutes: number; localQwenPrompt: string; maxRecordingSeconds: number; voiceShortcutEnabled: boolean; voiceShortcut: string; voiceSoundsEnabled: boolean }' },
        { name: 'EarsSettingsPatch', declaration: 'export type EarsSettingsPatch = Partial<EarsSettings>' },
        { name: 'EarsSettingsView', declaration: 'export interface EarsSettingsView { available: boolean; writable: boolean; settings: EarsSettings; recoveredSettingsFields?: string[]; overridden: string[] }' },
        { name: 'AboutInfo', declaration: 'export interface AboutInfo { repository: string; repositorySlug: string; version: string; license: string; dshCompatibility: string }' },
        { name: 'Qwen3ModelState', declaration: "export interface Qwen3ModelState { supported: boolean; runtimeInstalled: boolean; downloaded: boolean; downloading: boolean; phase: 'idle' | 'runtime' | 'weights'; progress: number | null; loaded: boolean; activeSessions: number; expiresAt: number | null; ttlMinutes: number; error: string | null }" },
        { name: 'RealtimeSession', declaration: 'export interface RealtimeSession { sessionId: string }' },
        { name: 'RealtimeTranscript', declaration: 'export interface RealtimeTranscript { text: string; final: boolean }' },
        { name: 'RealtimeCancelled', declaration: 'export interface RealtimeCancelled { cancelled: true }' },
        { name: 'RemoteTextResult', declaration: "export type RemoteTextResult = { status: 'ok'; text: string } | { status: 'error'; code: string; message: string; params?: Record<string, string | number> }" }
      ]
    }],
    events: [],
    objects: []
  }
} as const
export default TYPERT
