// The event prompt is expanded user text. Pi handles typed extension commands before this event.
const CONFIG_TERMS =
	/(?:\/ask-settings(?![\w-])|\bpi-ask settings?\b|\bkeymap\b|\bkeybinding\b)/i;

export function matchesConfigPrompt(prompt: string): boolean {
	return CONFIG_TERMS.test(prompt);
}

// Projection includes only messages in the current model context.
interface ContextSessionManager {
	buildSessionProjection: () => {
		messages: readonly { role: string; customType?: string }[];
	};
}

export function hasActiveConfigMessage(
	sessionManager: ContextSessionManager
): boolean {
	return sessionManager
		.buildSessionProjection()
		.messages.some(
			(message) =>
				message.role === "custom" && message.customType === "pi_ask_config"
		);
}
