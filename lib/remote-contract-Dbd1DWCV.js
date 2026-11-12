import { z } from "zod";
// src/shortcut.ts
const SHORTCUT_MODIFIERS = [
	"ctrl",
	"alt",
	"shift",
	"meta"
];
/** Key tokens that type or act on text; never valid as a bare shortcut. */
const TEXT_ACTION_TOKENS = /* @__PURE__ */ new Set([
	"space",
	"enter",
	"tab",
	"backspace",
	"delete",
	"arrowup",
	"arrowdown",
	"arrowleft",
	"arrowright",
	"home",
	"end",
	"pageup",
	"pagedown",
	"insert",
	"backquote",
	"semicolon",
	"period",
	"comma",
	"minus",
	"equal",
	"bracketleft",
	"bracketright",
	"backslash",
	"slash",
	"quote",
	"intlbackslash"
]);
/** Reserved browser/OS chords that produce a collision warning. */
const RESERVED_CHORDS = /* @__PURE__ */ new Set([
	"f1",
	"f3",
	"f4",
	"f5",
	"f6",
	"f10",
	"f11",
	"f12",
	"ctrl+f5",
	"alt",
	"meta",
	"ctrl+space",
	"alt+space",
	"alt+tab",
	"ctrl+tab",
	"ctrl+shift+tab",
	"alt+f4",
	"ctrl+alt+delete",
	"meta+space",
	"meta+backquote",
	"ctrl+enter",
	"meta+enter"
]);
for (let index = 0; index < 26; index += 1) {
	const letter = String.fromCharCode(97 + index);
	RESERVED_CHORDS.add(`ctrl+${letter}`);
	RESERVED_CHORDS.add(`meta+${letter}`);
}
for (const letter of "tnprijksdwqf") RESERVED_CHORDS.add(`ctrl+shift+${letter}`);
for (const letter of "nwqacphs") RESERVED_CHORDS.add(`shift+meta+${letter}`);
for (let index = 0; index <= 9; index += 1) {
	RESERVED_CHORDS.add(`ctrl+${index}`);
	RESERVED_CHORDS.add(`meta+${index}`);
}
const KEY_TOKEN_BY_CODE = {
	Space: "space",
	Backquote: "backquote",
	Semicolon: "semicolon",
	Period: "period",
	Comma: "comma",
	Minus: "minus",
	Equal: "equal",
	BracketLeft: "bracketleft",
	BracketRight: "bracketright",
	Backslash: "backslash",
	Slash: "slash",
	Quote: "quote",
	IntlBackslash: "intlbackslash",
	Enter: "enter",
	Tab: "tab",
	Backspace: "backspace",
	Delete: "delete",
	ArrowUp: "arrowup",
	ArrowDown: "arrowdown",
	ArrowLeft: "arrowleft",
	ArrowRight: "arrowright",
	Home: "home",
	End: "end",
	PageUp: "pageup",
	PageDown: "pagedown",
	Insert: "insert"
};
for (let index = 1; index <= 12; index += 1) KEY_TOKEN_BY_CODE[`F${index}`] = `f${index}`;
for (let index = 0; index < 26; index += 1) {
	const letter = String.fromCharCode(65 + index);
	KEY_TOKEN_BY_CODE[`Key${letter}`] = letter.toLowerCase();
}
for (let index = 0; index <= 9; index += 1) KEY_TOKEN_BY_CODE[`Digit${index}`] = String(index);
const CODE_BY_KEY_TOKEN = Object.fromEntries(Object.entries(KEY_TOKEN_BY_CODE).map(([code, token]) => [token, code]));
function isModifierToken(token) {
	return SHORTCUT_MODIFIERS.includes(token);
}
/** Parse a canonical chord into modifiers and key token; null on malformed input. */
function parseShortcut(chord) {
	if (typeof chord !== "string") return null;
	if (chord.trim() === "" || chord.length > 64) return null;
	const tokens = chord.trim().toLowerCase().split("+").filter((token) => token !== "");
	if (tokens.length === 0) return null;
	if (tokens.every(isModifierToken)) {
		const modifiers = [];
		for (const token of tokens) if (!modifiers.includes(token)) modifiers.push(token);
		return {
			modifiers,
			key: ""
		};
	}
	const last = tokens[tokens.length - 1];
	if (!(last in CODE_BY_KEY_TOKEN)) return null;
	const modifiers = [];
	for (const token of tokens.slice(0, -1)) {
		if (!isModifierToken(token)) return null;
		if (!modifiers.includes(token)) modifiers.push(token);
	}
	return {
		modifiers,
		key: last
	};
}
/** Determine whether a shortcut chord should be rejected as invalid or a bare typing key. */
function shortcutRejectReason(chord) {
	if (typeof chord !== "string" || chord.trim() === "" || chord.length > 64) return "invalid";
	const parsed = parseShortcut(chord);
	if (parsed === null) return "invalid";
	if (parsed.key === "") return parsed.modifiers.length === 0 ? "invalid" : null;
	if (/^[a-z]$/.test(parsed.key) || /^[0-9]$/.test(parsed.key)) {
		if (parsed.modifiers.length === 0 || parsed.modifiers.includes("alt")) return "typing-key";
		return null;
	}
	if (parsed.modifiers.length === 0 && TEXT_ACTION_TOKENS.has(parsed.key)) return "typing-key";
	return null;
}
function isValidStoredShortcut(chord) {
	return shortcutRejectReason(chord) === null;
}
const KEY_LABELS = {
	space: "Space",
	backquote: "`",
	semicolon: ";",
	period: ".",
	comma: ",",
	minus: "-",
	equal: "=",
	bracketleft: "[",
	bracketright: "]",
	backslash: "\\",
	slash: "/",
	quote: "'",
	intlbackslash: "\\",
	enter: "Enter",
	tab: "Tab",
	backspace: "Backspace",
	delete: "Delete",
	home: "Home",
	end: "End",
	insert: "Insert",
	arrowup: "↑",
	arrowdown: "↓",
	arrowleft: "←",
	arrowright: "→",
	pageup: "Page Up",
	pagedown: "Page Down"
};
for (let index = 1; index <= 12; index += 1) KEY_LABELS[`f${index}`] = `F${index}`;
// src/settings/recognition.ts
const QWEN3_MODELS = ["1.7b-8bit", "0.6b-8bit"];
const DEFAULT_QWEN3_MODEL = "1.7b-8bit";
const validQwen3TTL = (minutes) => Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 1440;
/** Matches the context cap enforced by the Python worker's start command. */
const MAX_QWEN3_PROMPT_LENGTH = 1024;
const DEFAULT_RECOGNITION_SETTINGS = Object.freeze({
	localQwen: Object.freeze({
		model: DEFAULT_QWEN3_MODEL,
		idleTtlMinutes: 60,
		prompt: ""
	}),
	maxRecordingSeconds: 120
});
function isValidRecordingLimit(value) {
	return Number.isSafeInteger(value) && value >= 1 && value <= 600;
}
// src/config.ts
const SETTINGS_NAMESPACE = "dsh-ears";
const DEFAULT_EARS_SETTINGS = Object.freeze({
	localQwenModel: DEFAULT_RECOGNITION_SETTINGS.localQwen.model,
	localQwenIdleTtlMinutes: DEFAULT_RECOGNITION_SETTINGS.localQwen.idleTtlMinutes,
	localQwenPrompt: DEFAULT_RECOGNITION_SETTINGS.localQwen.prompt,
	maxRecordingSeconds: DEFAULT_RECOGNITION_SETTINGS.maxRecordingSeconds,
	voiceShortcutEnabled: true,
	voiceShortcut: "ctrl+shift+space",
	voiceSoundsEnabled: true
});
function validField(field, value) {
	switch (field) {
		case "localQwenModel": return typeof value === "string" && QWEN3_MODELS.includes(value);
		case "localQwenIdleTtlMinutes": return typeof value === "number" && validQwen3TTL(value);
		case "localQwenPrompt": return typeof value === "string" && value.trim().length <= 1024;
		case "maxRecordingSeconds": return typeof value === "number" && isValidRecordingLimit(value);
		case "voiceShortcut": return typeof value === "string" && isValidStoredShortcut(value);
		default: return typeof value === "boolean";
	}
}
function validateEarsSettings(settings) {
	for (const field of Object.keys(DEFAULT_EARS_SETTINGS)) if (!validField(field, settings[field])) throw new Error(`Invalid dsh-ears setting: ${field}`);
}
function repairInvalidEarsSettings(settings) {
	const repaired = { ...settings };
	const repairedFields = [];
	for (const field of Object.keys(DEFAULT_EARS_SETTINGS)) if (!validField(field, repaired[field])) {
		repaired[field] = DEFAULT_EARS_SETTINGS[field];
		repairedFields.push(field);
	}
	return {
		settings: repaired,
		repairedFields
	};
}
// src/remote-contract.ts
const textSchema = z.string();
const earsSettingsSchema = z.object({
	localQwenModel: z.string(),
	localQwenIdleTtlMinutes: z.number(),
	localQwenPrompt: z.string(),
	maxRecordingSeconds: z.number(),
	voiceShortcutEnabled: z.boolean(),
	voiceShortcut: z.string(),
	voiceSoundsEnabled: z.boolean()
});
const earsSettingsPatchSchema = z.object({
	localQwenModel: z.enum(QWEN3_MODELS).optional(),
	localQwenIdleTtlMinutes: z.number().int().min(1).max(1440).optional(),
	localQwenPrompt: z.string().max(MAX_QWEN3_PROMPT_LENGTH).optional(),
	maxRecordingSeconds: z.number().optional(),
	voiceShortcutEnabled: z.boolean().optional(),
	voiceShortcut: z.string().optional(),
	voiceSoundsEnabled: z.boolean().optional()
}).strict();
const earsSettingsViewSchema = z.object({
	available: z.boolean(),
	writable: z.boolean(),
	settings: earsSettingsSchema,
	recoveredSettingsFields: z.array(z.string()).optional(),
	overridden: z.array(z.string())
});
const errorParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]));
const audioBase64Schema = z.string().min(1).max(33554432);
const qwenModelStateSchema = z.object({
	supported: z.boolean(),
	runtimeInstalled: z.boolean(),
	downloaded: z.boolean(),
	downloading: z.boolean(),
	phase: z.enum([
		"idle",
		"runtime",
		"weights"
	]),
	progress: z.number().nullable(),
	loaded: z.boolean(),
	activeSessions: z.number(),
	expiresAt: z.number().nullable(),
	ttlMinutes: z.number(),
	error: z.string().nullable()
});
const remoteTextResultSchema = z.discriminatedUnion("status", [z.object({
	status: z.literal("ok"),
	text: z.string()
}), z.object({
	status: z.literal("error"),
	code: z.string(),
	message: z.string(),
	params: errorParamsSchema.optional()
})]);
const realtimeSessionSchema = z.object({ sessionId: z.string().min(1) });
const realtimeTranscriptSchema = z.object({
	text: z.string(),
	final: z.boolean()
});
const realtimeCancelledSchema = z.object({ cancelled: z.literal(true) });
function remoteTextSuccess(text) {
	return {
		status: "ok",
		text
	};
}
function remoteTextFailure(code, message, params) {
	return {
		status: "error",
		code,
		message,
		...params === void 0 ? {} : { params }
	};
}
const aboutInfoSchema = z.object({
	repository: z.string(),
	repositorySlug: z.string(),
	version: z.string(),
	license: z.string(),
	dshCompatibility: z.string()
});
export { DEFAULT_RECOGNITION_SETTINGS as _, qwenModelStateSchema as a, realtimeTranscriptSchema as c, remoteTextSuccess as d, textSchema as f, validateEarsSettings as g, repairInvalidEarsSettings as h, earsSettingsViewSchema as i, remoteTextFailure as l, SETTINGS_NAMESPACE as m, audioBase64Schema as n, realtimeCancelledSchema as o, DEFAULT_EARS_SETTINGS as p, earsSettingsPatchSchema as r, realtimeSessionSchema as s, aboutInfoSchema as t, remoteTextResultSchema as u, QWEN3_MODELS as v, validQwen3TTL as y };

//# sourceMappingURL=remote-contract-Dbd1DWCV.js.map