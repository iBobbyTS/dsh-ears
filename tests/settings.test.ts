import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { EarsSettingsController, SETTINGS_SAVE_DEBOUNCE_MS } from '../src/client/settings-controller.js'
import type { EarsRemote } from '../src/remote.js'
afterEach(() => vi.useRealTimers())
function setup() {
  let settings = { ...DEFAULT_EARS_SETTINGS, localQwenModel: '0.6b-8bit', localQwenPrompt: 'Context', voiceSoundsEnabled: false }
  const view = () => ({ available: true, writable: true, settings, overridden: [] })
  const updateSettings = vi.fn(async (patch) => { settings = { ...settings, ...patch }; return { ok: true, value: view() } })
  const controller = new EarsSettingsController({ getSettings: async () => ({ ok: true, value: view() }), updateSettings } as unknown as EarsRemote)
  return { controller, updateSettings }
}
describe('retained Qwen settings autosave', () => {
  it('saves a valid field independently from an invalid draft and retains other options', async () => {
    vi.useFakeTimers()
    const { controller, updateSettings } = setup()
    await controller.refreshSettings()
    controller.actions().edit('localQwenIdleTtlMinutes', '0')
    controller.actions().edit('localQwenPrompt', '')
    await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DEBOUNCE_MS)
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ localQwenPrompt: '' })
    expect(controller.getSettingsStore().getSnapshot()).toMatchObject({ localQwenModel: '0.6b-8bit', localQwenPrompt: '', voiceSoundsEnabled: false })
    expect(controller.getCardStore().getSnapshot().localQwenIdleTtlMinutes).toMatchObject({ text: '0', invalid: true })
    controller.dispose()
  })
  it('retains newer edits during an in-flight save and sends them next', async () => {
    vi.useFakeTimers()
    const { controller, updateSettings } = setup()
    await controller.refreshSettings()
    let complete!: (value: unknown) => void
    updateSettings.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }) as never)
    controller.actions().edit('localQwenPrompt', 'first')
    await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DEBOUNCE_MS)
    controller.actions().edit('localQwenPrompt', 'second')
    complete({ ok: true, value: { available: true, writable: true, settings: { ...DEFAULT_EARS_SETTINGS, localQwenPrompt: 'first' }, overridden: [] } })
    await vi.advanceTimersByTimeAsync(0)
    expect(updateSettings.mock.calls.map(([patch]) => patch)).toEqual([{ localQwenPrompt: 'first' }, { localQwenPrompt: 'second' }])
    expect(controller.getCardStore().getSnapshot().dirty).toBe(false)
    controller.dispose()
  })
  it('keeps drafts after a failed save', async () => {
    vi.useFakeTimers()
    const { controller, updateSettings } = setup()
    await controller.refreshSettings()
    updateSettings.mockRejectedValueOnce(new Error('offline'))
    controller.actions().edit('voiceSoundsEnabled', 'on')
    await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DEBOUNCE_MS)
    expect(controller.getCardStore().getSnapshot()).toMatchObject({ failed: true, dirty: true, voiceSoundsEnabled: { text: 'on' } })
    controller.dispose()
  })
})
