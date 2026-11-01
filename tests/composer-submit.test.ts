import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeComposerSubmission } from '../src/client/composer-submit.js'

class ElementStub {
  textContent = ''
  isConnected = true
  disabled = false
  ariaDisabled: string | null = null
  parent: ElementStub | null = null
  children: ElementStub[] = []
  readonly listeners = new Map<string, EventListener>()
  constructor(readonly kind: 'card' | 'editor' | 'button' | 'icon') {}
  append(child: ElementStub) { child.parent = this; this.children.push(child); return child }
  closest(selector: string): ElementStub | null {
    if ((selector === '[data-composer-card]' && this.kind === 'card') || (selector === 'button' && this.kind === 'button')) return this
    return this.parent?.closest(selector) ?? null
  }
  querySelector() { return this.children.find((child) => child.kind === 'editor') ?? null }
  contains(target: ElementStub): boolean { return target === this || this.children.some((child) => child.contains(target)) }
  getAttribute() { return this.ariaDisabled }
  addEventListener(type: string, listener: EventListener) { this.listeners.set(type, listener) }
  removeEventListener(type: string) { this.listeners.delete(type) }
}

function setup() {
  vi.stubGlobal('Element', ElementStub)
  const card = new ElementStub('card')
  const editor = card.append(new ElementStub('editor'))
  editor.textContent = 'recognized speech'
  const microphone = card.append(new ElementStub('button'))
  const send = card.append(new ElementStub('button'))
  const icon = send.append(new ElementStub('icon'))
  let revision = 1
  const submitted = vi.fn()
  const dispose = observeComposerSubmission(microphone as unknown as HTMLElement, {
    captureInsertion: () => ({ start: 0, end: 0, draftRev: revision })
  }, submitted)
  const gesture = (type: string, values: Record<string, unknown> = {}) => {
    card.listeners.get(type)?.({ type, target: type === 'click' ? icon : editor, key: 'Enter', ...values } as unknown as Event)
  }
  const consume = () => { editor.textContent = ''; revision++ }
  const settle = async () => { await Promise.resolve(); await Promise.resolve() }
  return { card, editor, send, submitted, dispose, gesture, consume, settle, revise: () => revision++ }
}

afterEach(() => vi.unstubAllGlobals())

describe('composer submission observation', () => {
  it.each(['keydown', 'click'])('observes a real %s send without intercepting or resending it', async (type) => {
    const app = setup()
    app.gesture(type)
    expect(app.submitted).not.toHaveBeenCalled()
    app.consume() // Host submit owns the actual clear and revision change.
    await app.settle()
    expect(app.submitted).toHaveBeenCalledOnce()
    app.dispose()
  })

  it('waits for the host editor commit queued by the event handler', async () => {
    const app = setup()
    app.gesture('keydown')
    queueMicrotask(app.consume)
    await app.settle()
    expect(app.submitted).toHaveBeenCalledOnce()
  })

  it.each([
    { shiftKey: true }, { isComposing: true }, { keyCode: 229 }, { repeat: true }, { key: 'Backspace' }
  ])('ignores non-submit keyboard input %j', async (values) => {
    const app = setup()
    app.gesture('keydown', values)
    app.consume()
    await app.settle()
    expect(app.submitted).not.toHaveBeenCalled()
  })

  it('ignores popup selection, blocked sends and newline edits that retain the draft', async () => {
    const app = setup()
    app.gesture('keydown')
    app.editor.textContent = 'selected completion'
    app.revise()
    await app.settle()
    app.gesture('click')
    await app.settle()
    expect(app.submitted).not.toHaveBeenCalled()
  })

  it('ignores manual clearing and empty Enter', async () => {
    const app = setup()
    app.consume()
    await app.settle()
    app.gesture('keydown')
    app.revise()
    await app.settle()
    expect(app.submitted).not.toHaveBeenCalled()
  })

  it('requires a semantic editor revision as well as an empty DOM', async () => {
    const app = setup()
    app.gesture('click')
    app.editor.textContent = ''
    await app.settle()
    expect(app.submitted).not.toHaveBeenCalled()
  })

  it.each(['disabled', 'aria-disabled'])('ignores %s controls', async (kind) => {
    const app = setup()
    if (kind === 'disabled') app.send.disabled = true
    else app.send.ariaDisabled = 'true'
    app.gesture('click')
    app.consume()
    await app.settle()
    expect(app.submitted).not.toHaveBeenCalled()
  })

  it('ignores other composers and Enter outside the editor', async () => {
    const app = setup()
    const other = new ElementStub('card').append(new ElementStub('editor'))
    app.gesture('keydown', { target: other })
    app.gesture('keydown', { target: app.send })
    app.consume()
    await app.settle()
    expect(app.submitted).not.toHaveBeenCalled()
  })

  it('cancels a pending observation on unmount', async () => {
    const app = setup()
    app.gesture('click')
    app.consume()
    app.dispose()
    await app.settle()
    expect(app.submitted).not.toHaveBeenCalled()
    expect(app.card.listeners.size).toBe(0)
  })
})
