import assert from "node:assert/strict";
import test from "node:test";
import type { ContextEvent } from "@earendil-works/pi-coding-agent";
import askExtension from "../src/index.ts";

const RECOVERY_TEXT =
	"This ask_user call was interrupted by a restart. Its outcome, if any, follows in a later user message.";

type ContextHandler = (
	event: ContextEvent,
	ctx: { sessionManager: { getBranch: () => unknown[] } }
) =>
	| { messages?: ContextEvent["messages"] }
	| Promise<{ messages?: ContextEvent["messages"] } | undefined>
	| undefined;

function contextHarness(branch: unknown[]) {
	let handler: ContextHandler | undefined;
	askExtension({
		on(name: string, callback: ContextHandler) {
			if (name === "context") {
				handler = callback;
			}
		},
		registerTool() {
			// Tool registration is outside the request context seam.
		},
		registerCommand() {
			// Command registration is outside the request context seam.
		},
		registerEntryRenderer() {
			// Transcript rendering is outside the request context seam.
		},
		events: {
			on() {
				// The remote bus is not used by this request.
			},
			emit() {
				// The remote bus is not used by this request.
			},
		},
	} as never);
	const registeredHandler = handler;
	assert.ok(
		registeredHandler,
		"the extension registers a request context handler"
	);
	return async (messages: ContextEvent["messages"]) => {
		const result = await registeredHandler(
			{ type: "context", messages },
			{ sessionManager: { getBranch: () => branch } }
		);
		return result?.messages ?? messages;
	};
}

function assistant(...calls: Array<{ id: string; name: string }>) {
	return {
		role: "assistant",
		stopReason: "toolUse",
		content: calls.map(({ id, name }) => ({
			type: "toolCall",
			id,
			name,
			arguments: {},
		})),
		timestamp: 100,
	} as ContextEvent["messages"][number];
}

function marker(toolCallId: string) {
	return {
		type: "custom",
		customType: "ask:pending-dismissed",
		data: { toolCallId },
	};
}

function result(toolCallId: string) {
	return {
		role: "toolResult" as const,
		toolCallId,
		toolName: "ask_user",
		content: [{ type: "text" as const, text: "Original result" }],
		isError: false,
		timestamp: 101,
	};
}

test("recovered submit pairs the call before its later user answer with stable non-error text", async () => {
	const call = assistant({ id: "ask-1", name: "ask_user" });
	const answer = { role: "user" as const, content: "Canvas", timestamp: 102 };
	const messages = [call, answer];
	const branch = [marker("ask-1")];
	const context = contextHarness(branch);
	const expected = [
		call,
		{
			role: "toolResult",
			toolCallId: "ask-1",
			toolName: "ask_user",
			content: [{ type: "text", text: RECOVERY_TEXT }],
			isError: false,
			timestamp: 0,
		},
		answer,
	];

	assert.deepEqual(await context(messages), expected);
	assert.deepEqual(await context(messages), expected);
	assert.deepEqual(await context(await context(messages)), expected);
	assert.deepEqual(
		messages,
		[call, answer],
		"the request splice does not edit the session messages"
	);
	assert.deepEqual(
		branch,
		[marker("ask-1")],
		"the session branch is unchanged"
	);
});

test("recovered cancel pairs its call without a later user message", async () => {
	const call = assistant({ id: "cancelled", name: "ask_user" });
	const messages = await contextHarness([marker("cancelled")])([call]);
	assert.equal(messages.length, 2);
	assert.deepEqual(messages[1], {
		role: "toolResult",
		toolCallId: "cancelled",
		toolName: "ask_user",
		content: [{ type: "text", text: RECOVERY_TEXT }],
		isError: false,
		timestamp: 0,
	});
});

test("pending and already answered asks remain untouched, even if a dismissal exists", async () => {
	const pending = assistant({ id: "pending", name: "ask_user" });
	const answered = assistant({ id: "answered", name: "ask_user" });
	const originalResult = result("answered");
	const messages = [pending, answered, originalResult];
	assert.deepEqual(
		await contextHarness([marker("answered")])(messages),
		messages
	);
});

test("a real result recorded on the branch prevents a recovery splice", async () => {
	const call = assistant({ id: "answered", name: "ask_user" });
	const branch = [
		marker("answered"),
		{ type: "message", message: result("answered") },
	];
	assert.deepEqual(await contextHarness(branch)([call]), [call]);
});

test("one assistant batch pairs each dismissed ask once and preserves sibling results", async () => {
	const call = assistant(
		{ id: "first", name: "ask_user" },
		{ id: "other", name: "read" },
		{ id: "second", name: "ask_user" }
	);
	const otherResult = { ...result("other"), toolName: "read" };
	const messages = [call, otherResult];
	const paired = await contextHarness([
		marker("second"),
		marker("first"),
		marker("other"),
	])(messages);
	assert.deepEqual(
		paired.map((message) =>
			message.role === "toolResult" ? message.toolCallId : message.role
		),
		["assistant", "first", "second", "other"]
	);
	assert.equal(paired[3], otherResult);
});
