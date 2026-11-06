import s from '@deepseek-ai/schemastery'
import { EARS_SETTINGS_SCHEMA_VERSION } from './config.js'
import { DEFAULT_GENERAL_SETTINGS } from './settings/general.js'
import { DEFAULT_RECOGNITION_SETTINGS } from './settings/recognition.js'
// Volatile leaves preserve the running service and settings form during autosave.
export const EarsSettingsSchema = s.object({
  schemaVersion: s.number().default(EARS_SETTINGS_SCHEMA_VERSION).description('Settings schema version').loose().volatile(),
  general: s.object({
    displayName: s.string().default(DEFAULT_GENERAL_SETTINGS.displayName).description('Settings page display name: dsh-ears or voice').loose().volatile(),
    shortcut: s.object({
      enabled: s.boolean().default(DEFAULT_GENERAL_SETTINGS.shortcut.enabled).description('Enable the in-page voice shortcut').loose().volatile(),
      value: s.string().default(DEFAULT_GENERAL_SETTINGS.shortcut.value).description('In-page voice shortcut').loose().volatile()
    }).description('Voice shortcut').collapse(),
    soundsEnabled: s.boolean().default(DEFAULT_GENERAL_SETTINGS.soundsEnabled).description('Play a synthesized click for voice input').loose().volatile()
  }).description('General dsh-ears presentation and input settings').collapse(),
  recognition: s.object({
    localQwen: s.object({
      model: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localQwen.model).description('Qwen3-ASR quantized model').loose().volatile(),
      idleTtlMinutes: s.number().default(DEFAULT_RECOGNITION_SETTINGS.localQwen.idleTtlMinutes).description('Unload idle Qwen3-ASR after this many minutes (default 60)').loose().volatile(),
      prompt: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localQwen.prompt).description('Qwen3-ASR context prompt; biases transcription style, script, or domain terms; leave empty for no bias').loose().volatile()
    }).description('Host-managed MLX streaming ASR').collapse(),
    maxRecordingSeconds: s.number().default(DEFAULT_RECOGNITION_SETTINGS.maxRecordingSeconds).description('Recording limit in seconds').loose().volatile()
  }).description('Audio recognition routing and limits').collapse(),
})
