import { describe, expect, it } from 'vitest'
import { isSupersededMediaCapture, reuseInFlightPromise } from '../src/client/voice-capture.js'
describe('Qwen capture generations and stop deduplication', () => {
  it('distinguishes a superseded capture', () => {
    expect(isSupersededMediaCapture(2, 1)).toBe(true)
    expect(isSupersededMediaCapture(2, 2)).toBe(false)
  })
  it('deduplicates a stop per capture and clears on completion', async () => {
    let resolve!: (value: number) => void
    const pending = new Promise<number>((yes) => { resolve = yes })
    const ref = { current: null as { key: string; promise: Promise<number> } | null }
    const first = reuseInFlightPromise(ref, 'capture', () => pending)
    expect(reuseInFlightPromise(ref, 'capture', () => Promise.resolve(2))).toBe(first)
    resolve(1)
    await first
    expect(ref.current).toBeNull()
  })
})
