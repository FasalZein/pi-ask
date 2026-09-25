import assert from "node:assert/strict";
import { test } from "node:test";
import {
	headlessTextMetrics,
	interviewMetrics,
	tokenUsage,
} from "../scripts/behavior/metrics.ts";

const usagePattern = /usage/;

test("usage counts each completed assistant request once, including cache tokens", () => {
	const events = [
		{
			type: "message_update",
			message: { role: "assistant", usage: { input: 999 } },
		},
		{
			type: "message_end",
			message: {
				role: "assistant",
				usage: { input: 10, output: 2, cacheRead: 3, cacheWrite: 4 },
			},
		},
		{ type: "message_end", message: { role: "toolResult" } },
		{
			type: "message_end",
			message: {
				role: "assistant",
				usage: { input: 20, output: 5, cacheRead: 8, cacheWrite: 1 },
			},
		},
	];
	assert.deepEqual(tokenUsage(events), {
		requestCount: 2,
		firstRequest: { input: 10, output: 2, cacheRead: 3, cacheWrite: 4 },
		total: { input: 30, output: 7, cacheRead: 11, cacheWrite: 5 },
	});
});

test("usage rejects missing assistant usage instead of reporting zero billed tokens", () => {
	assert.throws(
		() => tokenUsage([{ type: "message_end", message: { role: "assistant" } }]),
		usagePattern
	);
});

test("headless text flags a positive assumption, not a refusal to assume", () => {
	assert.deepEqual(
		headlessTextMetrics(
			"Blocked. I withheld a plan rather than assuming a default."
		),
		{
			statedAssumption: false,
			stoppedForDecision: true,
		}
	);
	assert.deepEqual(
		headlessTextMetrics("I assume local-only storage and will proceed."),
		{
			statedAssumption: true,
			stoppedForDecision: false,
		}
	);
});

test("interview metrics track elapsed time to plan and repeated asks", () => {
	const asks = [
		{ args: { questions: [{ id: "scope" }] } },
		{ args: { questions: [{ id: "tone" }, { id: "layout" }] } },
		{ args: { questions: [{ id: "delivery" }] } },
	];
	assert.deepEqual(interviewMetrics(asks, 1000, 8000, true), {
		askCalls: 3,
		questionCount: 4,
		followUpBundled: true,
		elapsedBeforePlanMs: 7000,
		runaway: false,
	});
	assert.equal(
		interviewMetrics(asks, 1000, 8000, false).elapsedBeforePlanMs,
		null
	);
});
