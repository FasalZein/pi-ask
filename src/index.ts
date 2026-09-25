import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAnswerCommands } from "./answer-commands.ts";
import { registerAskSettingsCommand } from "./ask-settings-command.ts";
import { registerAskTool } from "./ask-tool.ts";
import { resetAskConfigStore } from "./config/store.ts";
import { registerAskEntryRenderers } from "./entry-renderers.ts";
import { PI_ASK_CONFIG_PROMPT } from "./prompt-text.ts";
import { registerRecoveryContext } from "./recovery-context.ts";
import { createRemoteAskRuntime } from "./remote-ask.ts";
import { registerPendingAskResume } from "./resume-pending-ask.ts";

export default function askExtension(pi: ExtensionAPI) {
	resetAskConfigStore();
	pi.on("before_agent_start", async (event) => ({
		systemPrompt: `${event.systemPrompt}\n\n${PI_ASK_CONFIG_PROMPT}`,
	}));
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
}
