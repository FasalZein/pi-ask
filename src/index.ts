import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAnswerCommands } from "./answer-commands.ts";
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

export default function askExtension(pi: ExtensionAPI) {
	resetAskConfigStore();
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
	pi.on("session_shutdown", () => {
		remoteAsk.disposeAll();
	});
	registerAskTool(pi, remoteAsk);
	registerAskSettingsCommand(pi);
	registerAnswerCommands(pi, remoteAsk);
	registerPendingAskResume(pi, remoteAsk);
	registerRecoveryContext(pi);
	registerAskEntryRenderers(pi);
}
