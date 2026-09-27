/** In-process RPC bridge. The driver reads the JSONL trace after Pi exits. */
import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
	RemoteAskCompletedEvent,
	RemoteAskStartedEvent,
	RemoteAskSubmitResultEvent,
} from "../../src/remote-ask.ts";

// Pi extension entry points require a default export.
// biome-ignore lint/style/noDefaultExport: Pi loads the default export from -e.
export default function behaviorBridge(pi: ExtensionAPI): void {
	const trace = process.env.PI_ASK_BEHAVIOR_TRACE;
	if (!trace) {
		throw new Error("PI_ASK_BEHAVIOR_TRACE is required");
	}
	const log = (kind: string, event: unknown) =>
		appendFileSync(trace, `${JSON.stringify({ kind, event })}\n`);
	for (const prefix of ["pi-ask", "@eko24ive/pi-ask"]) {
		pi.events.on(`${prefix}:started`, (data) => {
			const event = data as RemoteAskStartedEvent;
			log("started", event);
			const answers = Object.fromEntries(
				event.questions.map((question) => {
					const option = question.options[0];
					return [
						question.id,
						{
							...(option
								? { values: [option.value] }
								: { customText: "A short descriptive name" }),
							...(process.env.PI_ASK_BEHAVIOR_CASE === "note"
								? { note: "Please explain the trade-off before proceeding." }
								: {}),
						},
					];
				})
			);
			pi.events.emit(`${prefix}:submit`, {
				version: 1,
				requestId: `behavior-${event.flowId}`,
				flowId: event.flowId,
				response: { kind: "answer", answers },
			});
		});
		pi.events.on(`${prefix}:submit-result`, (event) =>
			log("submit-result", event as RemoteAskSubmitResultEvent)
		);
		pi.events.on(`${prefix}:completed`, (event) =>
			log("completed", event as RemoteAskCompletedEvent)
		);
	}
}
