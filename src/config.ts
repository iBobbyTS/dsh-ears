import { isValidStoredShortcut } from './shortcut.js'
import { QWEN3_MODELS, DEFAULT_RECOGNITION_SETTINGS, MAX_QWEN3_PROMPT_LENGTH, validQwen3TTL, isValidRecordingLimit } from './settings/recognition.js'
export * from './settings/recognition.js'
export const SETTINGS_NAMESPACE = 'dsh-ears'
export const EARS_SETTINGS_SCHEMA_VERSION = 4 as const
export interface EarsSettings {
  localQwenModel: string
  localQwenIdleTtlMinutes: number
  localQwenPrompt: string
  maxRecordingSeconds: number
  voiceShortcutEnabled: boolean
  voiceShortcut: string
  voiceSoundsEnabled: boolean
}
export const DEFAULT_EARS_SETTINGS: EarsSettings = Object.freeze({
  localQwenModel: DEFAULT_RECOGNITION_SETTINGS.localQwen.model,
  localQwenIdleTtlMinutes: DEFAULT_RECOGNITION_SETTINGS.localQwen.idleTtlMinutes,
  localQwenPrompt: DEFAULT_RECOGNITION_SETTINGS.localQwen.prompt,
  maxRecordingSeconds: DEFAULT_RECOGNITION_SETTINGS.maxRecordingSeconds,
  voiceShortcutEnabled: true,
  voiceShortcut: 'ctrl+shift+space',
  voiceSoundsEnabled: true
})
export function effectiveRecordingSeconds(settings: Pick<EarsSettings, 'maxRecordingSeconds'>): number { return settings.maxRecordingSeconds }
function validField(field: keyof EarsSettings, value: unknown): boolean {
  switch (field) {
    case 'localQwenModel': return typeof value === 'string' && (QWEN3_MODELS as readonly string[]).includes(value)
    case 'localQwenIdleTtlMinutes': return typeof value === 'number' && validQwen3TTL(value)
    case 'localQwenPrompt': return typeof value === 'string' && value.trim().length <= MAX_QWEN3_PROMPT_LENGTH
    case 'maxRecordingSeconds': return typeof value === 'number' && isValidRecordingLimit(value)
    case 'voiceShortcut': return typeof value === 'string' && isValidStoredShortcut(value)
    default: return typeof value === 'boolean'
  }
}
export function validateEarsSettings(settings: EarsSettings): void {
  for (const field of Object.keys(DEFAULT_EARS_SETTINGS) as (keyof EarsSettings)[]) {
    if (!validField(field, settings[field])) throw new Error(`Invalid dsh-ears setting: ${field}`)
  }
}
export function repairInvalidEarsSettings(settings: EarsSettings): { settings: EarsSettings; repairedFields: readonly string[] } {
  const repaired = { ...settings }
  const repairedFields: string[] = []
  for (const field of Object.keys(DEFAULT_EARS_SETTINGS) as (keyof EarsSettings)[]) {
    if (!validField(field, repaired[field])) {
      (repaired as unknown as Record<string, unknown>)[field] = DEFAULT_EARS_SETTINGS[field]
      repairedFields.push(field)
    }
  }
  return { settings: repaired, repairedFields }
}
