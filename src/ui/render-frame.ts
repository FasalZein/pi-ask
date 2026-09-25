import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AskConfig } from "../config/schema.ts";
import {
	getCurrentQuestion,
	isQuestionAnswered,
	isSubmitTab,
} from "../state/selectors.ts";
import { wrapText } from "../text.ts";
import type { AskState } from "../types.ts";
import { renderFooterText } from "./render-helpers.ts";
import type { Theme } from "./render-types.ts";

export function renderFrameHeader(args: {
	lines: string[];
	state: AskState;
	theme: Theme;
	width: number;
}) {
	const { lines, state, theme, width } = args;
	const add = (text = "") => lines.push(truncateToWidth(text, width));

	add(theme.fg("border", "─".repeat(Math.max(1, width))));
	const progress = isSubmitTab(state)
		? "Review"
		: `Question ${state.activeTabIndex + 1} of ${state.questions.length}`;
	const titleWidth = Math.max(0, width - visibleWidth(progress) - 1);
	const title =
		state.title && titleWidth > 0
			? theme.fg(
					"accent",
					theme.bold(truncateToWidth(` ${state.title}`, titleWidth))
				)
			: "";
	const space = Math.max(
		1,
		width - visibleWidth(title) - visibleWidth(progress)
	);
	add(`${title}${" ".repeat(space)}${theme.fg("dim", progress)}`);
	if (state.title) {
		add();
	}
	add(renderTabs(state, theme, width));
	if (state.title) {
		add();
	}
}

export function renderFrameFooter(args: {
	config: AskConfig;
	footerNotice?: string;
	lines: string[];
	state: AskState;
	theme: Theme;
	width: number;
}) {
	const { config, footerNotice, lines, state, theme, width } = args;
	const add = (text = "") => lines.push(truncateToWidth(text, width));
	const footer = renderFooter(config, state, width);
	const noticeLines = footerNotice ? wrapText(footerNotice, width) : [];
	if (noticeLines.length > 0 || footer.length > 0) {
		add();
		for (const line of noticeLines) {
			add(theme.fg("warning", line));
		}
		for (const line of footer) {
			add(theme.fg("dim", line));
		}
	}
	add(theme.fg("border", "─".repeat(Math.max(1, width))));
}

const TAB_SEPARATOR_WIDTH = visibleWidth(" ");

function renderTabs(state: AskState, theme: Theme, width: number): string {
	const answeredCount = state.questions.filter((question) =>
		isQuestionAnswered(state, question.id)
	).length;
	const tabs = state.questions.map((question, index) => {
		const active = state.activeTabIndex === index;
		const answered = isQuestionAnswered(state, question.id);
		const text = ` ${question.label}${answered ? " ✓" : ""} `;
		return {
			width: visibleWidth(text),
			render: active
				? theme.bg("selectedBg", theme.fg("text", text))
				: theme.fg(answered ? "success" : "muted", text),
		};
	});

	const reviewText = `│ Review ${answeredCount}/${state.questions.length} `;
	tabs.push({
		width: visibleWidth(reviewText),
		render: isSubmitTab(state)
			? theme.bg("selectedBg", theme.fg("text", reviewText))
			: theme.fg("muted", reviewText),
	});

	const widths = tabs.map((tab) => tab.width);
	const totalWidth =
		widths.reduce((sum, tabWidth) => sum + tabWidth, 0) +
		(tabs.length - 1) * TAB_SEPARATOR_WIDTH;
	const overflow = totalWidth > width;
	// Reserve room for both markers before selecting a window. Only paint a marker
	// on a side that actually hides a tab.
	const availableWidth = Math.max(1, width - (overflow ? 5 : 0));
	const { start, end } = getVisibleTabRange(
		widths,
		Math.min(state.activeTabIndex, tabs.length - 1),
		availableWidth
	);
	const left = start > 0 ? theme.fg("dim", " ‹ ") : "";
	const right = end < tabs.length - 1 ? theme.fg("dim", " ›") : "";
	return truncateToWidth(
		`${left}${tabs
			.slice(start, end + 1)
			.map((tab) => tab.render)
			.join(" ")}${right}`,
		width
	);
}

function getVisibleTabRange(
	widths: number[],
	activeIndex: number,
	availableWidth: number
): { start: number; end: number } {
	if (widths.length === 0) {
		return { start: 0, end: -1 };
	}

	const totalWidth =
		widths.reduce((sum, width) => sum + width, 0) +
		Math.max(0, widths.length - 1) * TAB_SEPARATOR_WIDTH;
	if (totalWidth <= availableWidth) {
		return { start: 0, end: widths.length - 1 };
	}

	const range = { start: activeIndex, end: activeIndex };
	let usedWidth = widths[activeIndex] ?? 0;
	let preferRight = activeIndex <= widths.length - activeIndex - 1;

	while (true) {
		const expansion = getExpandableTab(
			widths,
			range,
			availableWidth,
			usedWidth,
			preferRight
		);
		if (!expansion) {
			return range;
		}
		usedWidth += TAB_SEPARATOR_WIDTH + expansion.width;
		applyTabGrowth(range, expansion.nextIndex, expansion.direction);
		preferRight = !preferRight;
	}
}

function getExpandableTab(
	widths: number[],
	range: { start: number; end: number },
	availableWidth: number,
	usedWidth: number,
	preferRight: boolean
):
	| { direction: "left" | "right"; nextIndex: number; width: number }
	| undefined {
	for (const direction of getGrowthDirections(preferRight)) {
		const nextIndex = getNextTabIndex(range, direction);
		const nextWidth = widths[nextIndex];
		if (
			nextWidth === undefined ||
			usedWidth + TAB_SEPARATOR_WIDTH + nextWidth > availableWidth
		) {
			continue;
		}
		return { direction, nextIndex, width: nextWidth };
	}
	return;
}

function getGrowthDirections(preferRight: boolean): Array<"left" | "right"> {
	return preferRight ? ["right", "left"] : ["left", "right"];
}

function getNextTabIndex(
	range: { start: number; end: number },
	direction: "left" | "right"
): number {
	return direction === "left" ? range.start - 1 : range.end + 1;
}

function applyTabGrowth(
	range: { start: number; end: number },
	nextIndex: number,
	direction: "left" | "right"
) {
	if (direction === "left") {
		range.start = nextIndex;
		return;
	}
	range.end = nextIndex;
}

function renderFooter(
	config: AskConfig,
	state: AskState,
	width: number
): string[] {
	if (!config.behaviour.showFooterHints) {
		return [];
	}
	let footer: string;
	if (state.view.kind === "input") {
		footer = renderFooterText(config, "input");
	} else if (state.view.kind === "note") {
		footer = renderFooterText(config, "note");
	} else if (isSubmitTab(state)) {
		footer = renderFooterText(config, "submit");
	} else {
		const question = getCurrentQuestion(state);
		footer = renderFooterText(
			config,
			question?.type === "multi" ? "multi" : "default"
		);
	}
	return wrapDelimitedFooterHints(footer, width);
}

function wrapDelimitedFooterHints(footer: string, width: number): string[] {
	return footer.split(" · ").reduce<string[]>((lines, chunk) => {
		const current = lines.at(-1) ?? "";
		const next = current ? `${current} · ${chunk}` : chunk;
		const fitsCurrentLine = visibleWidth(next) <= width;
		if (fitsCurrentLine) {
			if (current) {
				lines[lines.length - 1] = next;
			} else {
				lines.push(next);
			}
			return lines;
		}

		const wrappedChunk = wrapText(chunk, Math.max(1, width - 1)).map(
			(line) => ` ${line}`
		);
		if (!current) {
			lines.push(...wrappedChunk);
			return lines;
		}
		lines.push(...wrappedChunk);
		return lines;
	}, []);
}
