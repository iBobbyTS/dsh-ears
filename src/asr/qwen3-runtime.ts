/**
 * Host-owned, fully local Qwen3-ASR runtime and model lifecycle.
 * No listener ports: the Python worker uses private NDJSON stdio.
 */
import { spawn, spawnSync, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { access, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { QWEN3_MODELS, DEFAULT_QWEN3_MODEL, QWEN3_DEFAULT_TTL_MINUTES, validQwen3TTL, type Qwen3ModelId } from '../settings/recognition.js'

export { QWEN3_MODELS, DEFAULT_QWEN3_MODEL, QWEN3_DEFAULT_TTL_MINUTES, validQwen3TTL } from '../settings/recognition.js'
export const QWEN3_RUNTIME_VERSION = '0.4.4'

export function validQwen3Model(id: string): id is Qwen3ModelId {
  return (QWEN3_MODELS as readonly string[]).includes(id)
}

export function qwenCacheRoot(platform: NodeJS.Platform = process.platform, home = homedir()): string {
  return platform === 'darwin'
    ? join(home, 'Library', 'Caches', 'dsh-ears', 'qwen3')
    : join(home, '.cache', 'dsh-ears', 'qwen3')
}

export function qwenModelPath(id: Qwen3ModelId, root = qwenCacheRoot()): string {
  return join(root, 'models', id)
}

export interface Qwen3ModelState {
  supported: boolean
  runtimeInstalled: boolean
  downloaded: boolean
  downloading: boolean
  phase: 'idle' | 'runtime' | 'weights'
  progress: number | null
  loaded: boolean
  activeSessions: number
  expiresAt: number | null
  ttlMinutes: number
  error: string | null
}

type WorkerReply = { id?: number; type?: string; text?: string; error?: string; final?: boolean }
type Pending = {
  resolve: (result: { text: string; final: boolean }) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}
type DownloadJob = { model: Qwen3ModelId; abort: AbortController; promise: Promise<void> }

function platformSupported(): boolean {
  return process.platform === 'darwin' && process.arch === 'arm64'
}

async function present(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

/** Bounds the visible error; no audio, authentication data, or command arguments. */
function safeError(value: unknown): string {
  return (value instanceof Error ? value.message : String(value)).slice(0, 320)
}

export class Qwen3Runtime {
  private readonly root: string
  private readonly script: string
  private child: ChildProcessWithoutNullStreams | undefined
  private workerModel: Qwen3ModelId | undefined
  private startingModel: Qwen3ModelId | undefined
  private startup: Promise<void> | undefined
  private startupResolve: (() => void) | undefined
  private startupReject: ((error: Error) => void) | undefined
  private readonly pending = new Map<number, Pending>()
  private readonly active = new Set<string>()
  private nextId = 0
  private lineBuffer = ''
  private stderrTail = ''
  private idleTimer: ReturnType<typeof setTimeout> | undefined
  private expiresAt: number | null = null
  private ttlMinutes = QWEN3_DEFAULT_TTL_MINUTES
  private job: DownloadJob | undefined
  private downloadChild: ChildProcess | undefined
  private downloadPhase: Qwen3ModelState['phase'] = 'idle'
  private downloadError: string | null = null
  private disposed = false

  constructor(root = qwenCacheRoot()) {
    this.root = root
    // The compiled host entry is lib/index.js; python/ is published beside lib/.
    this.script = fileURLToPath(new URL('../python/qwen3_worker.py', import.meta.url))
  }

  async state(model: string, ttlMinutes = QWEN3_DEFAULT_TTL_MINUTES): Promise<Qwen3ModelState> {
    if (!validQwen3Model(model)) throw new Error('Unknown local Qwen3-ASR model')
    this.setTTL(ttlMinutes)
    const target = qwenModelPath(model, this.root)
    const downloaded = await present(join(target, '.dsh-ears-ready'))
    const installing = this.job?.model === model
    return {
      supported: platformSupported(),
      runtimeInstalled: await present(this.python()),
      downloaded,
      downloading: installing,
      phase: installing ? this.downloadPhase : 'idle',
      progress: null,
      loaded: this.workerModel === model && this.child !== undefined,
      activeSessions: this.active.size,
      expiresAt: this.expiresAt,
      ttlMinutes: this.ttlMinutes,
      error: this.downloadError
    }
  }

  async download(model: string): Promise<Qwen3ModelState> {
    if (!validQwen3Model(model)) throw new Error('Unknown local Qwen3-ASR model')
    if (!platformSupported()) throw new Error('Qwen3-ASR MLX requires macOS Apple Silicon')
    if (this.disposed) throw new Error('Qwen3-ASR runtime is disposed')
    if (this.active.size > 0) throw new Error('Stop Qwen3-ASR recording before installing model files')
    if (this.job) {
      if (this.job.model !== model) throw new Error('Another Qwen3-ASR model is downloading')
      return this.state(model)
    }
    if (await present(join(qwenModelPath(model, this.root), '.dsh-ears-ready'))) return this.state(model)
    this.downloadError = null
    const abort = new AbortController()
    const job: DownloadJob = { model, abort, promise: Promise.resolve() }
    this.job = job
    job.promise = this.install(model, abort.signal).catch((error: unknown) => {
      this.downloadError = abort.signal.aborted ? null : safeError(error)
    }).finally(() => {
      if (this.job === job) this.job = undefined
      this.downloadPhase = 'idle'
      this.downloadChild = undefined
    })
    return this.state(model)
  }

  async cancelDownload(model: string): Promise<Qwen3ModelState> {
    if (!validQwen3Model(model)) throw new Error('Unknown local Qwen3-ASR model')
    if (this.job?.model === model) {
      const job = this.job
      job.abort.abort()
      this.downloadChild?.kill('SIGTERM')
      await job.promise
    }
    return this.state(model)
  }

  async deleteModel(model: string): Promise<Qwen3ModelState> {
    if (!validQwen3Model(model)) throw new Error('Unknown local Qwen3-ASR model')
    await this.cancelDownload(model)
    if (this.workerModel === model || this.startingModel === model) {
      if (this.active.size > 0) throw new Error('Stop dictation before deleting the loaded Qwen3 model')
      this.unload()
    }
    // Model id is allowlisted, so this only removes this plugin's own cache.
    await rm(qwenModelPath(model, this.root), { recursive: true, force: true })
    this.downloadError = null
    return this.state(model)
  }

  async load(model: string, ttlMinutes = QWEN3_DEFAULT_TTL_MINUTES): Promise<Qwen3ModelState> {
    if (!validQwen3Model(model)) throw new Error('Unknown local Qwen3-ASR model')
    this.setTTL(ttlMinutes)
    await this.ensure(model)
    this.armIdle()
    return this.state(model)
  }

  async unloadModel(model: string): Promise<Qwen3ModelState> {
    if (!validQwen3Model(model)) throw new Error('Unknown local Qwen3-ASR model')
    if (this.active.size > 0) throw new Error('Stop current recordings before unloading Qwen3-ASR')
    this.unload()
    return this.state(model)
  }

  async open(model: string, ttlMinutes = QWEN3_DEFAULT_TTL_MINUTES): Promise<string> {
    if (!validQwen3Model(model)) throw new Error('Unknown local Qwen3-ASR model')
    this.setTTL(ttlMinutes)
    await this.ensure(model)
    const sessionId = randomUUID()
    await this.request({ type: 'start', sessionId, chunkSizeSec: 1.0 })
    this.active.add(sessionId)
    this.cancelIdle()
    return sessionId
  }

  async feed(sessionId: string, audio: Uint8Array): Promise<{ text: string; final: boolean }> {
    if (!this.active.has(sessionId)) throw new Error('Qwen3-ASR session is not active')
    if (audio.length === 0) return { text: '', final: false }
    if (audio.length > 32000 || audio.length % 2 !== 0) throw new Error('Invalid PCM16 audio chunk')
    return this.request({ type: 'feed', sessionId, pcm: Buffer.from(audio).toString('base64') })
  }

  async finish(sessionId: string): Promise<string> {
    if (!this.active.has(sessionId)) throw new Error('Qwen3-ASR session is not active')
    try {
      const response = await this.request({ type: 'finish', sessionId }, 30_000)
      return response.text
    } finally {
      this.release(sessionId, false)
    }
  }

  release(sessionId: string, cancel = true): void {
    if (!this.active.delete(sessionId)) return
    if (cancel && this.child) void this.request({ type: 'cancel', sessionId }, 5000).catch(() => undefined)
    this.armIdle()
  }

  dispose(): void {
    this.disposed = true
    this.job?.abort.abort()
    this.downloadChild?.kill('SIGTERM')
    this.unload()
  }

  private python(): string {
    return join(this.root, 'venv', 'bin', 'python')
  }

  private setTTL(ttlMinutes: number): void {
    if (!validQwen3TTL(ttlMinutes)) throw new Error('Qwen3 idle TTL must be 1–1440 minutes')
    if (this.ttlMinutes !== ttlMinutes) {
      this.ttlMinutes = ttlMinutes
      this.armIdle()
    }
  }

  private cancelIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = undefined
    this.expiresAt = null
  }

  private armIdle(): void {
    this.cancelIdle()
    if (!this.child || this.active.size > 0 || this.startup) return
    const ms = this.ttlMinutes * 60_000
    this.expiresAt = Date.now() + ms
    this.idleTimer = setTimeout(() => {
      if (this.active.size === 0) this.unload()
    }, ms)
    this.idleTimer.unref?.()
  }

  private unload(): void {
    this.cancelIdle()
    this.workerModel = undefined
    this.startingModel = undefined
    this.active.clear()
    this.startupReject?.(new Error('Qwen3-ASR worker stopped'))
    this.startupReject = undefined
    this.startupResolve = undefined
    this.startup = undefined
    const child = this.child
    this.child = undefined
    this.lineBuffer = ''
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Qwen3-ASR worker stopped'))
    }
    this.pending.clear()
    if (child) {
      child.stdin.end()
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
      timer.unref?.()
      child.once('exit', () => clearTimeout(timer))
    }
  }

  private async ensure(model: Qwen3ModelId): Promise<void> {
    if (this.disposed) throw new Error('Qwen3-ASR runtime is disposed')
    if (!platformSupported()) throw new Error('Qwen3-ASR MLX requires macOS Apple Silicon')
    if (!await present(join(qwenModelPath(model, this.root), '.dsh-ears-ready'))) {
      throw new Error('Download the Qwen3-ASR model from the dsh-ears settings panel first')
    }
    if (!await present(this.python())) throw new Error('Qwen3-ASR runtime is not installed; download the model from settings')
    if (this.child && this.workerModel === model && !this.startup) return
    if (this.startup) {
      if (this.startingModel !== model) throw new Error('Another Qwen3-ASR model is loading')
      return this.startup
    }
    if (this.child) {
      if (this.active.size > 0) throw new Error('Another Qwen3-ASR model is in use')
      this.unload()
    }
    this.startingModel = model
    this.startup = this.launch(model).finally(() => {
      this.startup = undefined
      this.startingModel = undefined
      this.armIdle()
    })
    return this.startup
  }

  private launch(model: Qwen3ModelId): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.python(), [this.script, qwenModelPath(model, this.root)], {
        stdio: ['pipe', 'pipe', 'pipe']
      })
      this.child = child
      let settled = false
      const timeout = setTimeout(() => settle(new Error('Qwen3-ASR model loading timed out')), 120_000)
      const settle = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.startupReject = undefined
        this.startupResolve = undefined
        if (error) {
          if (this.child === child) this.unload()
          reject(error)
        } else {
          this.workerModel = model
          resolve()
        }
      }
      this.startupResolve = () => settle()
      this.startupReject = (err) => settle(err)
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => this.onWorkerOutput(chunk))
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        this.stderrTail = (this.stderrTail + String(chunk)).slice(-500)
      })
      child.once('error', (error) => {
        settle(error)
        this.failWorker(error)
      })
      child.once('exit', (code) => {
        const error = new Error('Qwen3-ASR worker exited (' + String(code) + '): ' + this.stderrTail.slice(-200))
        settle(error)
        this.failWorker(error)
      })
    })
  }

  private onWorkerOutput(chunk: string): void {
    this.lineBuffer += chunk
    let idx = this.lineBuffer.indexOf('\n')
    while (idx !== -1) {
      const raw = this.lineBuffer.slice(0, idx)
      this.lineBuffer = this.lineBuffer.slice(idx + 1)
      try {
        const msg = JSON.parse(raw) as WorkerReply
        if (msg.type === 'ready') this.startupResolve?.()
        else if (typeof msg.id === 'number') {
          const entry = this.pending.get(msg.id)
          if (entry) {
            this.pending.delete(msg.id)
            clearTimeout(entry.timer)
            if (typeof msg.error === 'string') entry.reject(new Error(msg.error))
            else entry.resolve({ text: msg.text ?? '', final: msg.final === true })
          }
        }
      } catch {
        // Ignore malformed diagnostic lines from native dependencies.
      }
      idx = this.lineBuffer.indexOf('\n')
    }
    // An unexpected unbounded stdout stream must not consume the Host memory.
    if (this.lineBuffer.length > 1_000_000) this.failWorker(new Error('Invalid Qwen3-ASR worker output'))
  }

  private failWorker(error: Error): void {
    if (!this.child) return
    const live = this.child
    this.child = undefined
    this.workerModel = undefined
    this.active.clear()
    this.cancelIdle()
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    this.pending.clear()
    live.kill('SIGTERM')
  }

  private request(payload: Record<string, unknown>, timeoutMs = 10_000): Promise<{ text: string; final: boolean }> {
    const child = this.child
    if (!child || !child.stdin.writable) return Promise.reject(new Error('Qwen3-ASR worker unavailable'))
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('Qwen3-ASR worker response timed out'))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      child.stdin.write(JSON.stringify({ ...payload, id }) + '\n', (error) => {
        if (error) {
          const pending = this.pending.get(id)
          if (!pending) return
          this.pending.delete(id)
          clearTimeout(timer)
          reject(error)
        }
      })
    })
  }

  private async install(model: Qwen3ModelId, signal: AbortSignal): Promise<void> {
    this.downloadPhase = 'runtime'
    await mkdir(this.root, { recursive: true })
    const python = this.findPython()
    if (!python) throw new Error('Python 3.10+ is required to install Qwen3-ASR MLX')
    if (!existsSync(this.python())) {
      await this.runStep(python, ['-m', 'venv', join(this.root, 'venv')], signal, 180_000)
    }
    await this.runStep(this.python(), ['-m', 'pip', 'install', '--disable-pip-version-check',
      'mlx-qwen3-asr==' + QWEN3_RUNTIME_VERSION], signal, 900_000)
    signal.throwIfAborted()
    this.downloadPhase = 'weights'
    const directory = qwenModelPath(model, this.root)
    await mkdir(directory, { recursive: true })
    await this.runStep(this.python(), [this.script, '--download', model, directory], signal, 3_600_000)
  }

  private findPython(): string | null {
    for (const exe of ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3']) {
      const check = spawnSync(exe, ['-c', 'import sys; assert sys.version_info >= (3,10)'], {
        timeout: 4000, stdio: 'ignore'
      })
      if (check.status === 0) return exe
    }
    return null
  }

  private runStep(binary: string, args: string[], signal: AbortSignal, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new Error('Download cancelled')); return }
      const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      this.downloadChild = child
      let stderr = ''
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        if (this.downloadChild === child) this.downloadChild = undefined
        if (error) reject(error)
        else resolve()
      }
      const onAbort = () => {
        child.kill('SIGTERM')
        finish(new Error('Download cancelled'))
      }
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        finish(new Error('Qwen3-ASR installation step timed out'))
      }, timeoutMs)
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + String(chunk)).slice(-1200) })
      child.stdout.on('data', () => undefined)
      child.once('error', (error) => finish(error))
      child.once('close', (code) => {
        finish(signal.aborted ? new Error('Download cancelled') : code === 0 ? undefined
          : new Error('Qwen3-ASR installation failed: ' + stderr.slice(-350)))
      })
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}

export class Qwen3RealtimeAsrSession {
  private sessionId: string | undefined
  constructor(
    private readonly runtime: Qwen3Runtime,
    private readonly model: string,
    private readonly ttlMinutes: number
  ) {}

  async open(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.sessionId = await this.runtime.open(this.model, this.ttlMinutes)
    if (signal?.aborted) {
      this.close()
      signal.throwIfAborted()
    }
  }

  async sendAudio(audio: Uint8Array, signal?: AbortSignal): Promise<{ text: string; final: boolean }> {
    signal?.throwIfAborted()
    if (!this.sessionId) throw new Error('Qwen3-ASR session not open')
    return this.runtime.feed(this.sessionId, audio)
  }

  async finish(signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted()
    if (!this.sessionId) throw new Error('Qwen3-ASR session not open')
    const id = this.sessionId
    this.sessionId = undefined
    return this.runtime.finish(id)
  }

  close(): void {
    if (this.sessionId) this.runtime.release(this.sessionId)
    this.sessionId = undefined
  }
}
