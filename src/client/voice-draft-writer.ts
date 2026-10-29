/**
 * Revision-guarded owner of exactly one live ASR text span.
 *
 * Unlike setDraft(), insertText() retains Lexical reference chips, command
 * nodes and unrelated text. External edits invalidate ownership and are
 * never overwritten by a late streaming or final ASR result.
 */
import type { InputActions, TokenSpan } from '@deepseek-ai/dsh-client-ui-conversation/client'

type WriterActions = Pick<InputActions, 'captureInsertion' | 'insertText'>

export class VoiceDraftWriter {
  private readonly start: number
  private readonly end: number
  private revision: number
  private current = ''
  private applied = false
  private invalidated = false

  constructor(private readonly actions: WriterActions, selection = actions.captureInsertion()) {
    this.start = selection.start
    this.end = selection.end
    this.revision = selection.draftRev
  }

  get text(): string { return this.current }
  get isInvalidated(): boolean { return this.invalidated }

  update(text: string): boolean {
    if (this.invalidated) return false
    if (text === this.current && this.applied) return true
    const actualRevision = this.actions.captureInsertion().draftRev
    if (actualRevision !== this.revision) {
      this.invalidated = true
      return false
    }
    const span: TokenSpan = {
      start: this.start,
      end: this.applied ? this.start + this.current.length : this.end,
      draftRev: this.revision
    }
    if (!this.actions.insertText(text, span)) {
      this.invalidated = true
      return false
    }
    this.current = text
    this.applied = true
    // insertText() commits a discrete Lexical edit; capture the new revision.
    this.revision = this.actions.captureInsertion().draftRev
    return true
  }

  finalize(text: string): boolean {
    const applied = this.update(text)
    this.invalidated = true // no late audio frame can write after final
    return applied
  }

  cancel(): void {
    if (this.applied && !this.invalidated) this.update('')
    this.invalidated = true
  }
}
