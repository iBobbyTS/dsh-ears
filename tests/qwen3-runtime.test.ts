import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import {
  Qwen3Runtime, qwenCacheRoot, qwenModelPath, validQwen3Model, validQwen3TTL
} from '../src/asr/qwen3-runtime.js'

describe('managed Qwen3-ASR', () => {
  it('only accepts explicit model identifiers (no path traversal)', () => {
    expect(validQwen3Model('1.7b-8bit')).toBe(true)
    expect(validQwen3Model('0.6b-8bit')).toBe(true)
    expect(validQwen3Model('../../somewhere')).toBe(false)
    expect(qwenModelPath('1.7b-8bit', '/cache')).toBe(join('/cache', 'models', '1.7b-8bit'))
  })

  it('uses a private cache and a bounded idle TTL', () => {
    expect(qwenCacheRoot('darwin', '/home/test')).toBe(join('/home/test', 'Library', 'Caches', 'dsh-ears', 'qwen3'))
    expect(validQwen3TTL(60)).toBe(true)
    expect(validQwen3TTL(1)).toBe(true)
    expect(validQwen3TTL(1440)).toBe(true)
    expect(validQwen3TTL(0)).toBe(false)
    expect(validQwen3TTL(1.25)).toBe(false)
    expect(validQwen3TTL(1441)).toBe(false)
  })

  it('unloads only after 60 idle minutes and never while sessions are active', () => {
    vi.useFakeTimers()
    const runtime = new Qwen3Runtime('/dummy/for-timers')
    const kill = vi.fn()
    const details = runtime as unknown as {
      child: unknown
      active: Set<string>
      workerModel: string | undefined
      armIdle(): void
    }
    details.child = { stdin: { end: vi.fn() }, kill, once: vi.fn() }
    details.workerModel = '1.7b-8bit'
    try {
      details.active.add('recording')
      details.armIdle()
      vi.advanceTimersByTime(3_600_000)
      expect(kill).not.toHaveBeenCalled()
      details.active.delete('recording')
      details.armIdle()
      vi.advanceTimersByTime(3_599_999)
      expect(kill).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(kill).toHaveBeenCalledWith('SIGTERM')
      expect(details.workerModel).toBeUndefined()
    } finally {
      runtime.dispose()
      vi.useRealTimers()
    }
  })
  it('does not claim a missing model was installed', async () => {
    const runtime = new Qwen3Runtime('/nonexistent/dsh-ears-qwen3-unit-test')
    try {
      const state = await runtime.state('1.7b-8bit')
      expect(state.downloaded).toBe(false)
      expect(state.loaded).toBe(false)
      expect(state.downloading).toBe(false)
      expect(state.ttlMinutes).toBe(60)
      await expect(runtime.state('../../unsafe')).rejects.toThrow('Unknown')
      await expect(runtime.load('../../unsafe')).rejects.toThrow('Unknown')
    } finally {
      runtime.dispose()
    }
  })
})
