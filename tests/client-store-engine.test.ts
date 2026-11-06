import { describe, expect, it } from 'vitest'
import { createSnapshotStore, shallowEqual } from '@deepseek-ai/dsh-client-store'
import { EarsSettingsController } from '../src/client/settings-controller.js'

/** Execute the target Host store rather than a test stub. Ears consumes its
 * observable/set/update contract; development freeze policy belongs to DSH. */

interface PanelState {
  status: 'loading' | 'ready'
  rows: { id: string; label: string; selected: boolean }[]
  meta: { revisions: number }
  /** Carried only by the initial snapshot, so the replacement case can tell a wholesale `set` from a merge. */
  legacyNotice?: string
}

function initialPanel(): PanelState {
  return {
    status: 'loading',
    rows: [{ id: 'a', label: 'first', selected: false }],
    meta: { revisions: 0 },
    legacyNotice: 'initial only'
  }
}

describe('Host platform snapshot-store engine', () => {
  it('publishes the initial snapshot, notifies on set, and stops after unsubscribe', () => {
    const store = createSnapshotStore(initialPanel())
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })

    expect(store.getSnapshot()).toEqual(initialPanel())

    const next: PanelState = { status: 'ready', rows: [], meta: { revisions: 1 } }
    store.set(next)

    // `set` replaces the snapshot wholesale, so the field that only the initial
    // state carries must be gone; a merge implementation would keep it.
    expect(store.getSnapshot()).toEqual(next)
    expect('legacyNotice' in store.getSnapshot()).toBe(false)
    expect(notifications).toBe(1)

    unsubscribe()
    store.set(initialPanel())
    expect(notifications).toBe(1)
  })

  it('skips notification when a set repeats the current value', () => {
    const store = createSnapshotStore(0)
    let notifications = 0
    store.subscribe(() => {
      notifications += 1
    })

    store.set(5)
    expect(notifications).toBe(1)

    store.set(5)
    expect(notifications).toBe(1)

    store.set(6)
    expect(notifications).toBe(2)
  })

  it('keeps notifying the remaining subscribers when one throws', () => {
    const store = createSnapshotStore(initialPanel())
    let survivor = 0
    store.subscribe(() => {
      throw new Error('subscriber failure')
    })
    store.subscribe(() => {
      survivor += 1
    })

    expect(() => {
      store.set({ status: 'ready', rows: [], meta: { revisions: 1 } })
    }).not.toThrow()
    expect(survivor).toBe(1)
  })

  it('applies a draft update and shares untouched branches by identity', () => {
    const store = createSnapshotStore(initialPanel())
    const before = store.getSnapshot()

    store.update((draft) => {
      draft.status = 'ready'
      draft.rows[0]!.selected = true
    })

    const after = store.getSnapshot()
    expect(after.status).toBe('ready')
    expect(after.rows[0]!.selected).toBe(true)
    expect(after).not.toBe(before)
    expect(after.rows).not.toBe(before.rows)
    expect(after.meta).toBe(before.meta)
  })

  it('skips notification when a draft update changes nothing', () => {
    const store = createSnapshotStore(initialPanel())
    const before = store.getSnapshot()
    let notifications = 0
    store.subscribe(() => {
      notifications += 1
    })

    store.update(() => undefined)
    store.update((draft) => {
      draft.status = 'loading'
    })

    expect(store.getSnapshot()).toBe(before)
    expect(notifications).toBe(0)

    store.update((draft) => {
      draft.meta.revisions = 1
    })
    expect(notifications).toBe(1)
  })

  it('can draft from state that a previous set deep-froze', () => {
    const store = createSnapshotStore(initialPanel())
    store.set({ status: 'ready', rows: [{ id: 'c', label: 'third', selected: false }], meta: { revisions: 3 } })
    const frozen = store.getSnapshot()

    store.update((draft) => {
      draft.rows.push({ id: 'd', label: 'fourth', selected: true })
      draft.meta.revisions = 4
    })

    expect(store.getSnapshot().rows.map((row) => row.id)).toEqual(['c', 'd'])
    expect(store.getSnapshot().meta.revisions).toBe(4)
    expect(frozen.rows.map((row) => row.id)).toEqual(['c'])
    expect(frozen.meta.revisions).toBe(3)
  })

  it('matches zustand shallow semantics for selector slices', () => {
    const shared = { nested: true }

    expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true)
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(shallowEqual({ a: shared }, { a: shared })).toBe(true)
    expect(shallowEqual({ a: { nested: true } }, { a: { nested: true } })).toBe(false)
    expect(shallowEqual([1, 2], [1, 2])).toBe(true)
    expect(shallowEqual([1, 2], [2, 1])).toBe(false)
    expect(shallowEqual(3, 3)).toBe(true)
    expect(shallowEqual(3, 4)).toBe(false)
  })

  it('serves the Qwen settings controller through the real engine', () => {
    const controller = new EarsSettingsController({} as never)
    const snapshot = controller.getSettingsStore().getSnapshot()
    expect(snapshot.localQwenModel).toBe('1.7b-8bit')
    expect(controller.getCardStore().getSnapshot().localQwenPrompt.text).toBe('')
    controller.dispose()
  })
})
