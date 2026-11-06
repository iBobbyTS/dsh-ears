import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { EARS_REMOTE_DESCRIPTORS } from './remote-definitions.js'
import type { AboutInfo, EarsSettingsPatch, EarsSettingsView, RealtimeSession, RealtimeTranscript, RemoteTextResult, Qwen3ModelState } from './remote-contract.js'

export type EarsRemote = ClientRemote['dshEars']

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$dshEars {
    getAbout: () => Promise<RemoteResult<AboutInfo>>
    getSettings: () => Promise<RemoteResult<EarsSettingsView>>
    updateSettings: (patch: EarsSettingsPatch, signal?: AbortSignal) => Promise<RemoteResult<EarsSettingsView>>
    getQwenModelState: (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    downloadQwenModel: (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    cancelQwenModelDownload: (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    deleteQwenModel: (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    startQwenService: (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    unloadQwenService: (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    startRealtime: (signal?: AbortSignal) => Promise<RemoteResult<RealtimeSession>>
    sendRealtimeAudio: (sessionId: string, audioBase64: string, signal?: AbortSignal) => Promise<RemoteResult<RealtimeTranscript>>
    finishRealtime: (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<RemoteTextResult>>
    cancelRealtime: (sessionId: string) => Promise<RemoteResult<{ cancelled: true }>>
  }

  interface TypertRemoteMap {
    'dshEars/getAbout': () => Promise<RemoteResult<AboutInfo>>
    'dshEars/getSettings': () => Promise<RemoteResult<EarsSettingsView>>
    'dshEars/updateSettings': (patch: EarsSettingsPatch, signal?: AbortSignal) => Promise<RemoteResult<EarsSettingsView>>
    'dshEars/getQwenModelState': (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    'dshEars/downloadQwenModel': (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    'dshEars/cancelQwenModelDownload': (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    'dshEars/deleteQwenModel': (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    'dshEars/startQwenService': (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    'dshEars/unloadQwenService': (model: string) => Promise<RemoteResult<Qwen3ModelState>>
    'dshEars/startRealtime': (signal?: AbortSignal) => Promise<RemoteResult<RealtimeSession>>
    'dshEars/sendRealtimeAudio': (sessionId: string, audioBase64: string, signal?: AbortSignal) => Promise<RemoteResult<RealtimeTranscript>>
    'dshEars/finishRealtime': (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<RemoteTextResult>>
    'dshEars/cancelRealtime': (sessionId: string) => Promise<RemoteResult<{ cancelled: true }>>
  }

  interface TypertRemoteNamespaceMap {
    dshEars: TypertRemoteNamespace$dshEars
  }
}

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-ears',
  descriptors: EARS_REMOTE_DESCRIPTORS
}

export default TYPERT_REMOTE
