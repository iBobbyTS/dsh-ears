import { _ as DEFAULT_RECOGNITION_SETTINGS, d as remoteTextSuccess, g as validateEarsSettings, h as repairInvalidEarsSettings, l as remoteTextFailure, m as SETTINGS_NAMESPACE, p as DEFAULT_EARS_SETTINGS, v as QWEN3_MODELS, y as validQwen3TTL } from "./remote-contract-Dbd1DWCV.js";
import s from "@deepseek-ai/schemastery";
import { randomUUID } from "node:crypto";
import { TypertRemoteService, remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// src/settings/general.ts
const DEFAULT_GENERAL_SETTINGS = Object.freeze({
	shortcut: Object.freeze({
		enabled: true,
		value: "ctrl+shift+space"
	}),
	soundsEnabled: true
});
// src/config-schema.ts
const EarsSettingsSchema = s.object({
	schemaVersion: s.number().default(4).description("Settings schema version").loose().volatile(),
	general: s.object({
		shortcut: s.object({
			enabled: s.boolean().default(DEFAULT_GENERAL_SETTINGS.shortcut.enabled).description("Enable the in-page voice shortcut").loose().volatile(),
			value: s.string().default(DEFAULT_GENERAL_SETTINGS.shortcut.value).description("In-page voice shortcut").loose().volatile()
		}).description("Voice shortcut").collapse(),
		soundsEnabled: s.boolean().default(DEFAULT_GENERAL_SETTINGS.soundsEnabled).description("Play a synthesized click for voice input").loose().volatile()
	}).description("General dsh-ears input settings").collapse(),
	recognition: s.object({
		localQwen: s.object({
			model: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localQwen.model).description("Qwen3-ASR quantized model").loose().volatile(),
			idleTtlMinutes: s.number().default(DEFAULT_RECOGNITION_SETTINGS.localQwen.idleTtlMinutes).description("Unload idle Qwen3-ASR after this many minutes (default 60)").loose().volatile(),
			prompt: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localQwen.prompt).description("Qwen3-ASR context prompt; biases transcription style, script, or domain terms; leave empty for no bias").loose().volatile()
		}).description("Host-managed MLX streaming ASR").collapse(),
		maxRecordingSeconds: s.number().default(DEFAULT_RECOGNITION_SETTINGS.maxRecordingSeconds).description("Recording limit in seconds").loose().volatile()
	}).description("Audio recognition routing and limits").collapse()
});
// src/asr/qwen3-runtime.ts
/**
* Host-owned, fully local Qwen3-ASR runtime and model lifecycle.
* No listener ports: the Python worker uses private NDJSON stdio.
*/
function validQwen3Model(id) {
	return QWEN3_MODELS.includes(id);
}
function qwenCacheRoot(platform = process.platform, home = homedir()) {
	return platform === "darwin" ? join(home, "Library", "Caches", "dsh-ears", "qwen3") : join(home, ".cache", "dsh-ears", "qwen3");
}
function qwenModelPath(id, root = qwenCacheRoot()) {
	return join(root, "models", id);
}
function platformSupported() {
	return process.platform === "darwin" && process.arch === "arm64";
}
async function present(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
/** Bounds the visible error; no audio, authentication data, or command arguments. */
function safeError(value) {
	return (value instanceof Error ? value.message : String(value)).slice(0, 320);
}
var Qwen3Runtime = class {
	root;
	script;
	child;
	workerModel;
	startingModel;
	startup;
	startupResolve;
	startupReject;
	pending = /* @__PURE__ */ new Map();
	active = /* @__PURE__ */ new Set();
	nextId = 0;
	lineBuffer = "";
	stderrTail = "";
	idleTimer;
	expiresAt = null;
	ttlMinutes = 60;
	job;
	downloadChild;
	downloadPhase = "idle";
	downloadError = null;
	disposed = false;
	constructor(root = qwenCacheRoot()) {
		this.root = root;
		this.script = fileURLToPath(new URL("../python/qwen3_worker.py", import.meta.url));
	}
	async state(model, ttlMinutes = 60) {
		if (!validQwen3Model(model)) throw new Error("Unknown local Qwen3-ASR model");
		this.setTTL(ttlMinutes);
		const target = qwenModelPath(model, this.root);
		const downloaded = await present(join(target, ".dsh-ears-ready"));
		const installing = this.job?.model === model;
		return {
			supported: platformSupported(),
			runtimeInstalled: await present(this.python()),
			downloaded,
			downloading: installing,
			phase: installing ? this.downloadPhase : "idle",
			progress: null,
			loaded: this.workerModel === model && this.child !== void 0,
			activeSessions: this.active.size,
			expiresAt: this.expiresAt,
			ttlMinutes: this.ttlMinutes,
			error: this.downloadError
		};
	}
	async download(model) {
		if (!validQwen3Model(model)) throw new Error("Unknown local Qwen3-ASR model");
		if (!platformSupported()) throw new Error("Qwen3-ASR MLX requires macOS Apple Silicon");
		if (this.disposed) throw new Error("Qwen3-ASR runtime is disposed");
		if (this.active.size > 0) throw new Error("Stop Qwen3-ASR recording before installing model files");
		if (this.job) {
			if (this.job.model !== model) throw new Error("Another Qwen3-ASR model is downloading");
			return this.state(model);
		}
		if (await present(join(qwenModelPath(model, this.root), ".dsh-ears-ready")) && await present(this.python())) return this.state(model);
		this.downloadError = null;
		const abort = new AbortController();
		const job = {
			model,
			abort,
			promise: Promise.resolve()
		};
		this.job = job;
		job.promise = this.install(model, abort.signal).catch((error) => {
			this.downloadError = abort.signal.aborted ? null : safeError(error);
		}).finally(() => {
			if (this.job === job) this.job = void 0;
			this.downloadPhase = "idle";
			this.downloadChild = void 0;
		});
		return this.state(model);
	}
	async cancelDownload(model) {
		if (!validQwen3Model(model)) throw new Error("Unknown local Qwen3-ASR model");
		if (this.job?.model === model) {
			const job = this.job;
			job.abort.abort();
			this.downloadChild?.kill("SIGTERM");
			await job.promise;
		}
		return this.state(model);
	}
	async deleteModel(model) {
		if (!validQwen3Model(model)) throw new Error("Unknown local Qwen3-ASR model");
		await this.cancelDownload(model);
		if (this.workerModel === model || this.startingModel === model) {
			if (this.active.size > 0) throw new Error("Stop dictation before deleting the loaded Qwen3 model");
			this.unload();
		}
		await rm(qwenModelPath(model, this.root), {
			recursive: true,
			force: true
		});
		this.downloadError = null;
		return this.state(model);
	}
	async load(model, ttlMinutes = 60) {
		if (!validQwen3Model(model)) throw new Error("Unknown local Qwen3-ASR model");
		this.setTTL(ttlMinutes);
		await this.ensure(model);
		this.armIdle();
		return this.state(model);
	}
	async unloadModel(model) {
		if (!validQwen3Model(model)) throw new Error("Unknown local Qwen3-ASR model");
		if (this.active.size > 0) throw new Error("Stop current recordings before unloading Qwen3-ASR");
		this.unload();
		return this.state(model);
	}
	async open(model, ttlMinutes = 60, context = "") {
		if (!validQwen3Model(model)) throw new Error("Unknown local Qwen3-ASR model");
		this.setTTL(ttlMinutes);
		await this.ensure(model);
		const sessionId = randomUUID();
		await this.request({
			type: "start",
			sessionId,
			chunkSizeSec: 1,
			context: context.slice(0, 1024)
		});
		this.active.add(sessionId);
		this.cancelIdle();
		return sessionId;
	}
	async feed(sessionId, audio) {
		if (!this.active.has(sessionId)) throw new Error("Qwen3-ASR session is not active");
		if (audio.length === 0) return {
			text: "",
			final: false
		};
		if (audio.length > 32e3 || audio.length % 2 !== 0) throw new Error("Invalid PCM16 audio chunk");
		return this.request({
			type: "feed",
			sessionId,
			pcm: Buffer.from(audio).toString("base64")
		});
	}
	async finish(sessionId) {
		if (!this.active.has(sessionId)) throw new Error("Qwen3-ASR session is not active");
		try {
			return (await this.request({
				type: "finish",
				sessionId
			}, 3e4)).text;
		} finally {
			this.release(sessionId, false);
		}
	}
	release(sessionId, cancel = true) {
		if (!this.active.delete(sessionId)) return;
		if (cancel && this.child) this.request({
			type: "cancel",
			sessionId
		}, 5e3).catch(() => void 0);
		this.armIdle();
	}
	dispose() {
		this.disposed = true;
		this.job?.abort.abort();
		this.downloadChild?.kill("SIGTERM");
		this.unload();
	}
	python() {
		return join(this.root, "venv", "bin", "python");
	}
	setTTL(ttlMinutes) {
		if (!validQwen3TTL(ttlMinutes)) throw new Error("Qwen3 idle TTL must be 1–1440 minutes");
		if (this.ttlMinutes !== ttlMinutes) {
			this.ttlMinutes = ttlMinutes;
			this.armIdle();
		}
	}
	cancelIdle() {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = void 0;
		this.expiresAt = null;
	}
	armIdle() {
		this.cancelIdle();
		if (!this.child || this.active.size > 0 || this.startup) return;
		const ms = this.ttlMinutes * 6e4;
		this.expiresAt = Date.now() + ms;
		this.idleTimer = setTimeout(() => {
			if (this.active.size === 0) this.unload();
		}, ms);
		this.idleTimer.unref?.();
	}
	unload() {
		this.cancelIdle();
		this.workerModel = void 0;
		this.startingModel = void 0;
		this.active.clear();
		this.startupReject?.(/* @__PURE__ */ new Error("Qwen3-ASR worker stopped"));
		this.startupReject = void 0;
		this.startupResolve = void 0;
		this.startup = void 0;
		const child = this.child;
		this.child = void 0;
		this.lineBuffer = "";
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(/* @__PURE__ */ new Error("Qwen3-ASR worker stopped"));
		}
		this.pending.clear();
		if (child) {
			child.stdin.end();
			child.kill("SIGTERM");
			const timer = setTimeout(() => child.kill("SIGKILL"), 3e3);
			timer.unref?.();
			child.once("exit", () => clearTimeout(timer));
		}
	}
	async ensure(model) {
		if (this.disposed) throw new Error("Qwen3-ASR runtime is disposed");
		if (!platformSupported()) throw new Error("Qwen3-ASR MLX requires macOS Apple Silicon");
		if (!await present(join(qwenModelPath(model, this.root), ".dsh-ears-ready"))) throw new Error("Download the Qwen3-ASR model from the dsh-ears settings panel first");
		if (!await present(this.python())) throw new Error("Qwen3-ASR runtime is not installed; download the model from settings");
		if (this.child && this.workerModel === model && !this.startup) return;
		if (this.startup) {
			if (this.startingModel !== model) throw new Error("Another Qwen3-ASR model is loading");
			return this.startup;
		}
		if (this.child) {
			if (this.active.size > 0) throw new Error("Another Qwen3-ASR model is in use");
			this.unload();
		}
		this.startingModel = model;
		this.startup = this.launch(model).finally(() => {
			this.startup = void 0;
			this.startingModel = void 0;
			this.armIdle();
		});
		return this.startup;
	}
	launch(model) {
		return new Promise((resolve, reject) => {
			const child = spawn(this.python(), [this.script, qwenModelPath(model, this.root)], { stdio: [
				"pipe",
				"pipe",
				"pipe"
			] });
			this.child = child;
			let settled = false;
			const timeout = setTimeout(() => settle(/* @__PURE__ */ new Error("Qwen3-ASR model loading timed out")), 12e4);
			const settle = (error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				this.startupReject = void 0;
				this.startupResolve = void 0;
				if (error) {
					if (this.child === child) this.unload();
					reject(error);
				} else {
					this.workerModel = model;
					resolve();
				}
			};
			this.startupResolve = () => settle();
			this.startupReject = (err) => settle(err);
			child.stdout.setEncoding("utf8");
			child.stdout.on("data", (chunk) => this.onWorkerOutput(chunk));
			child.stderr.setEncoding("utf8");
			child.stderr.on("data", (chunk) => {
				this.stderrTail = (this.stderrTail + String(chunk)).slice(-500);
			});
			child.once("error", (error) => {
				settle(error);
				this.failWorker(error);
			});
			child.once("exit", (code) => {
				const error = /* @__PURE__ */ new Error("Qwen3-ASR worker exited (" + String(code) + "): " + this.stderrTail.slice(-200));
				settle(error);
				this.failWorker(error);
			});
		});
	}
	onWorkerOutput(chunk) {
		this.lineBuffer += chunk;
		let idx = this.lineBuffer.indexOf("\n");
		while (idx !== -1) {
			const raw = this.lineBuffer.slice(0, idx);
			this.lineBuffer = this.lineBuffer.slice(idx + 1);
			try {
				const msg = JSON.parse(raw);
				if (msg.type === "ready") this.startupResolve?.();
				else if (typeof msg.id === "number") {
					const entry = this.pending.get(msg.id);
					if (entry) {
						this.pending.delete(msg.id);
						clearTimeout(entry.timer);
						if (typeof msg.error === "string") entry.reject(new Error(msg.error));
						else entry.resolve({
							text: msg.text ?? "",
							final: msg.final === true
						});
					}
				}
			} catch {}
			idx = this.lineBuffer.indexOf("\n");
		}
		if (this.lineBuffer.length > 1e6) this.failWorker(/* @__PURE__ */ new Error("Invalid Qwen3-ASR worker output"));
	}
	failWorker(error) {
		if (!this.child) return;
		const live = this.child;
		this.child = void 0;
		this.workerModel = void 0;
		this.active.clear();
		this.cancelIdle();
		for (const entry of this.pending.values()) {
			clearTimeout(entry.timer);
			entry.reject(error);
		}
		this.pending.clear();
		live.kill("SIGTERM");
	}
	request(payload, timeoutMs = 1e4) {
		const child = this.child;
		if (!child || !child.stdin.writable) return Promise.reject(/* @__PURE__ */ new Error("Qwen3-ASR worker unavailable"));
		const id = ++this.nextId;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(/* @__PURE__ */ new Error("Qwen3-ASR worker response timed out"));
			}, timeoutMs);
			this.pending.set(id, {
				resolve,
				reject,
				timer
			});
			child.stdin.write(JSON.stringify({
				...payload,
				id
			}) + "\n", (error) => {
				if (error) {
					if (!this.pending.get(id)) return;
					this.pending.delete(id);
					clearTimeout(timer);
					reject(error);
				}
			});
		});
	}
	async install(model, signal) {
		this.downloadPhase = "runtime";
		await mkdir(this.root, { recursive: true });
		const python = this.findPython();
		if (!python) throw new Error("Python 3.10+ is required to install Qwen3-ASR MLX");
		if (!existsSync(this.python())) await this.runStep(python, [
			"-m",
			"venv",
			join(this.root, "venv")
		], signal, 18e4);
		await this.runStep(this.python(), [
			"-m",
			"pip",
			"install",
			"--disable-pip-version-check",
			"mlx-qwen3-asr==0.4.4"
		], signal, 9e5);
		signal.throwIfAborted();
		this.downloadPhase = "weights";
		const directory = qwenModelPath(model, this.root);
		await mkdir(directory, { recursive: true });
		await this.runStep(this.python(), [
			this.script,
			"--download",
			model,
			directory
		], signal, 36e5);
	}
	findPython() {
		for (const exe of [
			"python3.13",
			"python3.12",
			"python3.11",
			"python3.10",
			"python3"
		]) if (spawnSync(exe, ["-c", "import sys; assert sys.version_info >= (3,10)"], {
			timeout: 4e3,
			stdio: "ignore"
		}).status === 0) return exe;
		return null;
	}
	runStep(binary, args, signal, timeoutMs) {
		return new Promise((resolve, reject) => {
			if (signal.aborted) {
				reject(/* @__PURE__ */ new Error("Download cancelled"));
				return;
			}
			const child = spawn(binary, args, { stdio: [
				"ignore",
				"pipe",
				"pipe"
			] });
			this.downloadChild = child;
			let stderr = "";
			let settled = false;
			const finish = (error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				signal.removeEventListener("abort", onAbort);
				if (this.downloadChild === child) this.downloadChild = void 0;
				if (error) reject(error);
				else resolve();
			};
			const onAbort = () => {
				child.kill("SIGTERM");
				finish(/* @__PURE__ */ new Error("Download cancelled"));
			};
			const timer = setTimeout(() => {
				child.kill("SIGTERM");
				finish(/* @__PURE__ */ new Error("Qwen3-ASR installation step timed out"));
			}, timeoutMs);
			child.stderr.on("data", (chunk) => {
				stderr = (stderr + String(chunk)).slice(-1200);
			});
			child.stdout.on("data", () => void 0);
			child.once("error", (error) => finish(error));
			child.once("close", (code) => {
				finish(signal.aborted ? /* @__PURE__ */ new Error("Download cancelled") : code === 0 ? void 0 : /* @__PURE__ */ new Error("Qwen3-ASR installation failed: " + stderr.slice(-350)));
			});
			signal.addEventListener("abort", onAbort, { once: true });
		});
	}
};
var Qwen3RealtimeAsrSession = class {
	runtime;
	model;
	ttlMinutes;
	context;
	sessionId;
	constructor(runtime, model, ttlMinutes, context = "") {
		this.runtime = runtime;
		this.model = model;
		this.ttlMinutes = ttlMinutes;
		this.context = context;
	}
	async open(signal) {
		signal?.throwIfAborted();
		this.sessionId = await this.runtime.open(this.model, this.ttlMinutes, this.context);
		if (signal?.aborted) {
			this.close();
			signal.throwIfAborted();
		}
	}
	async sendAudio(audio, signal) {
		signal?.throwIfAborted();
		if (!this.sessionId) throw new Error("Qwen3-ASR session not open");
		return this.runtime.feed(this.sessionId, audio);
	}
	async finish(signal) {
		signal?.throwIfAborted();
		if (!this.sessionId) throw new Error("Qwen3-ASR session not open");
		const id = this.sessionId;
		this.sessionId = void 0;
		return this.runtime.finish(id);
	}
	close() {
		if (this.sessionId) this.runtime.release(this.sessionId);
		this.sessionId = void 0;
	}
};
// src/settings-store.ts
const FLAT_SETTING_KEYS = Object.keys(DEFAULT_EARS_SETTINGS);
const CURRENT_STORED_PATHS = /* @__PURE__ */ new Map([
	["voiceShortcutEnabled", [
		"general",
		"shortcut",
		"enabled"
	]],
	["voiceShortcut", [
		"general",
		"shortcut",
		"value"
	]],
	["voiceSoundsEnabled", ["general", "soundsEnabled"]],
	["localQwenModel", [
		"recognition",
		"localQwen",
		"model"
	]],
	["localQwenIdleTtlMinutes", [
		"recognition",
		"localQwen",
		"idleTtlMinutes"
	]],
	["localQwenPrompt", [
		"recognition",
		"localQwen",
		"prompt"
	]],
	["maxRecordingSeconds", ["recognition", "maxRecordingSeconds"]]
]);
function readPath(raw, path) {
	let value = raw;
	for (const key of path) {
		if (!isRecord(value)) return void 0;
		value = value[key];
	}
	return value;
}
function flattenStoredSettings(raw) {
	const result = { ...DEFAULT_EARS_SETTINGS };
	for (const [field, path] of CURRENT_STORED_PATHS) {
		const value = readPath(raw, path) ?? readPath(raw, [field]);
		if (value !== void 0) result[field] = value;
	}
	return result;
}
function unflattenEarsSettings(settings) {
	return {
		schemaVersion: 4,
		general: {
			shortcut: {
				enabled: settings.voiceShortcutEnabled,
				value: settings.voiceShortcut
			},
			soundsEnabled: settings.voiceSoundsEnabled
		},
		recognition: {
			localQwen: {
				model: settings.localQwenModel,
				idleTtlMinutes: settings.localQwenIdleTtlMinutes,
				prompt: settings.localQwenPrompt
			},
			maxRecordingSeconds: settings.maxRecordingSeconds
		}
	};
}
function normalizeStoredEarsSettings(raw) {
	return unflattenEarsSettings(flattenStoredSettings(raw));
}
function flatSettingsPatchToStoredPatch(patch) {
	const result = {};
	for (const [field, value] of Object.entries(patch)) {
		const path = CURRENT_STORED_PATHS.get(field);
		if (value === void 0 || path === void 0) continue;
		let target = result;
		for (const segment of path.slice(0, -1)) {
			const next = target[segment];
			if (!isRecord(next)) target[segment] = {};
			target = target[segment];
		}
		target[path[path.length - 1]] = value;
	}
	return result;
}
/** Return requested values for validation and their retained persistence projection. */
function applyFlatSettingsPatchWithSettings(stored, patch) {
	const requested = { ...flattenStoredSettings(normalizeStoredEarsSettings(stored)) };
	for (const [key, value] of Object.entries(patch)) if (value !== void 0 && isFlatSettingKey(key)) requested[key] = value;
	return {
		requested,
		next: unflattenEarsSettings(requested)
	};
}
function flattenOverriddenSettings(raw) {
	return [...CURRENT_STORED_PATHS].filter(([field, path]) => readPath(raw, path) !== void 0 || readPath(raw, [field]) !== void 0).map(([field]) => field);
}
function isFlatSettingKey(value) {
	return FLAT_SETTING_KEYS.includes(value);
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
// src/settings/host-settings.ts
/** Read one resolved dsh-ears entry form, or undefined while it is unavailable. */
function findEarsSettingsForm(provider, redactSecrets) {
	if (provider === void 0) return void 0;
	try {
		return provider.describe({ redactSecrets }).find((item) => String(item.ns) === SETTINGS_NAMESPACE);
	} catch {
		return;
	}
}
/**
* Read the resolved settings the plugin acts on.
*
* The resolved entry config carries schema defaults, the composition base layer,
* and the user layer, with `role('secret')` values intact. `userLayerAvailable`
* reports whether the profile holds an explicit user override, which decides
* whether a canonicalizing migration may rewrite the entry config; `revision`
* is the version of that document, which every write built from this read must
* still be standing on.
*/
function readEarsSettingsRaw(provider) {
	const form = findEarsSettingsForm(provider, false);
	if (form === void 0 || form.value === void 0) return {
		raw: {},
		userLayerAvailable: false,
		revision: void 0
	};
	return {
		raw: form.value,
		userLayerAvailable: form.user !== void 0,
		revision: form.revision
	};
}
/** Merge one nested settings patch into the profile's user layer. */
async function updateEarsSettingsPatch(provider, patch, expectedRevision) {
	if (provider === void 0) return;
	await provider.update(SETTINGS_NAMESPACE, patch, expectedRevision);
}
/** Replace the profile's user layer with one complete nested settings section. */
async function replaceEarsSettingsSection(provider, section, expectedRevision) {
	if (provider === void 0) return;
	await provider.replace(SETTINGS_NAMESPACE, section, expectedRevision);
}
const PLUGIN_REPOSITORY_URL = "https://github.com/iBobbyTS/dsh-ears";
const PLUGIN_REPOSITORY_SLUG = "@iBobbyTS/dsh-ears";
const DSH_COMPATIBILITY = ">=0.2.2-rc.1";
function readInstalledAboutInfo(packageJsonPath = resolvePackageJsonPath()) {
	const raw = JSON.parse(readFileSync(packageJsonPath, "utf8"));
	const version = typeof raw.version === "string" && raw.version.trim() !== "" ? raw.version.trim() : "0.0.0";
	const license = typeof raw.license === "string" && raw.license.trim() !== "" ? raw.license.trim() : "MIT";
	const repository = repositoryUrlFromPackage(raw.repository);
	return {
		repository,
		repositorySlug: repositorySlugFromUrl(repository),
		version,
		license,
		dshCompatibility: DSH_COMPATIBILITY
	};
}
function repositoryUrlFromPackage(value) {
	const url = (typeof value === "string" ? value : value !== null && typeof value === "object" && "url" in value && typeof value.url === "string" ? value.url : "").trim().replace(/^git\+/, "").replace(/\.git$/, "");
	return url !== "" ? url : PLUGIN_REPOSITORY_URL;
}
function repositorySlugFromUrl(url) {
	const match = /github\.com\/([^/]+\/[^/]+)/i.exec(url);
	return match === null ? PLUGIN_REPOSITORY_SLUG : `@${match[1].replace(/\.git$/, "")}`;
}
function resolvePackageJsonPath() {
	return join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
}
// src/errors.ts
/** Stable business error codes shared by the Host and browser client. */
const EARS_ERROR_CODES = {
	settingsUnavailable: "settings.unavailable",
	asrAudioEmpty: "asr.audioEmpty",
	asrAudioInvalid: "asr.audioInvalid",
	asrAudioTooLarge: "asr.audioTooLarge",
	asrNoTranscript: "asr.noTranscript",
	asrUnexpected: "asr.unexpected",
	browserMediaUnavailable: "browser.mediaUnavailable"
};
const MAX_ERROR_TEXT_LENGTH = 800;
function sanitizeEarsErrorText(value) {
	return value.replace(/\s+/g, " ").replace(/\bBearer\s+\S+/gi, "Bearer [redacted]").replace(/([?&](?:api[-_]?key|token|secret|password|authorization)=)[^&\s]*/gi, "$1[redacted]").replace(/([a-z][a-z\d+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, "$1[redacted]@").trim().slice(0, MAX_ERROR_TEXT_LENGTH);
}
function sanitizeEarsErrorParams(params) {
	if (params === void 0) return void 0;
	return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, typeof value === "string" ? sanitizeEarsErrorText(value) : value]));
}
var EarsError = class extends Error {
	code;
	params;
	constructor(code, message, params) {
		super(message);
		this.name = "EarsError";
		this.code = code;
		this.params = params;
	}
};
function earsErrorCode(error) {
	if (!(error instanceof EarsError)) return void 0;
	return error.code;
}
function earsErrorParams(error) {
	if (!(error instanceof EarsError)) return void 0;
	return error.params;
}
// src/asr/service.ts
const REALTIME_SESSION_IDLE_TIMEOUT_MS = 6e4;
var QwenService = class extends TypertRemoteService {
	qwen3 = new Qwen3Runtime();
	realtimeSessions = /* @__PURE__ */ new Map();
	constructor(ctx) {
		super(ctx, "dshEarsQwen", { namespace: "dshEars" });
		ctx.effect(() => () => {
			this.qwen3.dispose();
			for (const entry of this.realtimeSessions.values()) {
				clearTimeout(entry.timer);
				entry.session.close();
			}
			this.realtimeSessions.clear();
		}, "dsh-ears Qwen runtime lifecycle");
	}
	getSettings() {
		const provider = this.settingsProvider();
		if (provider === void 0) return {
			available: false,
			writable: false,
			settings: DEFAULT_EARS_SETTINGS,
			recoveredSettingsFields: [],
			overridden: []
		};
		const snapshot = this.readSettingsSnapshot();
		const form = findEarsSettingsForm(provider, true);
		return {
			available: true,
			writable: provider.writable,
			settings: snapshot.settings,
			recoveredSettingsFields: [...snapshot.repairedFields],
			overridden: flattenOverriddenSettings(form?.user)
		};
	}
	async updateSettings(patch, signal) {
		const provider = this.settingsProvider();
		if (provider === void 0) return this.getSettings();
		signal.throwIfAborted();
		const current = this.readSettingsSnapshot();
		const { requested, next } = applyFlatSettingsPatchWithSettings(current.stored, patch);
		validateEarsSettings(requested);
		if (current.repairedFields.length > 0) await replaceEarsSettingsSection(provider, next, current.revision);
		else await updateEarsSettingsPatch(provider, flatSettingsPatchToStoredPatch(patch), current.revision);
		return this.getSettings();
	}
	async getQwenModelState(model) {
		return this.qwen3.state(model, this.optionalSettings().localQwenIdleTtlMinutes);
	}
	async downloadQwenModel(model) {
		return this.qwen3.download(model);
	}
	async cancelQwenModelDownload(model) {
		return this.qwen3.cancelDownload(model);
	}
	async deleteQwenModel(model) {
		return this.qwen3.deleteModel(model);
	}
	async startQwenService(model) {
		return this.qwen3.load(model, this.optionalSettings().localQwenIdleTtlMinutes);
	}
	async unloadQwenService(model) {
		return this.qwen3.unloadModel(model);
	}
	getAbout() {
		return readInstalledAboutInfo();
	}
	async startRealtime(signal) {
		let session;
		let registered = false;
		try {
			signal.throwIfAborted();
			const settings = this.requireSettings();
			session = new Qwen3RealtimeAsrSession(this.qwen3, settings.localQwenModel, settings.localQwenIdleTtlMinutes, settings.localQwenPrompt);
			await session.open(signal);
			signal.throwIfAborted();
			const sessionId = randomUUID();
			this.realtimeSessions.set(sessionId, {
				session,
				timer: this.scheduleRealtimeSessionExpiry(sessionId, session)
			});
			registered = true;
			return { sessionId };
		} catch (error) {
			if (session !== void 0 && !registered) session.close();
			if (signal.aborted) signal.throwIfAborted();
			if (error instanceof EarsError) throw error;
			const message = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "Realtime recognition failed to start";
			throw new EarsError(EARS_ERROR_CODES.asrUnexpected, message);
		}
	}
	async sendRealtimeAudio(sessionId, audioBase64, signal) {
		signal.throwIfAborted();
		const entry = this.realtimeSessions.get(sessionId);
		if (entry === void 0) throw new EarsError(EARS_ERROR_CODES.asrUnexpected, "Realtime session was not found");
		const audio = decodeAudio(audioBase64);
		try {
			const result = await entry.session.sendAudio(audio, signal);
			if (this.realtimeSessions.get(sessionId) === entry) this.refreshRealtimeSessionExpiry(sessionId, entry);
			return result;
		} catch (error) {
			this.removeRealtimeSession(sessionId, entry.session);
			throw error;
		}
	}
	async finishRealtime(sessionId, signal) {
		const entry = this.realtimeSessions.get(sessionId);
		try {
			signal.throwIfAborted();
			if (entry === void 0) throw new EarsError(EARS_ERROR_CODES.asrUnexpected, "Realtime session was not found");
			const text = await entry.session.finish(signal);
			return remoteTextSuccess(text);
		} catch (error) {
			return toRemoteTextFailure(error, signal, EARS_ERROR_CODES.asrUnexpected, "Realtime recognition failed");
		} finally {
			this.removeRealtimeSession(sessionId, entry?.session);
		}
	}
	async cancelRealtime(sessionId) {
		this.removeRealtimeSession(sessionId);
		return { cancelled: true };
	}
	scheduleRealtimeSessionExpiry(sessionId, session) {
		return setTimeout(() => {
			const entry = this.realtimeSessions.get(sessionId);
			if (entry?.session !== session) return;
			entry.session.close();
			clearTimeout(entry.timer);
			this.realtimeSessions.delete(sessionId);
		}, REALTIME_SESSION_IDLE_TIMEOUT_MS);
	}
	refreshRealtimeSessionExpiry(sessionId, entry) {
		clearTimeout(entry.timer);
		entry.timer = this.scheduleRealtimeSessionExpiry(sessionId, entry.session);
	}
	removeRealtimeSession(sessionId, expectedSession) {
		const entry = this.realtimeSessions.get(sessionId);
		if (entry === void 0 || expectedSession !== void 0 && entry.session !== expectedSession) return;
		clearTimeout(entry.timer);
		entry.session.close();
		this.realtimeSessions.delete(sessionId);
	}
	requireSettings() {
		if (this.settingsProvider() === void 0) throw new EarsError(EARS_ERROR_CODES.settingsUnavailable, "dsh-ears settings are unavailable");
		return this.readSettingsSnapshot().settings;
	}
	settingsProvider() {
		return this.ctx.get("settings");
	}
	optionalSettings() {
		return this.settingsProvider() === void 0 ? DEFAULT_EARS_SETTINGS : this.readSettingsSnapshot().settings;
	}
	readSettingsSnapshot() {
		const rawState = readEarsSettingsRaw(this.settingsProvider());
		const repair = repairInvalidEarsSettings(flattenStoredSettings(rawState.raw));
		return {
			...rawState,
			settings: repair.settings,
			stored: unflattenEarsSettings(repair.settings),
			repairedFields: repair.repairedFields
		};
	}
};
function toRemoteTextFailure(error, signal, fallbackCode, fallbackMessage) {
	if (signal.aborted) signal.throwIfAborted();
	if (remoteErrorOf(error) !== void 0) throw error;
	const knownCode = earsErrorCode(error);
	const diagnostic = sanitizeEarsErrorText(error instanceof Error ? error.message : typeof error === "string" ? error : "");
	const message = knownCode === void 0 ? diagnostic === "" ? fallbackMessage : `${fallbackMessage}: ${diagnostic}` : diagnostic === "" ? fallbackMessage : diagnostic;
	const params = sanitizeEarsErrorParams(earsErrorParams(error) ?? (knownCode === void 0 && diagnostic !== "" ? { detail: diagnostic } : void 0));
	return remoteTextFailure(knownCode ?? fallbackCode, message, params);
}
function decodeAudio(value) {
	if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, "The recorded audio is not valid base64");
	const audio = Buffer.from(value, "base64");
	if (audio.byteLength === 0) throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, "The recorded audio is empty");
	if (audio.byteLength > 25165824) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, "The recorded audio is too large");
	return new Uint8Array(audio);
}
// src/index.ts
const name = "dsh-ears";
/** Plugin configuration schema; dsh derives the entry's settings form from it. */
const Config = EarsSettingsSchema;
/** The settings service owns the profile entry config this plugin reads and writes. */
const inject = ["settings"];
async function apply(ctx) {
	const disposePresentation = ctx.settings.configure({ auto: false });
	ctx.effect(() => disposePresentation, "dsh-ears settings presentation");
	await ctx.plugin(QwenService);
	ctx.effect(() => {
		return () => void 0;
	}, "dsh-ears lifecycle");
}
export { Config, apply, inject, name };

//# sourceMappingURL=index.js.map