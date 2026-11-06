import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { DEFAULT_EARS_SETTINGS, type EarsSettings } from '../config.js'
import { isSettingsFieldInvalid, type FieldName } from './settings-fields.js'
import type { EarsSettingsView, AboutInfo, UpdateCheckResult } from '../remote-contract.js'
import type { EarsRemote } from '../remote.js'
import { SettingsDraftController } from './settings-draft-controller.js'
export type { FieldName } from './settings-fields.js'
export const SETTINGS_SAVE_DEBOUNCE_MS = 400
interface FieldState { text: string; overridden: boolean; invalid: boolean }
export type EarsCardState = Record<keyof EarsSettings, FieldState> & {
  available: boolean; writable: boolean; loaded: boolean; loadFailed: boolean;
  recoveredSettingsFields: readonly string[]; saving: boolean; failed: boolean; dirty: boolean; invalid: boolean
}
export type EarsSettingsHook = SnapshotSelectorHook<EarsSettings>
export type EarsCardHook = SnapshotSelectorHook<EarsCardState>
export class EarsSettingsController {
  private readonly settingsStore = createSnapshotStore(DEFAULT_EARS_SETTINGS)
  private readonly cardStore: SnapshotStore<EarsCardState>
  private readonly draftsController = new SettingsDraftController()
  private settingsView: EarsSettingsView = { available: true, writable: false, settings: DEFAULT_EARS_SETTINGS, overridden: [] }
  private disposed = false
  private settingsRequest = 0
  private loaded = false
  private loadFailed = false
  private retryAttempted = false
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private saving = false
  private saveQueued = false
  private failed = false
  private draftRevision = 0
  constructor(private readonly remote: EarsRemote) { this.cardStore = createSnapshotStore(this.snapshot()) }
  getSettingsStore(): SnapshotStore<EarsSettings> { return this.settingsStore }
  getCardStore(): SnapshotStore<EarsCardState> { return this.cardStore }
  actions() { return {
    edit: (field: FieldName, text: string) => this.edit(field, text), flush: () => void this.save(),
    save: () => void this.save(), discard: () => this.discard(), loadAbout: () => this.loadAbout(), checkForUpdate: () => this.checkForUpdate()
  } }
  dispose(): void {
    this.disposed = true
    this.settingsRequest += 1
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer)
    this.cancelScheduledSave()
  }
  async refreshSettings(): Promise<void> {
    if (this.disposed) return
    const request = ++this.settingsRequest
    try {
      const result = await this.remote.getSettings()
      if (this.disposed || request !== this.settingsRequest) return
      if (result.ok) {
        this.settingsView = result.value
        this.settingsStore.set(result.value.settings)
        this.loaded = true
        this.loadFailed = false
        this.retryAttempted = false
        if (this.retryTimer !== undefined) clearTimeout(this.retryTimer)
        this.retryTimer = undefined
        this.publishCard()
        return
      }
    } catch {
      // Fall through to the not-loaded retry path.
    }
    if (this.disposed || request !== this.settingsRequest) return
    if (!this.loaded && this.retryAttempted) this.loadFailed = true
    this.publishCard()
    if (!this.loaded && !this.retryAttempted && this.retryTimer === undefined) {
      this.retryAttempted = true
      this.retryTimer = setTimeout(() => {
        this.retryTimer = undefined
        void this.refreshSettings()
      }, 1500)
    }
  }

  async loadAbout(): Promise<AboutInfo | null> {
    if (this.disposed) return null
    const result = await this.remote.getAbout()
    return result.ok ? result.value : null
  }

  async checkForUpdate(): Promise<UpdateCheckResult> {
    const fallback: UpdateCheckResult = {
      status: 'error',
      installed: '',
      latest: null
    }
    if (this.disposed) return fallback
    const result = await this.remote.checkForUpdate()
    return result.ok ? result.value : fallback
  }

  private edit(field: FieldName, text: string): void {
    if (this.disposed || !this.settingsView.writable) return
    this.draftRevision += 1
    this.draftsController.edit(field, text)
    this.failed = false
    this.publishCard()
    this.cancelScheduledSave()
    this.saveTimer = setTimeout(() => { this.saveTimer = undefined; void this.save() }, SETTINGS_SAVE_DEBOUNCE_MS)
  }
  private discard(): void {
    if (this.disposed) return
    this.draftRevision += 1
    this.cancelScheduledSave()
    this.saveQueued = false
    this.draftsController.reset()
    this.failed = false
    this.publishCard()
  }
  private cancelScheduledSave(): void {
    if (this.saveTimer === undefined) return
    clearTimeout(this.saveTimer)
    this.saveTimer = undefined
  }

  private async save(): Promise<void> {
    this.cancelScheduledSave()
    if (this.disposed || !this.settingsView.writable) return
    if (this.saving) {
      this.saveQueued = true
      return
    }
    const submission = this.draftsController.buildSubmission()
    const { patch } = submission
    if (Object.keys(patch).length === 0) return
    const submissionRevision = this.draftRevision
    this.saving = true
    this.saveQueued = false
    this.failed = false
    this.publishCard()
    try {
      const result = await this.remote.updateSettings(patch)
      if (!result.ok) throw new Error('dsh-ears settings update failed')
      if (this.disposed) return
      this.settingsView = result.value
      this.settingsStore.set(result.value.settings)
      this.draftsController.reconcile(submission)
    } catch {
      // A newer draft supersedes this request. Keep it eligible for the
      // queued save instead of painting the newer state as failed because an
      // older submission was rejected.
      if (!this.disposed && submissionRevision === this.draftRevision) this.failed = true
    } finally {
      this.saving = false
      if (this.disposed) return
      this.publishCard()
      if (!this.failed && (this.saveQueued || this.hasPersistableDrafts())) {
        this.saveQueued = false
        void this.save()
      }
    }
  }

  private hasPersistableDrafts(): boolean { return this.draftsController.hasPersistableDrafts() }
  private publishCard(): void { this.cardStore.set(this.snapshot()) }
  private snapshot(): EarsCardState {
    const fields = {} as Record<keyof EarsSettings, FieldState>
    for (const field of Object.keys(DEFAULT_EARS_SETTINGS) as (keyof EarsSettings)[]) {
      const value = this.settingsView.settings[field]
      const text = this.draftsController.get(field) ?? (typeof value === 'boolean' ? value ? 'on' : 'off' : String(value))
      fields[field] = { text, overridden: this.settingsView.overridden.includes(field), invalid: this.draftsController.has(field) && isSettingsFieldInvalid(field, text) }
    }
    return { ...fields, available: this.settingsView.available, writable: this.settingsView.writable, loaded: this.loaded, loadFailed: this.loadFailed,
      recoveredSettingsFields: this.settingsView.recoveredSettingsFields ?? [], saving: this.saving, failed: this.failed, dirty: this.draftsController.isDirty(), invalid: Object.values(fields).some((field) => field.invalid) }
  }
}
