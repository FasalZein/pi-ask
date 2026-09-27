import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { validateParams } from "./ask-tool-helpers.ts";
import { AskParamsSchema } from "./schema.ts";
import type { AskParams } from "./types.ts";

export const ASK_PAYLOAD_ENTRY_TYPE = "ask:payload";
export const ASK_PAYLOAD_ENTRY_VERSION = 1;

export type AskPayloadSource = "answer-extraction" | "tool";

export interface AskPayloadEntryData {
	params: AskParams;
	source: AskPayloadSource;
	sourceEntryId?: string;
	timestamp: number;
	version: typeof ASK_PAYLOAD_ENTRY_VERSION;
}

const MAX_TREE_LABEL_LENGTH = 60;

export function askTreeLabel(
	params: AskParams,
	outcome?: "answered" | "dismissed"
): string {
	const title = params.title?.replace(/\s+/g, " ").trim();
	const first = params.questions[0];
	const question = (first?.label || first?.prompt || "ask")
		.replace(/\s+/g, " ")
		.trim();
	const count = params.questions.length;
	const detail =
		title || `${question} (${count} question${count === 1 ? "" : "s"})`;
	const suffix = outcome ? ` (${outcome})` : "";
	const prefix = "ask: ";
	const available = MAX_TREE_LABEL_LENGTH - prefix.length - suffix.length;
	const chars = Array.from(detail);
	const shortened =
		chars.length > available
			? `${chars
					.slice(0, available - 1)
					.join("")
					.trimEnd()}…`
			: detail;
	return `${prefix}${shortened}${suffix}`;
}

export function appendAskPayload(
	pi: Pick<ExtensionAPI, "appendEntry" | "setLabel">,
	ctx: Pick<ExtensionContext, "sessionManager">,
	data: Omit<AskPayloadEntryData, "timestamp" | "version">
): void {
	const payload = {
		version: ASK_PAYLOAD_ENTRY_VERSION,
		timestamp: Date.now(),
		...data,
	};
	pi.appendEntry(ASK_PAYLOAD_ENTRY_TYPE, payload);
	// appendEntry returns void in both supported Pi versions; the append is synchronous.
	const entry = ctx.sessionManager?.getBranch().at(-1);
	if (
		entry?.type === "custom" &&
		entry.customType === ASK_PAYLOAD_ENTRY_TYPE &&
		entry.data === payload
	) {
		pi.setLabel(entry.id, askTreeLabel(data.params));
	}
}

export function findLatestPayloadInCurrentBranch(
	ctx: Pick<ExtensionContext, "sessionManager">,
	source: AskPayloadSource
): { data?: AskPayloadEntryData; invalidMatchFound: boolean } {
	let invalidMatchFound = false;
	for (const entry of [...ctx.sessionManager.getBranch()].reverse()) {
		if (!isAskPayloadEntry(entry)) {
			continue;
		}
		const data = entry.data;
		if (data?.source !== source) {
			continue;
		}
		if (isValidAskPayloadData(data)) {
			return { data, invalidMatchFound };
		}
		invalidMatchFound = true;
	}
	return { invalidMatchFound };
}

export function findPayloadForSourceEntry(
	ctx: Pick<ExtensionContext, "sessionManager">,
	sourceEntryId: string,
	source: AskPayloadSource
): AskPayloadEntryData | undefined {
	for (const entry of [...ctx.sessionManager.getBranch()].reverse()) {
		if (!isAskPayloadEntry(entry)) {
			continue;
		}
		const data = entry.data;
		if (data?.source !== source || data.sourceEntryId !== sourceEntryId) {
			continue;
		}
		if (isValidAskPayloadData(data)) {
			return data;
		}
	}
	return;
}

function isAskPayloadEntry(entry: unknown): entry is {
	customType: string;
	data?: Partial<AskPayloadEntryData>;
	type: "custom";
} {
	return (
		!!entry &&
		typeof entry === "object" &&
		(entry as { type?: unknown }).type === "custom" &&
		(entry as { customType?: unknown }).customType === ASK_PAYLOAD_ENTRY_TYPE
	);
}

function isValidAskPayloadData(data: unknown): data is AskPayloadEntryData {
	if (!(data && typeof data === "object")) {
		return false;
	}
	const payload = data as Partial<AskPayloadEntryData>;
	if (payload.version !== ASK_PAYLOAD_ENTRY_VERSION) {
		return false;
	}
	if (payload.source !== "tool" && payload.source !== "answer-extraction") {
		return false;
	}
	if (
		!Value.Check(AskParamsSchema, payload.params) ||
		validateParams(payload.params, {
			allowFreeform: payload.source === "answer-extraction",
		}).ok === false
	) {
		return false;
	}
	return true;
}

export function findAskPayloadEntryId(
	ctx: Pick<ExtensionContext, "sessionManager">,
	sourceEntryId: string
): string | undefined {
	for (const entry of [...ctx.sessionManager.getBranch()].reverse()) {
		if (
			isAskPayloadEntry(entry) &&
			entry.data?.source === "tool" &&
			entry.data.sourceEntryId === sourceEntryId &&
			isValidAskPayloadData(entry.data)
		) {
			return "id" in entry && typeof entry.id === "string"
				? entry.id
				: undefined;
		}
	}
	return;
}
