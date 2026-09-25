import type { AskConfig } from "../config/schema.ts";
import { formatKeybindingLabel } from "../constants/keymaps.ts";
import {
	getCurrentQuestion,
	getRenderableOptions,
	isSubmitTab,
} from "../state/selectors.ts";
import type { AskState } from "../types.ts";

import { renderFrameFooter, renderFrameHeader } from "./render-frame.ts";
import { renderQuestionScreen } from "./render-question.ts";
import { renderSubmitScreen } from "./render-submit.ts";
import type { QuestionRenderContext, Theme } from "./render-types.ts";

const UP_SUFFIX = /Up$/;
const DOWN_SUFFIX = /Down$/;

export interface AskViewport {
	bodyRows: number;
	/** Filled from rendered option/action row positions for page-key navigation. */
	optionStarts: number[];
	reviewPageRows: number;
	reviewScrollTop: number;
	rows: number;
	scrollTop: number;
}

export function renderAskScreen(args: {
	config: AskConfig;
	footerNotice?: string;
	reviewShortcutHint?: string;
	state: AskState;
	theme: Theme;
	width: number;
	editor: QuestionRenderContext["editor"];
	viewport?: AskViewport;
	previewScrollTop?: number;
	onPreviewScrollTop?: (top: number) => void;
}): string[] {
	const { config, footerNotice, reviewShortcutHint, state, theme, width } =
		args;
	const pageKeys = pagingLabels(config);
	const header: string[] = [];
	const body: string[] = [];
	const footer = renderAskFooter(config, footerNotice, state, theme, width);
	const starts: number[] = [];
	const reviewStarts: number[] = [];
	let focusStart = 0;
	let focusEnd = 1;
	const trackRow = (index: number, start: number, end: number) => {
		starts[index] = start;
		if (
			index ===
			(isSubmitTab(state)
				? state.activeSubmitActionIndex
				: state.activeOptionIndex)
		) {
			focusStart = start;
			focusEnd = end;
		}
	};
	renderFrameHeader({ lines: header, state, theme, width });
	if (isSubmitTab(state)) {
		renderSubmitScreen(
			body,
			state,
			theme,
			width,
			reviewShortcutHint,
			trackRow,
			(index, start) => {
				reviewStarts[index] = start;
			},
			args.viewport,
			Math.max(1, (args.viewport?.rows ?? 24) - header.length - footer.length),
			pageKeys
		);
	} else {
		renderQuestionBody(
			args,
			body,
			header.length + footer.length,
			trackRow,
			starts
		);
	}

	return windowAskBody({
		viewport: args.viewport,
		header,
		body,
		footer,
		theme,
		state,
		starts,
		reviewStarts,
		pageKeys,
		focusStart,
		focusEnd,
	});
}

function renderQuestionBody(
	args: Parameters<typeof renderAskScreen>[0],
	body: string[],
	frameRows: number,
	trackRow: (index: number, start: number, end: number) => void,
	starts: number[]
) {
	const { state, config, theme, width, editor } = args;
	const question = getCurrentQuestion(state);
	if (!question) {
		return;
	}
	const options = getRenderableOptions(question);

	let previewBoxRows = 0;
	let previewEffectiveTop = 0;
	const renderQuestion = (previewMaxRows = 14) =>
		renderQuestionScreen({
			lines: body,
			state,
			question,
			options,
			theme,
			width,
			editor,
			onOptionRow: trackRow,
			previewScrollTop: args.previewScrollTop,
			previewScrollHint: `${formatKeybindingLabel(config.keymaps.main.previewUp[0] ?? "[")} ${formatKeybindingLabel(config.keymaps.main.previewDown[0] ?? "]")}`,
			previewMaxRows,
			onPreviewBox: (rows) => {
				previewBoxRows = rows;
			},
			onPreviewScrollTop: (top) => {
				previewEffectiveTop = top;
			},
		});
	renderQuestion();
	if (args.viewport && previewBoxRows > 0) {
		const available = args.viewport.rows - frameRows;
		if (body.length > available) {
			const reducedMax = Math.max(
				6,
				previewBoxRows - (body.length - available)
			);
			if (reducedMax < previewBoxRows) {
				body.length = 0;
				starts.length = 0;
				renderQuestion(reducedMax);
			}
		}
	}
	args.onPreviewScrollTop?.(previewEffectiveTop);
}

function renderAskFooter(
	config: AskConfig,
	footerNotice: string | undefined,
	state: AskState,
	theme: Theme,
	width: number
): string[] {
	const lines: string[] = [];
	renderFrameFooter({ config, footerNotice, lines, state, theme, width });
	return lines;
}

function windowAskBody(args: {
	viewport?: AskViewport;
	header: string[];
	body: string[];
	footer: string[];
	theme: Theme;
	state: AskState;
	starts: number[];
	reviewStarts: number[];
	pageKeys: { up: string; down: string };
	focusStart: number;
	focusEnd: number;
}): string[] {
	const {
		viewport,
		header,
		body,
		footer,
		theme,
		state,
		starts,
		reviewStarts,
		pageKeys,
		focusStart,
		focusEnd,
	} = args;
	if (!viewport) {
		return [...header, ...body, ...footer];
	}
	viewport.optionStarts = starts;
	const available = Math.max(1, viewport.rows - header.length - footer.length);
	viewport.bodyRows = available;
	if (body.length <= available) {
		viewport.scrollTop = 0;
		return [...header, ...body, ...footer];
	}
	// Reserve both indicator rows so the body and fixed footer never move as focus changes.
	const pageSize = Math.max(1, available - 2);
	const maxTop = Math.max(0, body.length - pageSize);
	let top = Math.max(0, Math.min(viewport.scrollTop, maxTop));
	if (focusEnd - focusStart > pageSize) {
		top = focusStart;
	} else if (focusStart < top) {
		top = focusStart;
	} else if (focusEnd > top + pageSize) {
		top = Math.min(maxTop, focusEnd - pageSize);
	}
	viewport.scrollTop = top;
	viewport.bodyRows = pageSize;
	const measuredStarts = isSubmitTab(state) ? reviewStarts : starts;
	const above = measuredStarts.filter((start) => start < top).length;
	const below = measuredStarts.filter(
		(start) => start >= top + pageSize
	).length;
	const noun = isSubmitTab(state) ? "rows" : "options";
	const up = above ? `   ↑ ${above} more ${noun} above · ${pageKeys.up}` : "";
	const down = below
		? `   ↓ ${below} more ${noun} below · ${pageKeys.down}`
		: "";
	return [
		...header,
		theme.fg("dim", up),
		...body.slice(top, top + pageSize),
		theme.fg("dim", down),
		...footer,
	];
}

function pageKeyLabel(key: string): string {
	return formatKeybindingLabel(key)
		.replace(UP_SUFFIX, "↑")
		.replace(DOWN_SUFFIX, "↓");
}

function pagingLabels(config: AskConfig) {
	return {
		up: pageKeyLabel(config.keymaps.main.pageUp[0] ?? "shift+up"),
		down: pageKeyLabel(config.keymaps.main.pageDown[0] ?? "shift+down"),
	};
}
