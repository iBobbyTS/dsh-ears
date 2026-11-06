/** Stable business error codes shared by the Host and browser client. */

export const EARS_ERROR_CODES = {
  settingsUnavailable: 'settings.unavailable',
  asrAudioEmpty: 'asr.audioEmpty',
  asrAudioInvalid: 'asr.audioInvalid',
  asrAudioTooLarge: 'asr.audioTooLarge',
  asrNoTranscript: 'asr.noTranscript',
  asrUnexpected: 'asr.unexpected',
  browserMediaUnavailable: 'browser.mediaUnavailable'
} as const

export type EarsErrorCode = (typeof EARS_ERROR_CODES)[keyof typeof EARS_ERROR_CODES]
export type EarsErrorParams = Readonly<Record<string, string | number>>

const MAX_ERROR_TEXT_LENGTH = 800

export function sanitizeEarsErrorText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:api[-_]?key|token|secret|password|authorization)=)[^&\s]*/gi, '$1[redacted]')
    .replace(/([a-z][a-z\d+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, '$1[redacted]@')
    .trim()
    .slice(0, MAX_ERROR_TEXT_LENGTH)
}

export function sanitizeEarsErrorParams(params: EarsErrorParams | undefined): EarsErrorParams | undefined {
  if (params === undefined) return undefined
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [
    key,
    typeof value === 'string' ? sanitizeEarsErrorText(value) : value
  ])) as EarsErrorParams
}

export class EarsError extends Error {
  readonly code: EarsErrorCode
  readonly params: EarsErrorParams | undefined

  constructor(code: EarsErrorCode, message: string, params?: EarsErrorParams) {
    super(message)
    this.name = 'EarsError'
    this.code = code
    this.params = params
  }
}

export function earsErrorCode(error: unknown): EarsErrorCode | undefined {
  if (!(error instanceof EarsError)) return undefined
  return error.code
}

export function earsErrorParams(error: unknown): EarsErrorParams | undefined {
  if (!(error instanceof EarsError)) return undefined
  return error.params
}

export function isEarsErrorCode(value: unknown): value is EarsErrorCode {
  return typeof value === 'string' && Object.values(EARS_ERROR_CODES).includes(value as EarsErrorCode)
}
