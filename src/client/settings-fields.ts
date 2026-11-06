import { MAX_QWEN3_PROMPT_LENGTH, QWEN3_MODELS, validQwen3TTL, isValidRecordingLimit, type EarsSettings } from '../config.js'
import { shortcutRejectReason } from '../shortcut.js'
export type FieldName = keyof EarsSettings
export function parseSettingsField(field: FieldName, text: string): unknown {
  if (field === 'maxRecordingSeconds' || field === 'localQwenIdleTtlMinutes') return Number(text)
  if (field === 'voiceShortcutEnabled' || field === 'voiceSoundsEnabled') return text === 'on'
  return text
}

export function isSettingsFieldInvalid(field: FieldName, text: string): boolean {
  if (field === 'localQwenIdleTtlMinutes') return !validQwen3TTL(Number(text))
  if (field === 'localQwenModel') return !(QWEN3_MODELS as readonly string[]).includes(text)
  if (field === 'localQwenPrompt') return text.trim().length > MAX_QWEN3_PROMPT_LENGTH
  if (field === 'voiceShortcutEnabled' || field === 'voiceSoundsEnabled') return text !== 'on' && text !== 'off'
  if (field === 'voiceShortcut') return shortcutRejectReason(text) !== null
  if (text.trim() === '') return false
  const value = Number(text)
  return !isValidRecordingLimit(value)
}
