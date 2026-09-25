import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "pi-ask";

/** Keep the footer slot and terminal title in sync for one open ask flow. */
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
		ctx.ui.setTitle?.(`pi ask: ${position}`);
	};
	try {
		showTab(0);
		return await run(showTab);
	} finally {
		ctx.ui.setStatus?.(STATUS_KEY, undefined);
		ctx.ui.setTitle?.("");
	}
}
