import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { CLIENT_EXTERNALS } from './browser-modules.mjs'

/** Observe the real served factory and apply with DSH's real native module table.
 * This does not emulate modules, click controls, or activate microphone/models. */
export async function probeBrowserFactory(baseUrl, cookie) {
  const executable = process.env.CHROMIUM_BIN ?? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe')
  ].find((file) => file && existsSync(file))
  assert.ok(executable, 'loader smoke needs Chromium; set CHROMIUM_BIN (development verification only)')
  const profile = await mkdtemp(join(tmpdir(), 'ears-browser-'))
  const child = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  let socket
  const pending = new Map()
  const pageErrors = []
  let nextId = 0
  try {
    const endpoint = await new Promise((yes, no) => {
      let output = ''
      const timer = setTimeout(() => no(new Error('Chromium did not expose its temporary debugger')), 15_000)
      child.once('error', (error) => { clearTimeout(timer); no(error) })
      child.once('exit', (code) => { clearTimeout(timer); no(new Error(`Chromium exited before startup (${code})`)) })
      child.stderr.on('data', (chunk) => {
        output = (output + chunk).slice(-8192)
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/u)
        if (match) { clearTimeout(timer); yes(match[1]) }
      })
    })
    socket = new WebSocket(endpoint)
    await new Promise((yes, no) => { socket.addEventListener('open', yes, { once: true }); socket.addEventListener('error', no, { once: true }) })
    socket.addEventListener('message', ({ data }) => {
      const reply = JSON.parse(data)
      if (reply.method === 'Runtime.exceptionThrown') {
        const detail = reply.params.exceptionDetails
        pageErrors.push(String(detail.exception?.description ?? detail.text).slice(0, 800))
      }
      if (reply.method === 'Runtime.consoleAPICalled' && reply.params.type === 'error') {
        pageErrors.push(reply.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ').slice(0, 800))
      }
      const waiter = pending.get(reply.id)
      if (!waiter) return
      pending.delete(reply.id)
      clearTimeout(waiter.timer)
      if (reply.error) waiter.no(new Error(JSON.stringify(reply.error)))
      else waiter.yes(reply.result)
    })
    const call = (method, params = {}, sessionId) => new Promise((yes, no) => {
      const id = ++nextId
      const timer = setTimeout(() => { pending.delete(id); no(new Error(`Chromium debugger timed out: ${method}`)) }, 10_000)
      pending.set(id, { yes, no, timer })
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
    await call('Page.enable', {}, sessionId)
    await call('Runtime.enable', {}, sessionId)
    await call('Network.enable', {}, sessionId)
    const at = cookie.indexOf('=')
    await call('Network.setCookie', { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: new URL('/', baseUrl).href, httpOnly: true }, sessionId)
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      const result = window.__earsDeliveryProbe = { factory: false, applied: false, modules: [] };
      let loader;
      const wrapped = new WeakSet();
      Object.defineProperty(window, '__ModuleLoader__', { configurable: true,
        get() { return loader }, set(value) {
          loader = value;
          let load = value.load;
          const observe = function(registration) {
            if (registration.id === 'dsh-ears' && !wrapped.has(registration)) {
              const factory = registration.factory;
              registration = { ...registration, factory(require) {
                try {
                  const exported = factory((name) => { result.modules.push(name); return require(name) });
                  result.factory = typeof exported.apply === 'function';
                  const apply = exported.apply;
                  return { ...exported, apply: async (...args) => { try { const dispose = await apply(...args); result.applied = true; return dispose } catch (error) { result.error = String(error); throw error } } };
                } catch (error) { result.error = String(error); throw error }
              } };
              wrapped.add(registration);
            }
            return load.call(this, registration);
          };
          // The real kernel replaces queue-mode load during create(). Observe
          // that transition without replacing its implementation or modules.
          Object.defineProperty(value, 'load', { configurable: true,
            get() { return observe }, set(next) { load = next }
          });
        }
      });
    ` }, sessionId)
    await call('Page.navigate', { url: new URL('/', baseUrl).href }, sessionId)
    const deadline = Date.now() + 45_000
    let observed
    while (Date.now() < deadline) {
      const value = await call('Runtime.evaluate', { expression: 'window.__earsDeliveryProbe', returnByValue: true }, sessionId)
      observed = value.result.value
      if (observed?.error) throw new Error(`served Ears Client failed: ${observed.error}; page errors: ${JSON.stringify(pageErrors.slice(0, 5))}`)
      if (observed?.factory && observed?.applied) break
      await new Promise((yes) => setTimeout(yes, 200))
    }
    assert.ok(observed?.factory && observed?.applied, `served Client factory/apply did not complete: ${JSON.stringify(observed)}; page errors: ${JSON.stringify(pageErrors.slice(0, 5))}`)
    for (const name of observed.modules) assert.ok(CLIENT_EXTERNALS.includes(name), `unexpected real browser module: ${name}`)
    console.log(`[compat] actual Chromium Client factory/apply loaded with: ${[...new Set(observed.modules)].join(', ')}`)
  } finally {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.no(new Error('browser smoke ended')) }
    socket?.close()
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      await new Promise((yes) => { const timer = setTimeout(() => { child.kill('SIGKILL'); yes() }, 5_000); child.once('exit', () => { clearTimeout(timer); yes() }) })
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
