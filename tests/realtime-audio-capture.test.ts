import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRealtimeAudioCaptureAvailable, RealtimeAudioCaptureSession } from '../src/client/realtime-audio-capture.js'

class FakeTrack {
  readonly stop = vi.fn()
}

class FakeStream {
  readonly track = new FakeTrack()

  getTracks(): FakeTrack[] {
    return [this.track]
  }
}

class FakeNode {
  readonly connect = vi.fn()
  readonly disconnect = vi.fn()
}

class FakeProcessor extends FakeNode {
  onaudioprocess: ((event: { inputBuffer: { sampleRate: number; getChannelData(channel: number): Float32Array } }) => void) | null = null
}

class FakeAudioContext {
  readonly destination = {}
  readonly source = new FakeNode()
  readonly processor = new FakeProcessor()
  readonly sink = Object.assign(new FakeNode(), { gain: { value: 1 } })
  readonly resume = vi.fn(async () => undefined)
  readonly close = vi.fn(async () => undefined)

  createMediaStreamSource(): FakeNode {
    return this.source
  }

  createScriptProcessor(): FakeProcessor {
    return this.processor
  }

  createGain(): typeof this.sink {
    return this.sink
  }
}


function emitAudio(context: FakeAudioContext, samples: number[], sampleRate = 16_000): void {
  context.processor.onaudioprocess?.({
    inputBuffer: {
      sampleRate,
      getChannelData: () => Float32Array.from(samples)
    }
  })
}

function samplesOf(length: number, value: number): number[] {
  return Array.from({ length }, () => value)
}

function decodePcm16(base64: string): number[] {
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Array.from({ length: bytes.byteLength / 2 }, (_, index) => view.getInt16(index * 2, true))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('realtime audio capture capability detection', () => {
  it('requires a callable microphone API and script processor support', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => new FakeStream()) } })
    vi.stubGlobal('AudioContext', FakeAudioContext)
    expect(isRealtimeAudioCaptureAvailable()).toBe(true)

    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: 'unavailable' } })
    expect(isRealtimeAudioCaptureAvailable()).toBe(false)

    class MissingProcessorAudioContext {}
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } })
    vi.stubGlobal('AudioContext', MissingProcessorAudioContext)
    expect(isRealtimeAudioCaptureAvailable()).toBe(false)
  })
})

describe('RealtimeAudioCaptureSession', () => {
  it('captures mono PCM16 chunks at 16 kHz and releases resources on stop', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        Object.assign(this, context)
      }
    })

    const session = await RealtimeAudioCaptureSession.create()
    const chunks: string[] = []
    session.start(async (chunk) => {
      chunks.push(chunk)
    })
    emitAudio(context, [1, -1])

    await session.stop()

    expect(chunks).toHaveLength(1)
    expect(decodePcm16(chunks[0]!)).toEqual([32_767, -32_768])
    expect(stream.track.stop).toHaveBeenCalledOnce()
    expect(context.resume).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
    expect(context.source.disconnect).toHaveBeenCalledOnce()
    expect(context.processor.disconnect).toHaveBeenCalledOnce()
    expect(context.sink.disconnect).toHaveBeenCalledOnce()
  })

  it('frames resampled audio into 40 ms PCM16 packets', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        Object.assign(this, context)
      }
    })

    const session = await RealtimeAudioCaptureSession.create()
    const chunks: string[] = []
    session.start(async (chunk) => {
      chunks.push(chunk)
    })
    emitAudio(context, samplesOf(960, 0.25), 48_000)
    emitAudio(context, samplesOf(960, -0.25), 48_000)
    emitAudio(context, samplesOf(960, 0.5), 48_000)
    emitAudio(context, samplesOf(960, -0.5), 48_000)

    await session.stop()

    const decoded = chunks.map((chunk) => decodePcm16(chunk))
    expect(decoded.map((samples) => samples.length)).toEqual([640, 640])
    expect(decoded[0]?.slice(0, 2)).toEqual([8_192, 8_192])
    expect(decoded[0]?.slice(-2)).toEqual([-8_192, -8_192])
    expect(decoded[1]?.slice(0, 2)).toEqual([16_384, 16_384])
    expect(decoded[1]?.slice(-2)).toEqual([-16_384, -16_384])
  })

  it('preserves fractional resampling phase across input buffers', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        Object.assign(this, context)
      }
    })

    const session = await RealtimeAudioCaptureSession.create()
    const chunks: string[] = []
    session.start(async (chunk) => {
      chunks.push(chunk)
    })
    emitAudio(context, samplesOf(1_024, 0.25), 48_000)
    emitAudio(context, samplesOf(1_024, 0.25), 48_000)
    emitAudio(context, samplesOf(1_024, 0.25), 48_000)

    await session.stop()

    const decoded = chunks.map((chunk) => decodePcm16(chunk)).flat()
    expect(decoded).toHaveLength(1_024)
  })

  it('drops queued chunks after aborting the capture session', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        Object.assign(this, context)
      }
    })

    const session = await RealtimeAudioCaptureSession.create()
    const chunks: string[] = []
    let releaseFirst!: () => void
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    session.start(async (chunk) => {
      chunks.push(chunk)
      if (chunks.length === 1) await first
    })
    emitAudio(context, samplesOf(640, 0.25))
    emitAudio(context, samplesOf(640, -0.25))

    await Promise.resolve()
    expect(chunks).toHaveLength(1)
    session.abort()
    releaseFirst()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(chunks).toHaveLength(1)
    expect(stream.track.stop).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('drops queued chunks when abort follows a pending stop', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        Object.assign(this, context)
      }
    })

    const session = await RealtimeAudioCaptureSession.create()
    const chunks: string[] = []
    let releaseFirst!: () => void
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    session.start(async (chunk) => {
      chunks.push(chunk)
      if (chunks.length === 1) await first
    })
    emitAudio(context, samplesOf(640, 0.25))
    emitAudio(context, samplesOf(640, -0.25))

    const stopping = session.stop()
    await Promise.resolve()
    expect(chunks).toHaveLength(1)
    session.abort()
    releaseFirst()
    await stopping

    expect(chunks).toHaveLength(1)
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('waits for queued chunks before closing the audio context', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        Object.assign(this, context)
      }
    })

    const session = await RealtimeAudioCaptureSession.create()
    const chunks: string[] = []
    let releaseFirst!: () => void
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    session.start(async (chunk) => {
      chunks.push(chunk)
      if (chunks.length === 1) await first
    })
    emitAudio(context, samplesOf(640, 0.25))
    emitAudio(context, samplesOf(640, -0.25))

    const stopping = session.stop()
    await Promise.resolve()
    expect(chunks).toHaveLength(1)
    expect(context.close).not.toHaveBeenCalled()

    releaseFirst()
    await stopping
    expect(chunks).toHaveLength(2)
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('stops waiting when chunk delivery exceeds the transport budget', async () => {
    vi.useFakeTimers()
    try {
      const stream = new FakeStream()
      const context = new FakeAudioContext()
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
      vi.stubGlobal('AudioContext', class extends FakeAudioContext {
        constructor() {
          super()
          Object.assign(this, context)
        }
      })

      const session = await RealtimeAudioCaptureSession.create()
      session.start(async () => await new Promise<void>(() => undefined))
      emitAudio(context, [0, 0])
      const rejection = expect(session.stop()).rejects.toThrow('Realtime audio chunk delivery timed out')
      await vi.advanceTimersByTimeAsync(5_000)
      await rejection
      expect(context.close).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('buffers beyond the delivery timeout and drains old and new PCM in order', async () => {
    vi.useFakeTimers()
    try {
      const stream = new FakeStream()
      const context = new FakeAudioContext()
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
      vi.stubGlobal('AudioContext', class extends FakeAudioContext {
        constructor() { super(); Object.assign(this, context) }
      })
      let makeReady!: () => void
      const ready = new Promise<void>((resolve) => { makeReady = resolve })
      let finishFirst!: () => void
      const firstDelivery = new Promise<void>((resolve) => { finishFirst = resolve })
      const chunks: string[] = []
      const session = await RealtimeAudioCaptureSession.create()
      session.start(async (chunk) => {
        chunks.push(chunk)
        if (chunks.length === 1) await firstDelivery
      }, ready)
      emitAudio(context, samplesOf(640, 0.25))
      emitAudio(context, samplesOf(640, -0.25))
      await vi.advanceTimersByTimeAsync(10_000)
      expect(chunks).toEqual([])
      makeReady()
      await vi.advanceTimersByTimeAsync(0)
      expect(chunks).toHaveLength(1)
      // Continue capturing while the historical audio is being delivered.
      emitAudio(context, samplesOf(640, 0.5))
      emitAudio(context, [-1, 1])
      const stopping = session.stop()
      expect(stream.track.stop).toHaveBeenCalledOnce()
      finishFirst()
      await stopping
      expect(chunks.map((chunk) => decodePcm16(chunk))).toEqual([
        samplesOf(640, 8_192), samplesOf(640, -8_192), samplesOf(640, 16_384), [-32_768, 32_767]
      ])
      expect(context.close).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops the microphone before readiness but preserves queued and partial audio', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() { super(); Object.assign(this, context) }
    })
    let makeReady!: () => void
    const ready = new Promise<void>((resolve) => { makeReady = resolve })
    const chunks: string[] = []
    const session = await RealtimeAudioCaptureSession.create()
    session.start(async (chunk) => { chunks.push(chunk) }, ready)
    emitAudio(context, samplesOf(640, 0.5))
    emitAudio(context, [1, -1])
    let stopped = false
    const stopping = session.stop().then(() => { stopped = true })
    await Promise.resolve()
    expect(stream.track.stop).toHaveBeenCalledOnce()
    expect(chunks).toEqual([])
    expect(stopped).toBe(false)
    makeReady()
    await stopping
    expect(chunks.map((chunk) => decodePcm16(chunk))).toEqual([samplesOf(640, 16_384), [32_767, -32_768]])
  })

  it('releases a pending stop on abort without waiting for model startup', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() { super(); Object.assign(this, context) }
    })
    const send = vi.fn(async () => undefined)
    const session = await RealtimeAudioCaptureSession.create()
    let rejectReady!: (error: Error) => void
    const ready = new Promise<void>((_resolve, reject) => { rejectReady = reject })
    session.start(send, ready)
    emitAudio(context, samplesOf(640, 1))
    emitAudio(context, [-1])
    const stopping = session.stop()
    session.abort()
    await stopping
    rejectReady(new Error('Late startup failure'))
    await Promise.resolve()
    expect(send).not.toHaveBeenCalled()
    expect(stream.track.stop).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('discards buffered audio if startup fails and propagates the failure', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() { super(); Object.assign(this, context) }
    })
    let fail!: (error: Error) => void
    const ready = new Promise<void>((_resolve, reject) => { fail = reject })
    const send = vi.fn(async () => undefined)
    const session = await RealtimeAudioCaptureSession.create()
    session.start(send, ready)
    emitAudio(context, samplesOf(640, 1))
    emitAudio(context, [-1])
    const rejection = expect(session.stop()).rejects.toThrow('Model failed to load')
    fail(new Error('Model failed to load'))
    await rejection
    expect(send).not.toHaveBeenCalled()
    expect(stream.track.stop).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('propagates a chunk delivery error after cleaning up resources', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        Object.assign(this, context)
      }
    })

    const session = await RealtimeAudioCaptureSession.create()
    session.start(async () => {
      throw new Error('transport unavailable')
    })
    emitAudio(context, [0, 0])

    await expect(session.stop()).rejects.toThrow('transport unavailable')
    expect(stream.track.stop).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
  })
})
