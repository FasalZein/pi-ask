import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	registerAnswerCommands,
	registerReplayShortcut,
} from "./answer-commands.ts";
import { registerAskSettingsCommand } from "./ask-settings-command.ts";
import { registerAskTool } from "./ask-tool.ts";
import { resetAskConfigStore } from "./config/store.ts";
import {
	hasActiveConfigMessage,
	matchesConfigPrompt,
} from "./config-trigger.ts";
import { registerAskEntryRenderers } from "./entry-renderers.ts";
import { PI_ASK_CONFIG_PROMPT, promptMode } from "./prompt-text.ts";
import { registerRecoveryContext } from "./recovery-context.ts";
import { createRemoteAskRuntime } from "./remote-ask.ts";
import { registerPendingAskResume } from "./resume-pending-ask.ts";

export default async function askExtension(pi: ExtensionAPI) {
	resetAskConfigStore();
	if (promptMode === "compact") {
		pi.on("session_start", (_event, ctx) => {
			if ((ctx.mode !== "print" && ctx.mode !== "json") || ctx.hasUI) {
				return;
			}
			const activeTools = pi.getActiveTools();
			if (activeTools.includes("ask_user")) {
				pi.setActiveTools(activeTools.filter((name) => name !== "ask_user"));
			}
		});
	}
	// Keep the handler asynchronous for the full-mode golden test's registered-handler contract.
	// biome-ignore lint/suspicious/useAwait: preserve the existing async handler shape.
	pi.on("before_agent_start", async (event, ctx) => {
		if (promptMode === "full") {
			return {
				systemPrompt: `${event.systemPrompt}\n\n${PI_ASK_CONFIG_PROMPT}`,
			};
		}
		if (
			matchesConfigPrompt(event.prompt) &&
			!hasActiveConfigMessage(ctx.sessionManager)
		) {
			return {
				message: {
					customType: "pi_ask_config",
					content: PI_ASK_CONFIG_PROMPT,
					display: false,
				},
			};
		}
		return {};
	});
	const remoteAsk = createRemoteAskRuntime(pi.events);
	const shutdown = new AbortController();
	registerAskTool(pi, remoteAsk, shutdown.signal);
	registerAskSettingsCommand(pi);
	registerAnswerCommands(pi, remoteAsk);
	registerPendingAskResume(pi, remoteAsk, shutdown.signal);
	pi.on("session_shutdown", () => {
		shutdown.abort();
		remoteAsk.disposeAll();
	});
	registerRecoveryContext(pi);
	registerAskEntryRenderers(pi);
	await registerReplayShortcut(pi, remoteAsk);
}
