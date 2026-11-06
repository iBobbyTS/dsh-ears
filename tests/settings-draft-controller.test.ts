import { describe, expect, it } from 'vitest'
import { SettingsDraftController } from '../src/client/settings-draft-controller.js'
describe('Qwen per-field drafts', () => {
  it('skips invalid fields and preserves edits newer than a submission', () => {
    const drafts = new SettingsDraftController()
    drafts.edit('localQwenIdleTtlMinutes', '0')
    drafts.edit('localQwenPrompt', 'first')
    const first = drafts.buildSubmission()
    expect(first.patch).toEqual({ localQwenPrompt: 'first' })
    drafts.edit('localQwenPrompt', 'second')
    drafts.reconcile(first)
    expect(drafts.get('localQwenPrompt')).toBe('second')
    expect(drafts.get('localQwenIdleTtlMinutes')).toBe('0')
  })
  it('saves an empty prompt as a clear and resets an empty recording limit', () => {
    const drafts = new SettingsDraftController()
    drafts.edit('localQwenPrompt', '')
    drafts.edit('maxRecordingSeconds', '')
    expect(drafts.buildSubmission().patch).toEqual({ localQwenPrompt: '', maxRecordingSeconds: 120 })
  })
})
