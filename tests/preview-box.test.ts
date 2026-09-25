import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import { createInitialState } from "../src/state/create.ts";
import { renderAskScreen } from "../src/ui/render.ts";

const theme = {
	fg: (_: string, text: string) => text,
	bg: (_: string, text: string) => text,
	bold: (text: string) => text,
} as never;
const editor = { getText: () => "", render: () => [] } as never;
const preview = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join(
	"\n"
);
const state = createInitialState({
	questions: [
		{
			id: "q",
			prompt: "Choose",
			type: "preview",
			options: [{ value: "a", label: "First", recommended: true, preview }],
		},
	],
});

function box(lines: string[]): string[] {
	const start = lines.findIndex((line) => line.includes("┌"));
	const end = lines.findIndex((line, i) => i > start && line.includes("└"));
	assert(start >= 0 && end > start);
	return lines.slice(start, end + 1);
}

test("wide and stacked previews cap at 14 rows and report the exact hidden count", () => {
	for (const width of [80, 100]) {
		const lines = renderAskScreen({
			config: DEFAULT_ASK_CONFIG,
			state,
			theme,
			width,
			editor,
		});
		const pane = box(lines);
		assert.equal(pane.length, 14);
		assert(
			pane.some((line) => line.includes("↑ 0 above · ↓ 41 more · [ ] scroll"))
		);
		assert(pane.some((line) => line.includes("line 9")));
		assert(!pane.some((line) => line.includes("line 10")));
		assert(lines.some((line) => line.includes("▶ 1. First (recommended)")));
	}
});

test("scrolling preview changes its window without moving the option", () => {
	const lines = renderAskScreen({
		config: DEFAULT_ASK_CONFIG,
		state,
		theme,
		width: 100,
		editor,
		previewScrollTop: 6,
	});
	const pane = box(lines);
	assert(
		pane.some((line) => line.includes("↑ 6 above · ↓ 35 more · [ ] scroll"))
	);
	assert(pane.some((line) => line.includes("line 7")));
	assert(!pane.some((line) => line.includes("line 6 ")));
	assert(lines.some((line) => line.includes("▶ 1. First (recommended)")));
});

test("preview keeps ASCII mockup spacing exactly, including repeated and trailing spaces", () => {
	const mockup = createInitialState({
		questions: [
			{
				id: "q",
				prompt: "Choose",
				type: "preview",
				options: [
					{
						value: "a",
						label: "Mockup",
						preview: "  +----+  \n  | a  b |\n  +----+  ",
					},
				],
			},
		],
	});
	for (const width of [80, 100]) {
		const pane = box(
			renderAskScreen({
				config: DEFAULT_ASK_CONFIG,
				state: mockup,
				theme,
				width,
				editor,
			})
		);
		assert(pane.some((line) => line.includes("│  +----+  ")));
		assert(pane.some((line) => line.includes("│  | a  b |")));
	}
});

test("short terminals reduce the preview box while keeping the option and footer visible", () => {
	for (const width of [80, 100]) {
		const viewport = {
			rows: 18,
			scrollTop: 0,
			reviewScrollTop: 0,
			reviewPageRows: 0,
			optionStarts: [] as number[],
			bodyRows: 0,
		};
		const lines = renderAskScreen({
			config: DEFAULT_ASK_CONFIG,
			state,
			theme,
			width,
			editor,
			viewport,
		});
		assert.equal(lines.length, 18);
		assert(box(lines).length < 14);
		assert(lines.some((line) => line.includes("▶ 1. First (recommended)")));
		assert(lines.at(-2)?.includes("settings"));
	}
});

test("a wrapped scroll indicator remains inside the preview cap", () => {
	const pane = box(
		renderAskScreen({
			config: DEFAULT_ASK_CONFIG,
			state,
			theme,
			width: 32,
			editor,
			previewScrollTop: 40,
		})
	);
	assert(pane.length <= 14);
	assert(pane.some((line) => line.includes("↑ 40 above")));
	assert(pane.some((line) => line.includes("scroll")));
});

test("a long option description cannot make the preview exceed 14 rows", () => {
	const described = createInitialState({
		questions: [
			{
				id: "q",
				prompt: "Choose",
				type: "preview",
				options: [
					{
						value: "a",
						label: "First",
						description: "A long description ".repeat(100),
						preview,
					},
				],
			},
		],
	});
	const pane = box(
		renderAskScreen({
			config: DEFAULT_ASK_CONFIG,
			state: described,
			theme,
			width: 80,
			editor,
		})
	);
	assert(pane.length <= 14);
	assert(pane.some((line) => line.includes("scroll")));
});
