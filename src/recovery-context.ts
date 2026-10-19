import type {
	ContextWithSystemEvent,
	ExtensionAPI,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	getDismissedToolCallId,
	isPlaceholderSentDismissal,
} from "./pending-ask.ts";

const ASK_TOOL_NAME = "ask_user";
const INTERRUPTED_ASK_TEXT =
	"This ask_user call was interrupted by a restart. Its outcome, if any, follows in a later user message.";

export function registerRecoveryContext(
	pi: ExtensionAPI,
	placeholderSentIds: Set<string>
): void {
	// A `context` handler that changes the conversation makes Pi replace every system
	// message with one built from the current prompt. After the prompt changes mid-session,
	// that rewrites the cached request prefix, and Anthropic drops all signed thinking
	// blocks. This handler sees the system messages and leaves them in place.
	pi.on("context_with_system", (event, ctx) => {
		const { dismissedIds, resolvedIds } = collectRecoveryIds(
			ctx.sessionManager.getBranch()
		);
		for (const message of event.messages) {
			if (message.role === "toolResult") {
				resolvedIds.add(message.toolCallId);
			}
		}
		for (const id of unresolvedAskCallIds(event.messages, resolvedIds)) {
			if (!dismissedIds.has(id)) {
				// This request goes out with pi-ai's placeholder result for the call.
				placeholderSentIds.add(id);
			}
		}
		if (dismissedIds.size === 0) {
			return;
		}
		const messages = event.messages.flatMap((message) => {
			if (message.role !== "assistant" || message.stopReason !== "toolUse") {
				return [message];
			}

			const results = message.content.flatMap((part) => {
				if (
					part.type !== "toolCall" ||
					part.name !== ASK_TOOL_NAME ||
					!dismissedIds.has(part.id) ||
					resolvedIds.has(part.id)
				) {
					return [];
				}
				resolvedIds.add(part.id);
				return [
					{
						role: "toolResult" as const,
						toolCallId: part.id,
						toolName: part.name,
						content: [{ type: "text" as const, text: INTERRUPTED_ASK_TEXT }],
						isError: false,
						timestamp: 0,
					},
				];
			});
			return [message, ...results];
		});
		return { messages };
	});
}

function unresolvedAskCallIds(
	messages: ContextWithSystemEvent["messages"],
	resolvedIds: ReadonlySet<string>
): string[] {
	return messages.flatMap((message) => {
		if (message.role !== "assistant" || message.stopReason !== "toolUse") {
			return [];
		}
		return message.content.flatMap((part) =>
			part.type === "toolCall" &&
			part.name === ASK_TOOL_NAME &&
			!resolvedIds.has(part.id)
				? [part.id]
				: []
		);
	});
}

function collectRecoveryIds(branch: readonly SessionEntry[]) {
	const dismissedIds = new Set<string>();
	const resolvedIds = new Set<string>();
	const sentCalls = trackSentCalls();
	for (const entry of branch) {
		const dismissedId = getDismissedToolCallId(entry);
		if (dismissedId !== undefined && !sentCalls.sent(dismissedId, entry)) {
			dismissedIds.add(dismissedId);
		}
		if (entry.type === "message" && entry.message.role === "toolResult") {
			resolvedIds.add(entry.message.toolCallId);
		}
		sentCalls.observe(entry);
	}
	return { dismissedIds, resolvedIds };
}

// An earlier request already sent pi-ai's placeholder result for a call when a later
// assistant message follows the call, or when the dismissal records that a request in
// the recovering process sent it. Replacing that placeholder would change the prefix of
// every later request.
function trackSentCalls() {
	const sentIds = new Set<string>();
	let latestCallIds: string[] = [];
	return {
		sent: (toolCallId: string, dismissal: SessionEntry) =>
			sentIds.has(toolCallId) || isPlaceholderSentDismissal(dismissal),
		observe(entry: SessionEntry) {
			if (entry.type !== "message" || entry.message.role !== "assistant") {
				return;
			}
			for (const id of latestCallIds) {
				sentIds.add(id);
			}
			// Stored entries from older or imported sessions can lack content; Pi treats
			// that as empty.
			const content = entry.message.content ?? [];
			latestCallIds = content.flatMap((part) =>
				part.type === "toolCall" ? [part.id] : []
			);
		},
	};
}
