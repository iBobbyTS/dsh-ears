export const QWEN3_MODELS = ['1.7b-8bit', '0.6b-8bit'] as const
export type Qwen3ModelId = typeof QWEN3_MODELS[number]
export const DEFAULT_QWEN3_MODEL: Qwen3ModelId = '1.7b-8bit'
export const QWEN3_DEFAULT_TTL_MINUTES = 60
export const validQwen3TTL = (minutes: number): boolean => Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 1440
/** Matches the context cap enforced by the Python worker's start command. */
export const MAX_QWEN3_PROMPT_LENGTH = 1024

export interface RecognitionSettings {
  localQwen: { model: string; idleTtlMinutes: number; prompt: string }
  maxRecordingSeconds: number
}
export const DEFAULT_RECOGNITION_SETTINGS: RecognitionSettings = Object.freeze({
  localQwen: Object.freeze({ model: DEFAULT_QWEN3_MODEL, idleTtlMinutes: QWEN3_DEFAULT_TTL_MINUTES, prompt: '' }),
  maxRecordingSeconds: 120
})
export function isValidRecordingLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 600
}
