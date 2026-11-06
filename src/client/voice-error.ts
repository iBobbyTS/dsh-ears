import { EARS_ERROR_CODES, earsErrorParams, isEarsErrorCode } from '../errors.js'
import { localizedErrorText, type Translate } from './settings-locale.js'

export type VoiceFailureKind = 'empty' | 'config' | 'upstream'

export type VoiceStatusDisplay = {
  readonly state: string
  readonly detail: string
  readonly detailCode?: string
  readonly detailParams?: Readonly<Record<string, string | number>>
}

export function statusLabel(display: VoiceStatusDisplay, t: Translate): string {
  if (display.state === 'starting') return t('voiceStarting')
  if (display.state === 'recording') return t('voiceRecording')
  if (display.state === 'transcribing') return t('voiceTranscribing')
  const detail = localizedErrorText(t, display.detailCode, display.detail || t('voiceError'), display.detailParams)
  if (display.state === 'upstream-error') return t('voiceUpstreamAsr', { detail })
  if (display.state === 'error') return detail
  return t('voiceError')
}

export type RemoteFailureLike = {
  readonly code?: string
  readonly message?: string
  readonly params?: Readonly<Record<string, string | number>>
}

const EMPTY_MARKERS = [
  'returned no transcript',
  'recorded audio is empty',
  'no-speech',
  'no speech',
  'no valid speech',
  'audio too short',
  'empty audio'
]

const EMPTY_ERROR_CODES = new Set<string>([
  EARS_ERROR_CODES.asrAudioEmpty,
  EARS_ERROR_CODES.asrNoTranscript
])

const CONFIG_ERROR_CODES = new Set<string>([
  EARS_ERROR_CODES.settingsUnavailable,
  EARS_ERROR_CODES.browserMediaUnavailable
])

const CONFIG_MARKERS = [
  'is not configured',
  'unknown dsh-ears',
  'unavailable in this browser',
  'not-allowed',
  'service-not-allowed'
]

export function classifyVoiceFailure(message: string, code?: string): VoiceFailureKind {
  if (code !== undefined && isEarsErrorCode(code)) {
    if (EMPTY_ERROR_CODES.has(code)) return 'empty'
    if (CONFIG_ERROR_CODES.has(code)) return 'config'
    return 'upstream'
  }
  const text = message.trim().toLowerCase()
  if (text === '') return 'config'
  if (EMPTY_MARKERS.some((marker) => text.includes(marker))) return 'empty'
  if (CONFIG_MARKERS.some((marker) => text.includes(marker))) return 'config'
  return 'upstream'
}

export function remoteFailureDetail(error: RemoteFailureLike): string {
  const code = error.code?.trim() ?? ''
  const message = error.message?.trim() ?? ''
  if (code !== '' && code !== 'HOST_FAILURE' && code !== 'UNKNOWN' && !looksGenericCode(code) && !isEarsErrorCode(code)) {
    if (message !== '' && message !== code) return `${code}: ${message}`
    return code
  }
  return message || code || 'unknown'
}

export function remoteFailureParams(error: unknown): Readonly<Record<string, string | number>> | undefined {
  const known = earsErrorParams(error)
  if (known !== undefined) return known
  if (!isRecord(error) || !isRecord(error.params)) return undefined
  for (const value of Object.values(error.params)) {
    if (typeof value !== 'string' && typeof value !== 'number') return undefined
  }
  return error.params as Readonly<Record<string, string | number>>
}

export function failureMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function looksGenericCode(code: string): boolean {
  return /^(error|failed|exception|internal)$/i.test(code)
}
