import type { Usage } from "@earendil-works/pi-ai";

type BilledTokens = Pick<
	Usage,
	"input" | "output" | "cacheRead" | "cacheWrite"
>;
interface UsageEvent {
	message?: { role: string; usage?: Partial<BilledTokens> };
	type: string;
}

const fields = ["input", "output", "cacheRead", "cacheWrite"] as const;

function isBilledTokens(
	usage: Partial<BilledTokens> | undefined
): usage is BilledTokens {
	return Boolean(
		usage &&
			fields.every(
				(field) =>
					typeof usage[field] === "number" && Number.isFinite(usage[field])
			)
	);
}
const positiveAssumption =
	/\b(?:I (?:will )?assume|I'll assume|assuming (?:that|the))\b|\bassumption:/i;
const stoppedPattern =
	/\b(can(?:not|'t) proceed|need (?:your|the owner's|user) (?:decision|input|choice)|await(?:ing)? (?:your|the owner's|user) (?:decision|input|choice)|blocked|must (?:choose|decide)|before (?:I can|we can) (?:plan|proceed))\b/i;

/** Heuristic text labels; the raw assistant response remains the source of truth. */
export function headlessTextMetrics(text: string) {
	return {
		statedAssumption: positiveAssumption.test(text),
		stoppedForDecision: stoppedPattern.test(text),
	};
}

/** Read finalized assistant messages only. Updates and tool results are not separate requests. */
export function tokenUsage(events: readonly UsageEvent[]) {
	const total: BilledTokens = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	};
	let firstRequest: BilledTokens | null = null;
	let requestCount = 0;
	for (const event of events) {
		if (event.type !== "message_end" || event.message?.role !== "assistant") {
			continue;
		}
		const usage = event.message.usage;
		if (!isBilledTokens(usage)) {
			throw new Error("Assistant message has missing or invalid usage");
		}
		const billed = {
			input: usage.input,
			output: usage.output,
			cacheRead: usage.cacheRead,
			cacheWrite: usage.cacheWrite,
		};
		firstRequest ??= billed;
		requestCount++;
		for (const field of fields) {
			total[field] += billed[field];
		}
	}
	if (!firstRequest) {
		throw new Error("No completed assistant request with usage");
	}
	return { requestCount, firstRequest, total };
}

interface AskCall {
	args?: { questions?: readonly unknown[] };
}

/** A plan is counted only when assistant text explicitly passes the plan marker. */
export function interviewMetrics(
	asks: readonly AskCall[],
	startedAt: number,
	endedAt: number,
	planned: boolean
) {
	return {
		askCalls: asks.length,
		questionCount: asks.reduce(
			(sum, ask) => sum + (ask.args?.questions?.length ?? 0),
			0
		),
		followUpBundled: asks
			.slice(1)
			.some((ask) => (ask.args?.questions?.length ?? 0) >= 2),
		elapsedBeforePlanMs: planned ? endedAt - startedAt : null,
		runaway: asks.length > 5,
	};
}
