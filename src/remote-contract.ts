import { z } from 'zod'
import { QWEN3_MODELS, MAX_QWEN3_PROMPT_LENGTH } from './config.js'
import type { EarsSettings } from './config.js'
import type { EarsErrorCode, EarsErrorParams } from './errors.js'
export const textSchema = z.string()
export const earsSettingsSchema = z.object({
  localQwenModel: z.string(), localQwenIdleTtlMinutes: z.number(), localQwenPrompt: z.string(),
  maxRecordingSeconds: z.number(), voiceShortcutEnabled: z.boolean(), voiceShortcut: z.string(), voiceSoundsEnabled: z.boolean()
})
export const earsSettingsPatchSchema = z.object({
  localQwenModel: z.enum(QWEN3_MODELS).optional(), localQwenIdleTtlMinutes: z.number().int().min(1).max(1440).optional(), localQwenPrompt: z.string().max(MAX_QWEN3_PROMPT_LENGTH).optional(),
  maxRecordingSeconds: z.number().optional(), voiceShortcutEnabled: z.boolean().optional(), voiceShortcut: z.string().optional(), voiceSoundsEnabled: z.boolean().optional()
}).strict()
export const earsSettingsViewSchema = z.object({ available: z.boolean(), writable: z.boolean(), settings: earsSettingsSchema, recoveredSettingsFields: z.array(z.string()).optional(), overridden: z.array(z.string()) })
const errorParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]))
export const audioBase64Schema = z.string().min(1).max(33_554_432)
export const qwenModelStateSchema = z.object({
  supported: z.boolean(),
  runtimeInstalled: z.boolean(),
  downloaded: z.boolean(),
  downloading: z.boolean(),
  phase: z.enum(['idle', 'runtime', 'weights']),
  progress: z.number().nullable(),
  loaded: z.boolean(),
  activeSessions: z.number(),
  expiresAt: z.number().nullable(),
  ttlMinutes: z.number(),
  error: z.string().nullable()
})

export const remoteTextResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    text: z.string()
  }),
  z.object({
    status: z.literal('error'),
    code: z.string(),
    message: z.string(),
    params: errorParamsSchema.optional()
  })
])
export const realtimeSessionSchema = z.object({ sessionId: z.string().min(1) })
export const realtimeTranscriptSchema = z.object({ text: z.string(), final: z.boolean() })
export const realtimeCancelledSchema = z.object({ cancelled: z.literal(true) })

export type RemoteTextResult = z.infer<typeof remoteTextResultSchema>
export type RemoteTextSuccess = Extract<RemoteTextResult, { status: 'ok' }>
export type RemoteTextFailure = Extract<RemoteTextResult, { status: 'error' }>
export type RealtimeSession = z.infer<typeof realtimeSessionSchema>
export type RealtimeTranscript = z.infer<typeof realtimeTranscriptSchema>

export function remoteTextSuccess(text: string): RemoteTextSuccess {
  return { status: 'ok', text }
}

export function remoteTextFailure(code: EarsErrorCode, message: string, params?: EarsErrorParams): RemoteTextFailure {
  return {
    status: 'error',
    code,
    message,
    ...(params === undefined ? {} : { params })
  }
}

export const aboutInfoSchema = z.object({
  repository: z.string(),
  repositorySlug: z.string(),
  version: z.string(),
  license: z.string(),
  dshCompatibility: z.string()
})
export type EarsSettingsPatch = Partial<EarsSettings>
export type EarsSettingsView = z.infer<typeof earsSettingsViewSchema>
export type Qwen3ModelState = z.infer<typeof qwenModelStateSchema>
export type AboutInfo = z.infer<typeof aboutInfoSchema>
