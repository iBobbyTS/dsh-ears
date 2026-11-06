import { a as qwenModelStateSchema, c as realtimeTranscriptSchema, f as textSchema, i as earsSettingsViewSchema, n as audioBase64Schema, o as realtimeCancelledSchema, r as earsSettingsPatchSchema, s as realtimeSessionSchema, t as aboutInfoSchema, u as remoteTextResultSchema } from "./remote-contract-DkmNVc6T.js";
//#region src/remote-definitions.ts
/**
* One strict wire codec over a zod v4 schema.
*
* The Typert strict contract carries its schema behind a `create()` factory so
* the boundary materializes it on first use, rather than reading a `schema`
* property. Every descriptor in this table builds its codecs here, which keeps
* the factory present on every codec by construction.
*/
function strictCodec(typeSymbol, schema) {
	return {
		mode: "strict",
		typeSymbol,
		create: () => schema
	};
}
/**
* The one wire-level descriptor table used by both the Host manifest and the
* browser Remote contribution. Keeping the schemas and cancellation metadata
* in one value prevents the two package faces from drifting apart.
*/
const EARS_REMOTE_DESCRIPTORS = [
	{
		id: "dsh-ears#dshEars/getAbout",
		service: "dshEarsQwen",
		namespace: "dshEars",
		method: "getAbout",
		invocation: { kind: "direct" },
		parameters: [],
		result: strictCodec("dsh-ears#AboutInfo", aboutInfoSchema)
	},
	{
		id: "dsh-ears#dshEars/getSettings",
		service: "dshEarsQwen",
		namespace: "dshEars",
		method: "getSettings",
		invocation: { kind: "direct" },
		parameters: [],
		result: strictCodec("dsh-ears#EarsSettingsView", earsSettingsViewSchema)
	},
	{
		id: "dsh-ears#dshEars/updateSettings",
		service: "dshEarsQwen",
		namespace: "dshEars",
		method: "updateSettings",
		invocation: { kind: "direct" },
		parameters: [{
			name: "patch",
			wire: "patch",
			source: "json",
			codec: strictCodec("dsh-ears#EarsSettingsPatch", earsSettingsPatchSchema)
		}],
		cancellation: { parameter: "signal" },
		result: strictCodec("dsh-ears#EarsSettingsView", earsSettingsViewSchema)
	},
	...[
		["getQwenModelState", "dsh-ears#dshEars/getQwenModelState"],
		["downloadQwenModel", "dsh-ears#dshEars/downloadQwenModel"],
		["cancelQwenModelDownload", "dsh-ears#dshEars/cancelQwenModelDownload"],
		["deleteQwenModel", "dsh-ears#dshEars/deleteQwenModel"],
		["startQwenService", "dsh-ears#dshEars/startQwenService"],
		["unloadQwenService", "dsh-ears#dshEars/unloadQwenService"]
	].map(([method, id]) => ({
		id,
		service: "dshEarsQwen",
		namespace: "dshEars",
		method,
		invocation: { kind: "direct" },
		parameters: [{
			name: "model",
			wire: "model",
			source: "json",
			codec: strictCodec("string", textSchema)
		}],
		result: strictCodec("dsh-ears#Qwen3ModelState", qwenModelStateSchema)
	})),
	{
		id: "dsh-ears#dshEars/startRealtime",
		service: "dshEarsQwen",
		namespace: "dshEars",
		method: "startRealtime",
		invocation: { kind: "direct" },
		parameters: [],
		cancellation: { parameter: "signal" },
		result: strictCodec("dsh-ears#RealtimeSession", realtimeSessionSchema)
	},
	{
		id: "dsh-ears#dshEars/sendRealtimeAudio",
		service: "dshEarsQwen",
		namespace: "dshEars",
		method: "sendRealtimeAudio",
		invocation: { kind: "direct" },
		parameters: [{
			name: "sessionId",
			wire: "sessionId",
			source: "json",
			codec: strictCodec("string", textSchema)
		}, {
			name: "audioBase64",
			wire: "audioBase64",
			source: "json",
			codec: strictCodec("string", audioBase64Schema)
		}],
		cancellation: { parameter: "signal" },
		result: strictCodec("dsh-ears#RealtimeTranscript", realtimeTranscriptSchema)
	},
	{
		id: "dsh-ears#dshEars/finishRealtime",
		service: "dshEarsQwen",
		namespace: "dshEars",
		method: "finishRealtime",
		invocation: { kind: "direct" },
		parameters: [{
			name: "sessionId",
			wire: "sessionId",
			source: "json",
			codec: strictCodec("string", textSchema)
		}],
		cancellation: { parameter: "signal" },
		result: strictCodec("dsh-ears#RemoteTextResult", remoteTextResultSchema)
	},
	{
		id: "dsh-ears#dshEars/cancelRealtime",
		service: "dshEarsQwen",
		namespace: "dshEars",
		method: "cancelRealtime",
		invocation: { kind: "direct" },
		parameters: [{
			name: "sessionId",
			wire: "sessionId",
			source: "json",
			codec: strictCodec("string", textSchema)
		}],
		result: strictCodec("dsh-ears#RealtimeCancelled", realtimeCancelledSchema)
	}
];
//#endregion
export { EARS_REMOTE_DESCRIPTORS as t };

//# sourceMappingURL=remote-definitions-qf90Q8ae.js.map