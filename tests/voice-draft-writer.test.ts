import { describe, expect, it } from 'vitest'
import { VoiceDraftWriter } from '../src/client/voice-draft-writer.js'

function fakeEditor(initial = 'before ', initialRev = 1) {
  let text = initial
  let revision = initialRev
  let cursor = text.length
  return {
    actions: {
      captureInsertion: () => ({ start: cursor, end: cursor, draftRev: revision }),
      insertText: (value: string, span: { start: number; end: number; draftRev: number }) => {
        if (span.draftRev !== revision) return false
        text = text.slice(0, span.start) + value + text.slice(span.end)
        revision++
        cursor = span.start + value.length
        return true
      }
    },
    value: () => text,
    userEdit: (value: string) => { text += value; revision++ }
  }
}

describe('VoiceDraftWriter', () => {
  it('replaces rather than appends a revised transcription', () => {
    const editor = fakeEditor()
    const writer = new VoiceDraftWriter(editor.actions)
    expect(writer.update('use effect')).toBe(true)
    expect(writer.update('useEffect')).toBe(true)
    expect(editor.value()).toBe('before useEffect')
    expect(writer.finalize('useEffect hook')).toBe(true)
    expect(editor.value()).toBe('before useEffect hook')
    expect(writer.update('late audio')).toBe(false)
  })

  it('does not overwrite manual edits after interim output', () => {
    const editor = fakeEditor()
    const writer = new VoiceDraftWriter(editor.actions)
    expect(writer.update('draft')).toBe(true)
    editor.userEdit(' typed')
    expect(writer.finalize('new ASR value')).toBe(false)
    expect(editor.value()).toBe('before draft typed')
  })

  it('removes only the owned preview when cancelled', () => {
    const editor = fakeEditor()
    const writer = new VoiceDraftWriter(editor.actions)
    writer.update('bad recognition')
    writer.cancel()
    expect(editor.value()).toBe('before ')
  })

  it('does not delete selected human text through speculative ASR', () => {
    const editor = fakeEditor('important source code')
    const selection = { start: 10, end: 16, draftRev: 1 }
    const writer = new VoiceDraftWriter(editor.actions, selection)
    expect(writer.update('speech')).toBe(false)
    expect(editor.value()).toBe('important source code')
  })
  it('preserves edits made before the first ASR hypothesis', () => {
    const editor = fakeEditor()
    const writer = new VoiceDraftWriter(editor.actions)
    editor.userEdit('manual')
    expect(writer.update('ASR')).toBe(false)
    expect(editor.value()).toBe('before manual')
  })
})
