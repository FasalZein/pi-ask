import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import {
	ASK_PAYLOAD_ENTRY_TYPE,
	type AskPayloadEntryData,
} from "./ask-payload-store.ts";
import { ASK_PENDING_DISMISSED_ENTRY_TYPE } from "./pending-ask.ts";

function marker(label: string, theme: Theme) {
	return {
		render: (width: number) => [
			truncateToWidth(theme.fg("muted", label), width),
		],
		invalidate() {
			// The marker has no cached state to invalidate.
		},
	};
}

export function registerAskEntryRenderers(pi: ExtensionAPI): void {
	pi.registerEntryRenderer<AskPayloadEntryData>(
		ASK_PAYLOAD_ENTRY_TYPE,
		(entry, _options, theme) => {
			const params = entry.data?.params;
			const title = params?.title?.replace(/\s+/g, " ").trim();
			const count = params?.questions?.length;
			const detail =
				title ||
				(count === undefined
					? ""
					: `${count} question${count === 1 ? "" : "s"}`);
			return marker(detail ? `ask saved: ${detail}` : "ask saved", theme);
		}
	);
	pi.registerEntryRenderer(
		ASK_PENDING_DISMISSED_ENTRY_TYPE,
		(_entry, _options, theme) => marker("pending ask dismissed", theme)
	);
}
