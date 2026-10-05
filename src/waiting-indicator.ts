import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "pi-ask";

/**
 * Keep the footer status in sync for one open ask flow.
 * The terminal title stays pi's: pi has no API to read or restore it.
 */
export async function withWaitingIndicator<T>(
	ctx: ExtensionContext,
	questionCount: number,
	run: (showTab: (index: number) => void) => Promise<T>
): Promise<T> {
	const showTab = (index: number) => {
		const position =
			index < questionCount
				? `question ${index + 1} of ${questionCount}`
				: `review of ${questionCount} questions`;
		ctx.ui.setStatus?.(STATUS_KEY, position);
	};
	try {
		showTab(0);
		return await run(showTab);
	} finally {
		ctx.ui.setStatus?.(STATUS_KEY, undefined);
	}
}
