import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
	appendAskPayload,
	askTreeLabel,
	findLatestPayloadInCurrentBranch,
} from "../src/ask-payload-store.ts";
import type { AskParams } from "../src/types.ts";

const params: AskParams = {
	questions: [
		{
			id: "goal",
			prompt: "Goal?",
			options: [{ value: "a", label: "A", recommended: true }],
		},
	],
};

function custom(data: unknown) {
	return { type: "custom", customType: "ask:payload", data };
}

function ctx(branch: unknown[]) {
	return { sessionManager: { getBranch: () => branch } } as never;
}

test("branch payload lookup returns the latest valid matching source", () => {
	const older = {
		version: 1,
		source: "tool",
		params,
		timestamp: 1,
	};
	const newer = {
		version: 1,
		source: "tool",
		params: { ...params, title: "Newer" },
		timestamp: 2,
	};

	const result = findLatestPayloadInCurrentBranch(
		ctx([custom(older), custom(newer)]),
		"tool"
	);

	assert.equal(result.data, newer);
	assert.equal(result.invalidMatchFound, false);
});

test("branch payload lookup allows freeform only for answer extraction payloads", () => {
	const freeformParams: AskParams = {
		questions: [
			{
				id: "language",
				prompt: "Which language?",
				options: [{ value: "freeform", label: "Type answer", freeform: true }],
			},
		],
	};

	const answerPayload = {
		version: 1,
		source: "answer-extraction",
		params: freeformParams,
		timestamp: 1,
	};
	const toolPayload = {
		version: 1,
		source: "tool",
		params: freeformParams,
		timestamp: 2,
	};

	assert.equal(
		findLatestPayloadInCurrentBranch(
			ctx([custom(answerPayload)]),
			"answer-extraction"
		).data,
		answerPayload
	);
	assert.equal(
		findLatestPayloadInCurrentBranch(ctx([custom(toolPayload)]), "tool").data,
		undefined
	);
});

test("branch payload lookup ignores invalid stored payloads", () => {
	const result = findLatestPayloadInCurrentBranch(
		ctx([
			custom({ version: 1, source: "tool", params: { questions: [] } }),
			custom({ version: 1, source: "tool", params: {} }),
			custom({ version: 1, source: "answer-extraction", params }),
		]),
		"tool"
	);

	assert.equal(result.data, undefined);
	assert.equal(result.invalidMatchFound, true);
});

test("stored asks label their own tree entry, not the adjacent assistant entry", () => {
	const branch: Array<{
		id: string;
		type: string;
		customType?: string;
		data?: unknown;
	}> = [{ id: "assistant", type: "message" }];
	const labels: [string, string][] = [];
	const pi = {
		appendEntry(customType: string, data: unknown) {
			branch.push({ id: "payload", type: "custom", customType, data });
		},
		setLabel(id: string, label: string) {
			labels.push([id, label]);
		},
	};
	appendAskPayload(pi as never, ctx(branch), {
		source: "tool",
		sourceEntryId: "call-1",
		params: { ...params, title: "  Project\n  setup  " },
	});
	assert.deepEqual(labels, [["payload", "ask: Project setup"]]);
});

test("ask labels use the first question and count, and keep outcomes within 60 characters", () => {
	const branch: Array<{
		id: string;
		type: string;
		customType?: string;
		data?: unknown;
	}> = [];
	const labels: string[] = [];
	const pi = {
		appendEntry(customType: string, data: unknown) {
			branch.push({ id: "payload", type: "custom", customType, data });
		},
		setLabel(_id: string, label: string) {
			labels.push(label);
		},
	};
	appendAskPayload(pi as never, ctx(branch), {
		source: "tool",
		params: {
			questions: [
				{ ...params.questions[0], label: "Goal" },
				{ ...params.questions[0], id: "scope" },
			],
		},
	});
	assert.equal(labels[0], "ask: Goal (2 questions)");
	appendAskPayload(pi as never, ctx(branch), {
		source: "tool",
		params: { ...params, title: "A".repeat(100) },
	});
	assert.equal(labels[1], `ask: ${"A".repeat(54)}…`);
});

test("tree label reserves space for a recovered outcome and uses a question prompt when no label exists", () => {
	assert.equal(askTreeLabel(params), "ask: Goal? (1 question)");
	const label = askTreeLabel(
		{ ...params, title: "B".repeat(100) },
		"dismissed"
	);
	assert.equal(label, `ask: ${"B".repeat(42)}… (dismissed)`);
	assert.equal(Array.from(label).length, 60);
});

test("Pi session labels point to the stored payload without adding model context", () => {
	const sessionManager = SessionManager.inMemory();
	const pi = {
		appendEntry: (type: string, data: unknown) =>
			sessionManager.appendCustomEntry(type, data),
		setLabel: (id: string, label: string) =>
			sessionManager.appendLabelChange(id, label),
	};
	appendAskPayload(pi as never, { sessionManager } as never, {
		params,
		source: "tool",
	});
	const payload = sessionManager
		.getBranch()
		.find((entry) => entry.type === "custom");
	assert.ok(payload);
	assert.equal(sessionManager.getLabel(payload.id), "ask: Goal? (1 question)");
	assert.deepEqual(sessionManager.buildSessionContext().messages, []);
});
