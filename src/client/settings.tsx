import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutlineRegular, Input, Menu, Tooltip, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import Github from '@thesvg/react/github'
import { QWEN3_MODELS, DEFAULT_EARS_SETTINGS, settingsPageLabel, type EarsSettings } from '../config.js'
import { EMPTY_SHORTCUT_RECORDER, formatModifierChord, formatShortcut, isReservedShortcut, reduceShortcutRecorder, shortcutRejectReason } from '../shortcut.js'
import type { ShortcutModifier, ShortcutRecorderInput } from '../shortcut.js'
import type { AboutInfo, Qwen3ModelState } from '../remote-contract.js'
import type { EarsRemote } from '../remote.js'
import type { EarsCardHook, EarsSettingsHook, FieldName } from './settings-controller.js'
import type { Translate } from './settings-locale.js'
import styles from './SettingsSection.module.css'
export { LOCALE_NAMESPACE, localeEn, localeZh } from './settings-locale.js'
export type { LocaleKey, Translate } from './settings-locale.js'
interface EarsSettingsSectionProps {
  readonly remote: EarsRemote
  readonly useEarsCard: EarsCardHook
  readonly earsT: Translate
  readonly edit: (field: FieldName, text: string) => void
  readonly flush: () => void
  readonly loadAbout: () => Promise<AboutInfo | null>
}
export function createSnapshotHook<T>(store: SnapshotStore<T>, fallback: T): SnapshotSelectorHook<T> {
  return function useSnapshotStore<S>(selector: (value: T) => S): S {
    return useSyncExternalStore((listener) => store.subscribe(listener), () => selector(store.getSnapshot()), () => selector(fallback))
  }
}

export function createSettingsHook(store: SnapshotStore<EarsSettings>): EarsSettingsHook {
  return createSnapshotHook(store, DEFAULT_EARS_SETTINGS)
}

export function EarsSettingsSection(props: EarsSettingsSectionProps): ReactNode {
  const state = props.useEarsCard((snapshot) => snapshot)
  const tabsId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const flushRef = useRef(props.flush)
  flushRef.current = props.flush
  const [activeTab, setActiveTab] = useState<'general' | 'recognition' | 'about'>('general')
  const t = props.earsT
  useEffect(() => () => flushRef.current(), [])
  if (!state.available) return null
  const tabs: Array<{ id: 'general' | 'recognition' | 'about'; label: string }> = [
    { id: 'general', label: t('groupGeneral') },
    { id: 'recognition', label: t('groupRecognition') },
    { id: 'about', label: t('groupAbout') }
  ]
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{settingsPageLabel(state.settingsDisplayName.text, { plugin: t('displayNamePlugin'), voice: t('displayNameVoice') })}</h2>
      <p className={styles.intro}>{t('description')}</p>
      {state.recoveredSettingsFields?.length > 0 ? <p className={styles.notice} role="alert">{t('recoveredSettings')}</p> : null}
      {state.loadFailed ? <p className={styles.notice} role="alert">{t('loadFailed')}</p> : !state.loaded ? null : !state.writable ? <p className={styles.notice}>{t('readOnly')}</p> : state.failed ? <p className={`${styles.notice} ${styles.noticeError}`} role="alert">{t('saveFailed')}</p> : null}
      <div className={styles.tabs} role="tablist" aria-label={t('tabs')}>
        {tabs.map((tab, index) => {
          const selected = tab.id === activeTab
          return (
            <button key={tab.id} ref={(element) => { tabRefs.current[index] = element }} id={`${tabsId}-tab-${tab.id}`} type="button" role="tab" className={styles.tab} aria-selected={selected} aria-controls={`${tabsId}-panel-${tab.id}`} data-active={selected ? 'true' : undefined} tabIndex={selected ? 0 : -1}
              onClick={() => {
                setActiveTab(tab.id)
              }}
              onKeyDown={(event) => {
                let nextIndex: number
                switch (event.key) {
                  case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break
                  case 'ArrowLeft': nextIndex = (index - 1 + tabs.length) % tabs.length; break
                  case 'Home': nextIndex = 0; break
                  case 'End': nextIndex = tabs.length - 1; break
                  default: return
                }
                event.preventDefault()
                const nextTab = tabs[nextIndex]
                setActiveTab(nextTab.id)
                tabRefs.current[nextIndex]?.focus()
              }}>
              {tab.label}
            </button>
          )
        })}
      </div>
      {activeTab === 'general' ? (
        <div id={`${tabsId}-panel-general`} role="tabpanel" aria-labelledby={`${tabsId}-tab-general`} className={styles.panel}>
          <SelectRow label={t('displayName')} hint={t('displayNameHint')} value={state.settingsDisplayName.text} options={[['dsh-ears', t('displayNamePlugin')], ['voice', t('displayNameVoice')]]} disabled={!state.writable} invalid={state.settingsDisplayName.invalid} onChange={(value) => props.edit('settingsDisplayName', value)} />
          <SelectRow label={t('shortcutEnabled')} hint={t('shortcutEnabledHint')} value={state.voiceShortcutEnabled.text} options={[['on', t('enabledOn')], ['off', t('enabledOff')]]} disabled={!state.writable} invalid={state.voiceShortcutEnabled.invalid} onChange={(value) => props.edit('voiceShortcutEnabled', value)} />
          {state.voiceShortcutEnabled.text === 'on' ? (
            <ShortcutRecorderRow label={t('shortcut')} hint={t('shortcutHint')} value={state.voiceShortcut.text} disabled={!state.writable} invalid={state.voiceShortcut.invalid} onChange={(value) => props.edit('voiceShortcut', value)} onReset={() => props.edit('voiceShortcut', DEFAULT_EARS_SETTINGS.voiceShortcut)} t={t} />
          ) : null}
          <SelectRow label={t('soundsEnabled')} hint={t('soundsEnabledHint')} value={state.voiceSoundsEnabled.text} options={[['on', t('enabledOn')], ['off', t('enabledOff')]]} disabled={!state.writable} invalid={state.voiceSoundsEnabled.invalid} onChange={(value) => props.edit('voiceSoundsEnabled', value)} />
          <TextRow label={t('recordingLimit')} hint={t('recordingLimitHint')} value={state.maxRecordingSeconds.text} disabled={!state.writable} invalid={state.maxRecordingSeconds.invalid} numeric onChange={(event) => props.edit('maxRecordingSeconds', event.target.value)} onBlur={props.flush} />
        </div>
      ) : activeTab === 'recognition' ? (
        <div id={`${tabsId}-panel-recognition`} role="tabpanel" aria-labelledby={`${tabsId}-tab-recognition`} className={styles.panel}>
            <SelectRow label={t('qwenModelLabel')} hint={t('backendHintLocalQwen')} value={state.localQwenModel.text} options={QWEN3_MODELS.map((model) => [model, model] as [string, string])} disabled={!state.writable} invalid={state.localQwenModel.invalid} onChange={(value) => props.edit('localQwenModel', value)} />
            <TextRow label={t('qwenTtlLabel')} hint={t('qwenTtlHint')} value={state.localQwenIdleTtlMinutes.text} disabled={!state.writable} invalid={state.localQwenIdleTtlMinutes.invalid} numeric onChange={(event) => props.edit('localQwenIdleTtlMinutes', event.target.value)} onBlur={props.flush} />
            <TextRow label={t('qwenPromptLabel')} hint={t('qwenPromptHint')} value={state.localQwenPrompt.text} placeholder={t('qwenPromptPlaceholder')} disabled={!state.writable} invalid={state.localQwenPrompt.invalid} onChange={(event) => props.edit('localQwenPrompt', event.target.value)} onBlur={props.flush} />
            <QwenModelManager remote={props.remote} model={state.localQwenModel.text} t={t} flush={props.flush} />
        </div>
      ) : (
        <div id={`${tabsId}-panel-about`} role="tabpanel" aria-labelledby={`${tabsId}-tab-about`} className={styles.panel}>
          <AboutPanel t={t} loadAbout={props.loadAbout} />
        </div>
      )}
    </section>
  )
}

function AboutPanel({ t, loadAbout }: { t: Translate; loadAbout: () => Promise<AboutInfo | null> }) {
  const [about, setAbout] = useState<AboutInfo | null>(null)
  const loadAboutRef = useRef(loadAbout)
  loadAboutRef.current = loadAbout
  useEffect(() => {
    let cancelled = false
    void loadAboutRef.current().then((value) => {
      if (!cancelled) setAbout(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return (
    <>
      <RowField label={t('aboutRepository')} hint="">
        {about === null ? <span className={styles.aboutValue}>—</span> : (
          <a className={styles.aboutRepo} href={about.repository} target="_blank" rel="noreferrer">
            <Github variant="mono" width={16} height={16} className={styles.aboutRepoIcon} aria-hidden="true" />
            <span>{about.repositorySlug}</span>
          </a>
        )}
      </RowField>
      <ValueRow label={t('aboutVersion')} value={about?.version ?? '—'} />
      <ValueRow label={t('aboutLicense')} value={about?.license ?? '—'} />
      <ValueRow label={t('aboutCompat')} value={about?.dshCompatibility ?? '—'} />
      <RowField label={t('aboutUpdates')} hint={t('aboutUpdatesHint')}>
        {about === null ? null : <a className={styles.linkButton} href={`${about.repository}#install`} target="_blank" rel="noreferrer">{t('aboutUpdatesLink')}</a>}
      </RowField>
    </>
  )
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <RowField label={label} hint="">
      <span className={styles.aboutValue}>{value}</span>
    </RowField>
  )
}

function RowField({ label, hint, invalid, alert, warn, wide = false, children }: { label: string; hint: string; invalid?: boolean; alert?: boolean; warn?: boolean; wide?: boolean; children: ReactNode }) {
  const showHint = hint !== ''
  const markInvalid = invalid === true
  return (
    <div className={`${styles.row} ${wide ? styles.rowWide : ''}`}>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{label}</div>
        {showHint ? <div className={`${styles.rowDesc} ${markInvalid ? styles.invalid : ''} ${warn === true ? styles.warning : ''}`} {...(alert === true || markInvalid ? { role: 'alert' } : {})}>{hint}</div> : null}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  )
}

const SHORTCUT_PLATFORM: 'mac' | 'win' | 'linux' = (() => {
  const raw = typeof navigator === 'undefined' ? '' : ((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '')
  const platform = raw.toLowerCase()
  if (platform.includes('mac')) return 'mac'
  if (platform.includes('win')) return 'win'
  return 'linux'
})()

function recorderInput(type: 'keydown' | 'keyup', event: KeyboardEvent): ShortcutRecorderInput {
  return {
    type,
    key: event.key,
    code: event.code,
    repeat: event.repeat,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    getModifierState: (name) => event.getModifierState(name)
  }
}

function ShortcutRecorderRow({ label, hint, value, disabled, invalid, onChange, onReset, t }: { label: string; hint: string; value: string; disabled: boolean; invalid: boolean; onChange: (value: string) => void; onReset: () => void; t: Translate }) {
  const [capturing, setCapturing] = useState(false)
  const [pressedModifiers, setPressedModifiers] = useState<readonly ShortcutModifier[]>([])
  const recorderRef = useRef(EMPTY_SHORTCUT_RECORDER)
  const reason = shortcutRejectReason(value)
  const invalidText = reason === 'typing-key' ? t('shortcutInvalidTypingKey') : reason === 'invalid' ? t('shortcutInvalidFormat') : null
  const reserved = !invalid && isReservedShortcut(value)
  const customized = !capturing && value !== DEFAULT_EARS_SETTINGS.voiceShortcut
  useEffect(() => {
    if (!capturing) return
    recorderRef.current = EMPTY_SHORTCUT_RECORDER
    const apply = (event: KeyboardEvent, type: 'keydown' | 'keyup') => {
      const decision = reduceShortcutRecorder(recorderRef.current, recorderInput(type, event))
      recorderRef.current = decision.state
      if (decision.kind === 'ignore') return
      if (decision.kind === 'update') {
        setPressedModifiers(decision.state.held)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setPressedModifiers([])
      setCapturing(false)
      if (decision.kind === 'commit') onChange(decision.chord)
    }
    const onKeyDown = (event: KeyboardEvent) => apply(event, 'keydown')
    const onKeyUp = (event: KeyboardEvent) => apply(event, 'keyup')
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [capturing, onChange])
  const displayedHint = capturing ? t('shortcutCaptureHint') : invalidText !== null ? invalidText : reserved ? t('shortcutReserved') : hint
  const captureLabel = pressedModifiers.length > 0 ? formatModifierChord(pressedModifiers, SHORTCUT_PLATFORM) : t('shortcutCapture')
  return (
    <RowField label={label} hint={displayedHint} invalid={invalid} alert={invalidText !== null} warn={!invalid && reserved && !capturing}>
      <div className={styles.shortcutControl}>
        <button
          type="button"
          className={`${styles.selector} ${customized ? styles.selectorHasReset : ''}`}
          aria-label={label}
          aria-invalid={invalid}
          disabled={disabled}
          onClick={() => setCapturing((current) => !current)}
        >
          <span className={styles.selectorLabel}>{capturing ? captureLabel : formatShortcut(value, SHORTCUT_PLATFORM)}</span>
        </button>
        {customized ? (
          <button type="button" className={styles.shortcutAction} disabled={disabled} onClick={onReset}>{t('shortcutClear')}</button>
        ) : null}
      </div>
    </RowField>
  )
}

function SelectRow({ label, hint, value, options, entries, placeholder, disabled, invalid, valueTooltip = false, onChange }: { label: string; hint: string; value: string; options?: [string, string][]; entries?: readonly MenuEntry[]; placeholder?: string; disabled: boolean; invalid: boolean; /** Opt-in: hovering an option reveals its raw wire value in the shared tooltip. */ valueTooltip?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const menuItems: readonly MenuEntry[] = entries ?? (options ?? []).map(([id, optionLabel]) => ({ id, label: optionLabel }))
  const selected = menuItems.find((item): item is Extract<MenuEntry, { id: string; label: ReactNode }> => !('type' in item) && item.id === value)
  const labelText = selected === undefined ? (value === '' && placeholder !== undefined ? placeholder : value) : selected.label
  // A friendly option label hides the wire value; fields that opt in reveal
  // the raw identifier (a resource id, for example) through the shared
  // tooltip while the dropdown is open.
  const items: readonly MenuEntry[] = valueTooltip
    ? menuItems.map((item) => {
        if ('type' in item || item.label === item.id) return item
        return { ...item, label: <Tooltip label={item.id} side="top" delayMs={200}><span>{item.label}</span></Tooltip> }
      })
    : menuItems
  return (
    <RowField label={label} hint={hint} invalid={invalid}>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        selectedId={value}
        onSelect={(id) => {
          setOpen(false)
          if (id === value) return
          onChange(id)
        }}
        align="end"
        portal
        anchor={
          <button type="button" className={styles.selector} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-invalid={invalid} disabled={disabled} onClick={() => setOpen((current) => !current)}>
            <span className={styles.selectorLabel}>{labelText}</span>
            <IconChevronDownOutlineRegular className={styles.chevron} />
          </button>
        }
      />
    </RowField>
  )
}

function TextRow({ label, hint, value, disabled, invalid, numeric, placeholder, onChange, onBlur }: { label: string; hint: string; value: string; disabled: boolean; invalid: boolean; numeric?: boolean; placeholder?: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onBlur?: () => void }) {
  return (
    <RowField label={label} hint={hint} invalid={invalid}>
      <Input className={styles.textInput} type={numeric ? 'number' : 'text'} value={value} placeholder={placeholder} disabled={disabled} aria-label={label} aria-invalid={invalid} onChange={onChange} onBlur={onBlur} />
    </RowField>
  )
}

function QwenModelManager({ remote, model, t, flush }: {
  remote: EarsRemote
  model: string
  t: Translate
  flush: () => void
}) {
  const [status, setStatus] = useState<Qwen3ModelState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    let live = true
    setStatus(null)
    setError(null)
    setConfirmDelete(false)
    const refresh = async () => {
      try {
        const result = await remote.getQwenModelState(model)
        if (live) {
          if (result.ok) setStatus(result.value)
          else setError(result.error.message)
        }
      } catch (problem) {
        if (live) setError(problem instanceof Error ? problem.message : String(problem))
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 1500)
    return () => { live = false; clearInterval(timer) }
  }, [remote, model])

  const action = async (method: 'downloadQwenModel' | 'cancelQwenModelDownload' | 'deleteQwenModel' | 'startQwenService' | 'unloadQwenService') => {
    if (busy) return
    flush()
    setBusy(true)
    setError(null)
    try {
      const result = await remote[method](model)
      if (!result.ok) throw new Error(result.error.message)
      setStatus(result.value)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setBusy(false)
    }
  }
  const phase = status?.phase === 'runtime' ? t('qwenRuntimePhase') : t('qwenWeightsPhase')
  const message = status === null ? t('qwenChecking')
    : !status.supported ? t('qwenUnsupported')
      : status.downloading ? t('qwenDownloading', { phase })
        : status.loaded ? t('qwenLoaded', { count: status.activeSessions })
          : status.downloaded ? t('qwenDownloaded') + ' · ' + t('qwenUnloaded')
            : t('qwenNotDownloaded')
  return <div className={styles.row}>
    <div className={styles.rowText}>
      <div className={styles.rowTitle}>{t('localQwenBackend')}</div>
      <div className={styles.rowDesc}>{message}</div>
      {status?.expiresAt ? <div className={styles.rowDesc}>{t('qwenExpires', { time: new Date(status.expiresAt).toLocaleTimeString() })}</div> : null}
      {error ?? status?.error ? <div className={styles.statusError} role="alert">{error ?? status?.error}</div> : null}
      <div className={styles.rowDescInline}>
        {status?.supported && (!status.downloaded || !status.runtimeInstalled) && !status.downloading ? (
          <button type="button" className={styles.linkButton} disabled={busy} onClick={() => void action('downloadQwenModel')}>{t('qwenDownload')}</button>
        ) : null}
        {status?.downloading ? (
          <button type="button" className={styles.linkButton} disabled={busy} onClick={() => void action('cancelQwenModelDownload')}>{t('qwenCancel')}</button>
        ) : null}
        {status?.downloaded && !status.loaded ? (
          <button type="button" className={styles.linkButton} disabled={busy} onClick={() => void action('startQwenService')}>{t('qwenStart')}</button>
        ) : null}
        {status?.loaded ? (
          <button type="button" className={styles.linkButton} disabled={busy || status.activeSessions > 0} onClick={() => void action('unloadQwenService')}>{t('qwenUnload')}</button>
        ) : null}
        {status?.downloaded ? (
          <button type="button" className={styles.linkButton} disabled={busy || status.activeSessions > 0} onClick={() => {
            if (!confirmDelete) { setConfirmDelete(true); return }
            setConfirmDelete(false)
            void action('deleteQwenModel')
          }}>{confirmDelete ? t('qwenDeleteConfirm') : t('qwenDelete')}</button>
        ) : null}
      </div>
    </div>
  </div>
}
