import assert from "node:assert/strict";
import test from "node:test";
import { registerAnswerCommands } from "../src/answer-commands.ts";

function registerCommands() {
	const commands = new Map<
		string,
		{ handler: (args: string, ctx: any) => Promise<void> }
	>();
	registerAnswerCommands({
		registerCommand(
			name: string,
			command: { handler: (args: string, ctx: any) => Promise<void> }
		) {
			commands.set(name, command);
		},
	} as never);
	return commands;
}

test("answer commands do not open custom UI outside TUI mode", async () => {
	const commands = registerCommands();
	const notifications: Array<{ message: string; type: string }> = [];
	let customOpened = false;
	const ctx = {
		mode: "rpc",
		ui: {
			custom() {
				customOpened = true;
			},
			notify(message: string, type: string) {
				notifications.push({ message, type });
			},
		},
	};

	await commands.get("answer")?.handler("", ctx);
	await commands.get("answer:again")?.handler("", ctx);
	await commands.get("ask:replay")?.handler("", ctx);

	assert.equal(customOpened, false);
	assert.deepEqual(notifications, [
		{ message: "/answer requires interactive TUI mode.", type: "error" },
		{ message: "Ask replay requires interactive TUI mode.", type: "error" },
		{ message: "Ask replay requires interactive TUI mode.", type: "error" },
	]);
});

test("/answer replay delivers the same skill pointer in its user message", async () => {
	const { DEFAULT_ASK_CONFIG } = await import("../src/config/defaults.ts");
	const { getAskConfigStore } = await import("../src/config/store.ts");
	const { createRemoteAskRuntime, PI_ASK_STARTED_EVENT, PI_ASK_SUBMIT_EVENT } =
		await import("../src/remote-ask.ts");
	const configStore = getAskConfigStore();
	configStore.setConfig({
		...DEFAULT_ASK_CONFIG,
		notifications: { ...DEFAULT_ASK_CONFIG.notifications, enabled: false },
	});
	const handlers = new Map<string, Array<(data: unknown) => void>>();
	const bus = {
		on(channel: string, callback: (data: unknown) => void) {
			const list = handlers.get(channel) ?? [];
			list.push(callback);
			handlers.set(channel, list);
			return () => {
				handlers.set(
					channel,
					list.filter((handler) => handler !== callback)
				);
			};
		},
		emit(channel: string, data: unknown) {
			for (const handler of handlers.get(channel) ?? []) {
				handler(data);
			}
		},
	};
	const remote = createRemoteAskRuntime(bus as never);
	const commands = new Map<
		string,
		{ handler: (args: string, ctx: any) => Promise<void> }
	>();
	let sent = "";
	registerAnswerCommands(
		{
			registerCommand(
				name: string,
				command: { handler: (args: string, ctx: any) => Promise<void> }
			) {
				commands.set(name, command);
			},
			getCommands() {
				return [
					{
						name: "skill:tdd",
						source: "skill",
						sourceInfo: {
							path: "/skills/tdd/SKILL.md",
							source: "test",
							scope: "user",
							origin: "top-level",
						},
					},
				];
			},
			sendUserMessage(text: string) {
				sent = text;
			},
			exec: async () => ({ stdout: "", stderr: "", code: 0, killed: false }),
		} as never,
		remote
	);
	bus.on(PI_ASK_STARTED_EVENT, (data) => {
		const started = data as { flowId: string };
		bus.emit(PI_ASK_SUBMIT_EVENT, {
			version: 1,
			requestId: "answer-1",
			flowId: started.flowId,
			response: {
				kind: "answer",
				answers: { goal: { values: ["speed"], note: "Use /skill:tdd" } },
			},
		});
	});
	const params = {
		questions: [
			{
				id: "goal",
				label: "Goal",
				prompt: "What matters?",
				options: [{ value: "speed", label: "Speed" }],
			},
		],
	};
	const ctx = {
		cwd: process.cwd(),
		mode: "tui",
		isIdle: () => true,
		sessionManager: {
			getBranch: () => [
				{
					type: "custom",
					customType: "ask:payload",
					data: {
						version: 1,
						source: "answer-extraction",
						sourceEntryId: "a",
						timestamp: 1,
						params,
					},
				},
			],
		},
		ui: {
			notify() {
				/* This test observes delivery. */
			},
			setWorkingVisible() {
				/* This test does not render a working row. */
			},
			custom(callback: (...args: any[]) => unknown) {
				return new Promise((resolve) => {
					callback(
						{
							requestRender() {
								/* This test does not render the screen. */
							},
						},
						{
							bg: (_color: string, text: string) => text,
							fg: (_color: string, text: string) => text,
						},
						{},
						resolve
					);
				});
			},
		},
	};
	try {
		await commands.get("answer:again")?.handler("", ctx);
		assert.equal(
			sent,
			"Goal: Speed\nGoal note: Use /skill:tdd\nRead skill /skill:tdd: /skills/tdd/SKILL.md"
		);
	} finally {
		remote.disposeAll();
		configStore.setConfig(DEFAULT_ASK_CONFIG);
	}
});
