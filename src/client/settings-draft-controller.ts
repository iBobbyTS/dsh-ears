import { DEFAULT_EARS_SETTINGS } from '../config.js'
import type { EarsSettingsPatch } from '../remote-contract.js'
import { isSettingsFieldInvalid, parseSettingsField, type FieldName } from './settings-fields.js'
export interface SettingsSubmission { readonly patch: EarsSettingsPatch; readonly drafts: ReadonlyMap<FieldName, string> }
/** Owns per-field drafts and reconciles only values included in a completed save. */
export class SettingsDraftController {
  private readonly draftValues = new Map<FieldName, string>()
  get(field: FieldName): string | undefined { return this.draftValues.get(field) }
  has(field: FieldName): boolean { return this.draftValues.has(field) }
  entries(): ReadonlyMap<FieldName, string> { return this.draftValues }
  get size(): number { return this.draftValues.size }
  edit(field: FieldName, text: string): void { this.draftValues.set(field, text) }
  isDirty(): boolean { return this.size > 0 }
  hasInvalidDrafts(): boolean { return [...this.draftValues].some(([field, text]) => isSettingsFieldInvalid(field, text)) }
  hasPersistableDrafts(): boolean { return [...this.draftValues].some(([field, text]) => !isSettingsFieldInvalid(field, text)) }
  buildSubmission(): SettingsSubmission {
    const patch: EarsSettingsPatch = {}
    const drafts = new Map<FieldName, string>()
    for (const [field, text] of this.draftValues) {
      if (isSettingsFieldInvalid(field, text)) continue
      ;(patch as Record<string, unknown>)[field] = field === 'maxRecordingSeconds' && text.trim() === '' ? DEFAULT_EARS_SETTINGS.maxRecordingSeconds : parseSettingsField(field, text)
      drafts.set(field, text)
    }
    return { patch, drafts }
  }
  reconcile(submission: SettingsSubmission): void {
    for (const [field, text] of submission.drafts) if (this.draftValues.get(field) === text) this.draftValues.delete(field)
  }
  reset(): void { this.draftValues.clear() }
}
