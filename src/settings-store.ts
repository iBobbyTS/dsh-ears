import { DEFAULT_EARS_SETTINGS, EARS_SETTINGS_SCHEMA_VERSION, type EarsSettings } from './config.js'
import type { GeneralSettings } from './settings/general.js'
import type { RecognitionSettings } from './settings/recognition.js'
import type { EarsSettingsPatch } from './remote-contract.js'
export type StoredEarsSettings = { schemaVersion: typeof EARS_SETTINGS_SCHEMA_VERSION; general: GeneralSettings; recognition: RecognitionSettings }
const FLAT_SETTING_KEYS = Object.keys(DEFAULT_EARS_SETTINGS) as (keyof EarsSettings)[]
const CURRENT_STORED_PATHS = new Map<keyof EarsSettings, readonly string[]>([
  ['settingsDisplayName', ['general', 'displayName']],
  ['voiceShortcutEnabled', ['general', 'shortcut', 'enabled']],
  ['voiceShortcut', ['general', 'shortcut', 'value']],
  ['voiceSoundsEnabled', ['general', 'soundsEnabled']],
  ['localQwenModel', ['recognition', 'localQwen', 'model']],
  ['localQwenIdleTtlMinutes', ['recognition', 'localQwen', 'idleTtlMinutes']],
  ['localQwenPrompt', ['recognition', 'localQwen', 'prompt']],
  ['maxRecordingSeconds', ['recognition', 'maxRecordingSeconds']]
])
function readPath(raw: unknown, path: readonly string[]): unknown {
  let value = raw
  for (const key of path) { if (!isRecord(value)) return undefined; value = value[key] }
  return value
}
export function flattenStoredSettings(raw: unknown): EarsSettings {
  const result = { ...DEFAULT_EARS_SETTINGS }
  for (const [field, path] of CURRENT_STORED_PATHS) {
    const value = readPath(raw, path) ?? readPath(raw, [field])
    if (value !== undefined) (result as unknown as Record<string, unknown>)[field] = value
  }
  return result
}
export function unflattenEarsSettings(settings: EarsSettings): StoredEarsSettings {
  return {
    schemaVersion: EARS_SETTINGS_SCHEMA_VERSION,
    general: { displayName: settings.settingsDisplayName, shortcut: { enabled: settings.voiceShortcutEnabled, value: settings.voiceShortcut }, soundsEnabled: settings.voiceSoundsEnabled },
    recognition: { localQwen: { model: settings.localQwenModel, idleTtlMinutes: settings.localQwenIdleTtlMinutes, prompt: settings.localQwenPrompt }, maxRecordingSeconds: settings.maxRecordingSeconds }
  }
}
export function defaultStoredEarsSettings(): StoredEarsSettings { return unflattenEarsSettings(DEFAULT_EARS_SETTINGS) }
export function normalizeStoredEarsSettings(raw: unknown): StoredEarsSettings { return unflattenEarsSettings(flattenStoredSettings(raw)) }
export function flatSettingsPatchToStoredPatch(patch: EarsSettingsPatch): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(patch)) {
    const path = CURRENT_STORED_PATHS.get(field as keyof EarsSettings)
    if (value === undefined || path === undefined) continue
    let target = result
    for (const segment of path.slice(0, -1)) {
      const next = target[segment]
      if (!isRecord(next)) target[segment] = {}
      target = target[segment] as Record<string, unknown>
    }
    target[path[path.length - 1] as string] = value
  }
  return result
}

export function applyFlatSettingsPatch(stored: unknown, patch: EarsSettingsPatch): StoredEarsSettings {
  return applyFlatSettingsPatchWithSettings(stored, patch).next
}

/** Return requested values for validation and their retained persistence projection. */
export function applyFlatSettingsPatchWithSettings(
  stored: unknown,
  patch: EarsSettingsPatch
): { requested: EarsSettings; next: StoredEarsSettings } {
  const currentStored = normalizeStoredEarsSettings(stored)
  const current = flattenStoredSettings(currentStored)
  const requested: EarsSettings = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && isFlatSettingKey(key)) {
      ;(requested as unknown as Record<string, unknown>)[key] = value
    }
  }
  return { requested, next: unflattenEarsSettings(requested) }
}

export function flattenOverriddenSettings(raw: unknown): string[] {
  return [...CURRENT_STORED_PATHS].filter(([field, path]) => readPath(raw, path) !== undefined || readPath(raw, [field]) !== undefined).map(([field]) => field)
}
function isFlatSettingKey(value: string): value is keyof EarsSettings { return FLAT_SETTING_KEYS.includes(value as keyof EarsSettings) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
