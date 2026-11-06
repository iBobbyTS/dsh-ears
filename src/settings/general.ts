export interface GeneralSettings {
  shortcut: {
    enabled: boolean
    value: string
  }
  soundsEnabled: boolean
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = Object.freeze({
  shortcut: Object.freeze({
    enabled: true,
    value: 'ctrl+shift+space'
  }),
  soundsEnabled: true
})
