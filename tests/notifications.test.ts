import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import {
	createQuestionWaitingNotification,
	notifyQuestionWaiting,
} from "../src/notifications.ts";

const execFileAsync = promisify(execFile);
const exec: ExtensionAPI["exec"] = async (command, args, options) => {
	try {
		const result = await execFileAsync(command, args, options);
		return {
			stdout: String(result.stdout),
			stderr: String(result.stderr),
			code: 0,
			killed: false,
		};
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
		return { stdout: "", stderr: error.message, code: 1, killed: true };
	}
};

test("notification payload uses question label before prompt", () => {
	const payload = createQuestionWaitingNotification({
		label: "Scope",
		prompt: "What should we change?",
	});

	assert.deepEqual(payload, {
		event: "question.waiting",
		title: "pi ask",
		message: "Question waiting: Scope",
	});
});

test("notification payload falls back to prompt and compacts whitespace", () => {
	const payload = createQuestionWaitingNotification({
		label: "",
		prompt: "What\nshould\twe change?",
	});

	assert.equal(payload.message, "Question waiting: What should we change?");
});

test("disabled notifications are skipped", async () => {
	const attempts = await notifyQuestionWaiting(
		{
			...DEFAULT_ASK_CONFIG,
			notifications: { channels: ["bell"], enabled: false },
		},
		createQuestionWaitingNotification({ label: "Scope", prompt: "Prompt" }),
		exec
	);

	assert.deepEqual(attempts, [{ channel: "notifications", status: "skipped" }]);
});

test("command notification receives env and swallows failures", async () => {
	const payload = createQuestionWaitingNotification({
		label: "Scope",
		prompt: "Prompt",
	});
	const attempts = await notifyQuestionWaiting(
		{
			...DEFAULT_ASK_CONFIG,
			notifications: {
				channels: [
					{
						command:
							"node -e 'if (process.env.ASK_NOTIFY_MESSAGE !== \"Question waiting: Scope\") process.exit(7)'",
						type: "command",
					},
					{ command: "node -e 'process.exit(3)'", type: "command" },
				],
				enabled: true,
			},
		},
		payload,
		exec
	);

	assert.equal(attempts[0]?.status, "attempted");
	assert.equal(attempts[1]?.status, "failed");
});

test("command notification keeps shell pipes and receives notification variables", async () => {
	const attempts = await notifyQuestionWaiting(
		{
			...DEFAULT_ASK_CONFIG,
			notifications: {
				enabled: true,
				channels: [
					{
						type: "command",
						command: `printf '%s' "$ASK_NOTIFY_EVENT:$ASK_NOTIFY_TITLE:$ASK_NOTIFY_MESSAGE" | grep -q 'question.waiting:pi ask:Question waiting: Scope'`,
					},
				],
			},
		},
		createQuestionWaitingNotification({ label: "Scope", prompt: "Prompt" }),
		exec
	);
	assert.deepEqual(attempts, [{ channel: "command", status: "attempted" }]);
});

test("command notification passes timeout and abort signal to pi.exec", async () => {
	const abort = new AbortController();
	let received: Parameters<ExtensionAPI["exec"]> | undefined;
	const fakeExec: ExtensionAPI["exec"] = (...args) => {
		received = args;
		return Promise.resolve({ stdout: "", stderr: "", code: 1, killed: true });
	};
	const attempts = await notifyQuestionWaiting(
		{
			...DEFAULT_ASK_CONFIG,
			notifications: {
				enabled: true,
				channels: [{ type: "command", command: "sleep 30" }],
			},
		},
		createQuestionWaitingNotification({ label: "Scope", prompt: "Prompt" }),
		fakeExec,
		abort.signal
	);
	assert.equal(received?.[2]?.timeout, 5000);
	assert.equal(received?.[2]?.signal, abort.signal);
	assert.deepEqual(attempts, [
		{
			channel: "command",
			status: "failed",
			error: "Command exited with code 1",
		},
	]);
});

test("command timeout stops the notification process without stopping the ask", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-ask-notify-"));
	const marker = join(dir, "late");
	try {
		const command = `exec node -e 'setTimeout(() => require("fs").writeFileSync(${JSON.stringify(marker)}, "late"), 6000)'`;
		const attempts = await notifyQuestionWaiting(
			{
				...DEFAULT_ASK_CONFIG,
				notifications: {
					enabled: true,
					channels: [{ type: "command", command }, "bell"],
				},
			},
			createQuestionWaitingNotification({ label: "Scope", prompt: "Prompt" }),
			exec
		);
		assert.equal(attempts[0]?.status, "failed");
		assert.deepEqual(attempts[1], { channel: "bell", status: "attempted" });
		await new Promise((resolve) => setTimeout(resolve, 1200));
		assert.equal(existsSync(marker), false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("abort stops a running notification command", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-ask-notify-"));
	const marker = join(dir, "late");
	const abort = new AbortController();
	try {
		const command = `exec node -e 'setTimeout(() => require("fs").writeFileSync(${JSON.stringify(marker)}, "late"), 500)'`;
		const pending = notifyQuestionWaiting(
			{
				...DEFAULT_ASK_CONFIG,
				notifications: {
					enabled: true,
					channels: [{ type: "command", command }],
				},
			},
			createQuestionWaitingNotification({ label: "Scope", prompt: "Prompt" }),
			exec,
			abort.signal
		);
		setTimeout(() => abort.abort(), 100);
		assert.equal((await pending)[0]?.status, "failed");
		await new Promise((resolve) => setTimeout(resolve, 550));
		assert.equal(existsSync(marker), false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
