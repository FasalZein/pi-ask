import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import type { AskConfig } from "../src/config/schema.ts";
import type { AskConfigNotice } from "../src/config/store.ts";
import { AskSettingsList } from "../src/ui/settings-list.ts";

const savedConfig: AskConfig = {
	shortcuts: DEFAULT_ASK_CONFIG.shortcuts,
	answer: {
		...DEFAULT_ASK_CONFIG.answer,
	},
	behaviour: {
		autoSubmitWhenAnsweredWithoutNotes: false,
		confirmDismissWhenDirty: true,
		doublePressReviewShortcuts: true,
		presentSingleAsMulti: false,
		showFooterHints: true,
	},
	keymaps: DEFAULT_ASK_CONFIG.keymaps,
	notifications: {
		channels: ["bell"],
		enabled: true,
	},
};

function plainTheme() {
	return {
		bg(_color: string, text: string) {
			return text;
		},
		fg(_color: string, text: string) {
			return text;
		},
	};
}

function createList(
	options: {
		notice?: AskConfigNotice;
		onClose?: () => void;
		onSave?: (config: AskConfig) => Promise<AskConfig>;
		savedConfig?: AskConfig;
		rows?: number;
	} = {}
) {
	const onClose =
		options.onClose ??
		(() => {
			// test callback intentionally unused
		});
	return new AskSettingsList(plainTheme(), {
		configPath: "/tmp/pi-ask.json",
		notice: options.notice,
		onClose,
		onSave: options.onSave ?? ((config) => Promise.resolve(config)),
		savedConfig: options.savedConfig ?? savedConfig,
		tui: {
			terminal: { rows: options.rows ?? 80 },
			requestRender() {
				// no-op in tests
			},
		},
	});
}

test("settings list renders behaviour settings and config path", () => {
	const list = createList();
	const text = list.render(72).join("\n");

	assert(text.includes("╭"));
	assert(text.includes("@fasalzein/pi-ask"));
	assert(text.includes("Live settings"));
	assert(text.includes("Defaults for future asks"));
	assert(text.includes("Auto-submit when answered without notes"));
	assert(text.includes("[off]"));
	assert(text.includes("Confirm dismiss when dirty"));
	assert(text.includes("Present single-select as multi-select"));
	assert(text.includes("on"));
	assert(text.includes("Edit this config file to customize"));
	assert(text.includes("keymaps"));
	assert(text.includes("notifications"));
	assert(text.includes("extraction settings"));
	assert(text.includes("/tmp/pi-ask.json"));
	assert(text.includes("Esc / Ctrl+C / ? to close"));
	assert.equal(text.includes("Esc to cancel"), false);
	assert.equal(text.includes("Keymaps"), false);
	assert.equal(text.includes("Ctrl+S"), false);
	assert.equal(text.includes("Saved"), false);
});

test("settings list stays within narrow render width", () => {
	const list = createList();
	const lines = list.render(28);

	assert(lines.every((line) => visibleWidth(line) <= 28));
	const text = lines.join("\n");
	assert(text.includes("/tmp/pi-ask"));
	assert(text.includes("n"));
});

test("settings list saves behaviour changes immediately without success feedback", async () => {
	let saved: AskConfig | undefined;
	const list = createList({
		onSave: (config) => {
			saved = config;
			return Promise.resolve(config);
		},
	});

	list.handleInput(" ");
	await new Promise((resolve) => setImmediate(resolve));

	const text = list.render(72).join("\n");
	assert.equal(saved?.behaviour.autoSubmitWhenAnsweredWithoutNotes, true);
	assert.equal(saved?.behaviour.confirmDismissWhenDirty, true);
	assert.equal(saved?.behaviour.doublePressReviewShortcuts, true);
	assert.equal(saved?.behaviour.presentSingleAsMulti, false);
	assert.equal(saved?.behaviour.showFooterHints, true);
	assert.equal(text.includes("Saved"), false);
});

test("settings list shows save failures and reverts the toggle", async () => {
	const list = createList({
		onSave: () => Promise.reject(new Error("disk nope")),
	});

	list.handleInput(" ");
	await new Promise((resolve) => setImmediate(resolve));

	const text = list.render(72).join("\n");
	assert(text.includes("disk nope"));
	assert(text.includes("Auto-submit when answered without notes"));
	assert(text.includes("[off]"));
});

test("settings list renders load warnings", () => {
	const list = createList({
		notice: {
			kind: "warning",
			text: "Unable to save ask config; edit it manually.",
		},
	});

	const text = list.render(72).join("\n");

	assert(text.includes("Unable to save ask config; edit it manually."));
});

test("settings list clears load warnings after successful save", async () => {
	const list = createList({
		notice: {
			kind: "warning",
			text: "Unable to save ask config; edit it manually.",
		},
	});

	list.handleInput(" ");
	await new Promise((resolve) => setImmediate(resolve));

	const text = list.render(72).join("\n");

	assert.equal(
		text.includes("Unable to save ask config; edit it manually."),
		false
	);
});

test("settings list uses configured navigation and close keys", async () => {
	let saved: AskConfig | undefined;
	const customConfig: AskConfig = {
		...savedConfig,
		keymaps: {
			...savedConfig.keymaps,
			settingsModal: {
				...savedConfig.keymaps.settingsModal,
				nextOption: ["j"],
				previousOption: ["k"],
				toggle: ["x"],
				close: ["q"],
			},
		},
	};
	const list = createList({
		onSave: (config) => {
			saved = config;
			return Promise.resolve(config);
		},
		savedConfig: customConfig,
	});

	list.handleInput("j");
	list.handleInput("x");
	await new Promise((resolve) => setImmediate(resolve));

	assert.equal(saved?.behaviour.confirmDismissWhenDirty, false);
});

test("settings list resets config to defaults after double press", async () => {
	let saveCount = 0;
	let saved: AskConfig | undefined;
	const customConfig: AskConfig = {
		...savedConfig,
		behaviour: {
			...savedConfig.behaviour,
			autoSubmitWhenAnsweredWithoutNotes: true,
			showFooterHints: false,
		},
		notifications: {
			...savedConfig.notifications,
			enabled: false,
		},
	};
	const list = createList({
		onSave: (config) => {
			saveCount += 1;
			saved = config;
			return Promise.resolve(config);
		},
		savedConfig: customConfig,
	});

	list.handleInput("\x1b[A");
	list.handleInput(" ");
	assert.equal(saveCount, 0);
	assert(list.render(72).join("\n").includes("[confirm reset]"));

	list.handleInput(" ");
	await new Promise((resolve) => setImmediate(resolve));

	assert.equal(saveCount, 1);
	assert.deepEqual(saved, DEFAULT_ASK_CONFIG);
});

test("settings list closes with configured keys and dispose idempotently", () => {
	let closed = 0;
	const list = createList({
		onClose: () => {
			closed += 1;
		},
	});

	list.handleInput("?");
	list.handleInput("\u0003");
	list.dispose();
	assert.equal(closed, 1);
});

test("settings keeps the close hint and focused setting visible on a short terminal", () => {
	const list = createList({ rows: 12 });
	const first = list.render(72);
	assert(first.length <= 10);
	assert(first.join("\n").includes("Auto-submit when answered without notes"));
	assert(first.join("\n").includes("Esc / Ctrl+C / ? to close"));
	assert(first.at(-1)?.includes("╰"));

	list.handleInput("\x1b[A"); // Wrap to reset, which is below the initial window.
	const last = list.render(72);
	assert(last.length <= 10);
	assert(last.join("\n").includes("[reset all]"));
	assert(last.join("\n").includes("Esc / Ctrl+C / ? to close"));
	assert(last.at(-1)?.includes("╰"));
});

test("settings stays inside a narrow, short viewport", () => {
	const list = createList({ rows: 16 });
	list.handleInput("\x1b[A");
	const lines = list.render(28);
	assert(lines.length <= 14);
	assert(lines.every((line) => visibleWidth(line) <= 28));
	assert(lines.join("\n").includes("reset all"));
	assert(lines.join("\n").includes("Esc / Ctrl+C / ?"));
	assert(lines.join("\n").includes("close"));
});

test("short settings shows a save failure while reverting the focused toggle", async () => {
	const list = createList({
		rows: 12,
		onSave: () => Promise.reject(new Error("disk nope")),
	});
	list.handleInput(" ");
	await new Promise((resolve) => setImmediate(resolve));
	const lines = list.render(72);
	const text = lines.join("\n");
	assert(lines.length <= 10);
	assert(text.includes("Auto-submit when answered without notes"));
	assert(text.includes("[off]"));
	assert(text.includes("disk nope"));
	assert(text.includes("Esc / Ctrl+C / ? to close"));
});
