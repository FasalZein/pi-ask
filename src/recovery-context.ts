import type {
	ExtensionAPI,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { getDismissedToolCallId } from "./pending-ask.ts";

const INTERRUPTED_ASK_TEXT =
	"This ask_user call was interrupted by a restart. Its outcome, if any, follows in a later user message.";

export function registerRecoveryContext(pi: ExtensionAPI): void {
	pi.on("context", (event, ctx) => {
		const { dismissedIds, resolvedIds } = collectRecoveryIds(
			ctx.sessionManager.getBranch()
		);
		if (dismissedIds.size === 0) {
			return;
		}
		for (const message of event.messages) {
			if (message.role === "toolResult") {
				resolvedIds.add(message.toolCallId);
			}
		}
		const messages = event.messages.flatMap((message) => {
			if (message.role !== "assistant" || message.stopReason !== "toolUse") {
				return [message];
			}

			const results = message.content.flatMap((part) => {
				if (
					part.type !== "toolCall" ||
					part.name !== "ask_user" ||
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

function collectRecoveryIds(branch: readonly SessionEntry[]) {
	const dismissedIds = new Set<string>();
	const resolvedIds = new Set<string>();
	for (const entry of branch) {
		const dismissedId = getDismissedToolCallId(entry);
		if (dismissedId !== undefined) {
			dismissedIds.add(dismissedId);
		}
		if (entry.type === "message" && entry.message.role === "toolResult") {
			resolvedIds.add(entry.message.toolCallId);
		}
	}
	return { dismissedIds, resolvedIds };
}
