import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client'

/**
 * Observe the host consuming a draft without intercepting its send operation.
 * Ordinary sends stay in phase `plain`, and the public input facade has no
 * submission event. Keep this DOM adapter scoped to the owning composer and
 * require both a send gesture and the editor's revision-guarded clear.
 */
export function observeComposerSubmission(
  microphone: HTMLElement,
  actions: Pick<InputActions, 'captureInsertion'>,
  submitted: () => void
): () => void {
  const card = microphone.closest('[data-composer-card]')
  if (card === null) return () => undefined
  let disposed = false
  const observe = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest('[data-composer-card]') !== card) return
    const editor = card.querySelector('[data-lexical-editor="true"][role="textbox"]')
    if (editor === null) return
    if (event.type === 'keydown') {
      const key = event as KeyboardEvent
      if (key.key !== 'Enter' || key.shiftKey || key.isComposing || key.keyCode === 229 || key.repeat || !editor.contains(target)) return
    } else {
      const button = target.closest('button')
      if (button === null || button.disabled || button.getAttribute('aria-disabled') === 'true') return
    }
    // Empty Enter is a host no-op, not a send. Newlines and menu choices may
    // change the revision but do not consume the entire editor document.
    if ((editor.textContent ?? '').trim() === '') return
    const revision = actions.captureInsertion().draftRev
    // Capture runs before the host's handlers. Let any Lexical commit queued
    // by those handlers flush before inspecting its semantic revision and DOM.
    queueMicrotask(() => queueMicrotask(() => {
      if (disposed || !card.isConnected || !card.contains(editor)) return
      if (actions.captureInsertion().draftRev === revision || (editor.textContent ?? '') !== '') return
      submitted()
    }))
  }
  card.addEventListener('keydown', observe, true)
  card.addEventListener('click', observe, true)
  return () => {
    disposed = true
    card.removeEventListener('keydown', observe, true)
    card.removeEventListener('click', observe, true)
  }
}
