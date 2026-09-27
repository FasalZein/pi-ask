import assert from "node:assert/strict";
import test from "node:test";
import type { EntryRenderer } from "@earendil-works/pi-coding-agent";
import askExtension from "../src/index.ts";

function renderers() {
	const registered = new Map<string, EntryRenderer>();
	askExtension({
		on() {
			// Lifecycle handlers are outside this transcript seam.
		},
		registerTool() {
			// Tool execution is outside this transcript seam.
		},
		registerShortcut() {
			// Main-editor shortcuts are outside this test seam.
		},
		registerCommand() {
			// Command execution is outside this transcript seam.
		},
		registerEntryRenderer(type: string, renderer: EntryRenderer) {
			registered.set(type, renderer);
		},
		events: {
			on() {
				// Remote events are outside this transcript seam.
			},
			emit() {
				// No remote events are emitted during registration.
			},
		},
	} as never);
	return registered;
}

function renderedLine(renderer: EntryRenderer, data: unknown, width = 80) {
	const component = renderer(
		{ type: "custom", customType: "unused", data } as never,
		{ expanded: false },
		{
			fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
		} as never
	);
	assert.ok(component);
	return component.render(width);
}

test("stored asks render a themed one-line marker with their title or question count", () => {
	const renderer = renderers().get("ask:payload");
	assert.ok(renderer);
	assert.deepEqual(
		renderedLine(renderer, {
			params: { title: "Project setup", questions: [{}, {}] },
		}),
		["<muted>ask saved: Project setup</muted>"]
	);
	assert.deepEqual(
		renderedLine(renderer, { params: { questions: [{}, {}] } }),
		["<muted>ask saved: 2 questions</muted>"]
	);
	assert.deepEqual(renderedLine(renderer, { params: { questions: [{}] } }), [
		"<muted>ask saved: 1 question</muted>",
	]);
	assert.deepEqual(
		renderedLine(renderer, { params: { title: "Project\nsetup" } }),
		["<muted>ask saved: Project setup</muted>"]
	);
	assert.equal(
		renderedLine(renderer, { params: { title: "A long project title" } }, 12)
			.length,
		1,
		"a narrow transcript still uses one line"
	);
});

test("dismissed pending asks render a themed one-line marker", () => {
	const renderer = renderers().get("ask:pending-dismissed");
	assert.ok(renderer);
	assert.deepEqual(renderedLine(renderer, { toolCallId: "ask-1" }), [
		"<muted>pending ask dismissed</muted>",
	]);
});
