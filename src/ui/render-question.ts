import {
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { UI_DIMENSIONS, UI_TEXT } from "../constants/ui.ts";
import { getAnswer } from "../state/selectors.ts";
import {
	measurePreviewLeftWidth,
	mergeColumns,
	pushSavedNote,
	pushWrappedText,
	renderEditorBlock,
	renderPreviewPaneContent,
} from "./render-helpers.ts";
import type { QuestionRenderContext, Theme } from "./render-types.ts";
import {
	buildQuestionScreenModel,
	type OptionDetailModel,
	type OptionRowModel,
} from "./view-models/question.ts";

// Option details (description, recommended line, notes, editors) start under the option label.
const OPTION_SUBTITLE_INDENT = "      ";

export function renderQuestionScreen(context: QuestionRenderContext) {
	const { lines, question, theme, width } = context;
	const model = buildQuestionScreenModel(context);

	pushWrappedText(lines, question.prompt, width, theme, "text", " ", " ");
	if (question.type === "multi") {
		const answer = getAnswer(context.state, question.id);
		const selectedCount =
			(answer?.selected.length ?? 0) +
			(answer?.customSelected && answer.customText?.trim() ? 1 : 0);
		const optionCount = context.options.filter(
			(option) => !option.isCustomOption
		).length;
		pushWrappedText(
			lines,
			`Pick any · ${selectedCount} of ${optionCount} selected`,
			width,
			theme,
			"muted",
			" ",
			" "
		);
	}
	renderQuestionNote(lines, model.questionNote, context);

	if (model.mode === "preview") {
		renderPreviewQuestion(context, model);
		return;
	}

	for (const row of model.rows) {
		const start = lines.length;
		renderStandardOption(lines, row, context);
		context.onOptionRow?.(row.index, start, lines.length);
	}
}

function renderQuestionNote(
	lines: string[],
	questionNote: ReturnType<typeof buildQuestionScreenModel>["questionNote"],
	context: QuestionRenderContext
) {
	lines.push("");
	if (!questionNote) {
		return;
	}
	if (questionNote.kind === "editor") {
		renderEditorWithIndent({
			lines,
			editor: context.editor,
			width: context.width,
			theme: context.theme,
			indent: " ",
			placeholder: questionNote.placeholder,
		});
		lines.push("");
		return;
	}
	pushSavedNote({
		lines,
		note: questionNote.text,
		width: context.width,
		theme: context.theme,
		indent: " ",
	});
	lines.push("");
}

function renderStandardOption(
	lines: string[],
	row: OptionRowModel,
	context: QuestionRenderContext
) {
	if (row.isCustom && row.detail?.kind === "editor") {
		renderInteractiveCustomOption(lines, row, context);
		return;
	}

	pushWrappedText(
		lines,
		formatOptionLabel(row),
		context.width,
		context.theme,
		row.color,
		row.pointer,
		" ".repeat(visibleWidth(row.pointer))
	);
	renderOptionSubtitle(
		lines,
		row.description,
		row.recommended,
		context.width,
		context.theme
	);
	renderOptionDetail(lines, row.detail, context, {
		suppressLeadingGap: !!row.description,
	});
}

function renderPreviewQuestion(
	context: QuestionRenderContext,
	model: ReturnType<typeof buildQuestionScreenModel>
) {
	if (model.mode !== "preview") {
		return;
	}

	const { lines, width, theme } = context;
	const add = (text = "") => lines.push(truncateToWidth(text, width));
	const introRows = lines.length;
	const onOptionRow =
		context.onOptionRow &&
		((index: number, start: number, end: number) =>
			context.onOptionRow?.(index, introRows + start, introRows + end));

	if (model.previewLayout === "custom") {
		renderPreviewOptionList(model.rows, theme, width, onOptionRow).forEach(add);
	} else if (model.previewLayout === "wide") {
		renderWidePreviewLayout(
			add,
			model.rows,
			theme,
			width,
			model.selectedOption,
			onOptionRow,
			context.previewScrollTop,
			context.previewScrollHint,
			context.previewMaxRows,
			context.onPreviewBox &&
				((rows, x, start) =>
					context.onPreviewBox?.(rows, x, introRows + start)),
			context.onPreviewScrollTop
		);
	} else {
		renderStackedPreviewLayout(
			add,
			model.rows,
			theme,
			width,
			model.selectedOption,
			onOptionRow,
			context.previewScrollTop,
			context.previewScrollHint,
			context.previewMaxRows,
			context.onPreviewBox &&
				((rows, x, start) =>
					context.onPreviewBox?.(rows, x, introRows + start)),
			context.onPreviewScrollTop
		);
	}

	renderOptionDetail(lines, model.selectedOptionDetail, context);
}

function renderWidePreviewLayout(
	add: (text?: string) => void,
	rows: OptionRowModel[],
	theme: Theme,
	width: number,
	selectedOption: ReturnType<typeof buildQuestionScreenModel>["selectedOption"],
	onOptionRow?: QuestionRenderContext["onOptionRow"],
	previewScrollTop = 0,
	previewScrollHint?: string,
	previewMaxRows?: number,
	onPreviewBox?: QuestionRenderContext["onPreviewBox"],
	onPreviewScrollTop?: QuestionRenderContext["onPreviewScrollTop"]
) {
	const leftWidth = measurePreviewLeftWidth(rows, width);
	const rightWidth = Math.max(
		UI_DIMENSIONS.previewMinRightWidth,
		width - leftWidth - 2 - UI_DIMENSIONS.contentRightMargin
	);
	// The box heading shows the focused description, so the list shows labels only.
	const leftPane = renderPreviewOptionList(
		rows,
		theme,
		leftWidth,
		onOptionRow,
		false
	);
	const rightPane = renderPreviewPaneContent(
		selectedOption,
		theme,
		rightWidth,
		previewScrollTop,
		previewScrollHint,
		previewMaxRows,
		onPreviewScrollTop
	);
	onPreviewBox?.(rightPane.length, leftWidth + 2, 0);
	for (const line of mergeColumns(leftPane, rightPane, leftWidth, width)) {
		add(line);
	}
}

function renderStackedPreviewLayout(
	add: (text?: string) => void,
	rows: OptionRowModel[],
	theme: Theme,
	width: number,
	selectedOption: ReturnType<typeof buildQuestionScreenModel>["selectedOption"],
	onOptionRow?: QuestionRenderContext["onOptionRow"],
	previewScrollTop = 0,
	previewScrollHint?: string,
	previewMaxRows?: number,
	onPreviewBox?: QuestionRenderContext["onPreviewBox"],
	onPreviewScrollTop?: QuestionRenderContext["onPreviewScrollTop"]
) {
	const leftPane = renderPreviewOptionList(rows, theme, width, onOptionRow);
	leftPane.forEach(add);
	add("");
	const linesBeforeBox = leftPane.length + 1;
	// Start at column 1, like the option rows.
	const previewBox = renderPreviewPaneContent(
		selectedOption,
		theme,
		width - 1 - UI_DIMENSIONS.contentRightMargin,
		previewScrollTop,
		previewScrollHint,
		previewMaxRows,
		onPreviewScrollTop
	);
	onPreviewBox?.(previewBox.length, 1, linesBeforeBox);
	for (const line of previewBox) {
		add(` ${line}`);
	}
}

function renderPreviewOptionList(
	rows: OptionRowModel[],
	theme: Theme,
	width: number,
	onOptionRow?: QuestionRenderContext["onOptionRow"],
	showDescriptions = true
): string[] {
	const lines: string[] = [];
	for (const row of rows) {
		const start = lines.length;
		pushWrappedText(
			lines,
			formatOptionLabel(row),
			width,
			theme,
			row.color,
			row.pointer,
			" ".repeat(visibleWidth(row.pointer))
		);
		renderOptionSubtitle(
			lines,
			showDescriptions ? row.description : undefined,
			row.recommended,
			width,
			theme
		);
		onOptionRow?.(row.index, start, lines.length);
	}
	return lines;
}

function renderOptionDetail(
	lines: string[],
	detail: OptionDetailModel | undefined,
	context: QuestionRenderContext,
	options: { indent?: string; suppressLeadingGap?: boolean } = {}
) {
	if (!detail) {
		return;
	}
	const indent = options.indent ?? OPTION_SUBTITLE_INDENT;
	if (detail.withGap && !options.suppressLeadingGap) {
		lines.push("");
	}
	if (detail.kind === "editor") {
		renderEditorWithIndent({
			lines,
			editor: context.editor,
			width: context.width,
			theme: context.theme,
			indent,
			placeholder: detail.placeholder,
		});
		return;
	}
	if (detail.kind === "saved-note") {
		pushSavedNote({
			lines,
			note: detail.text,
			width: context.width,
			theme: context.theme,
			indent,
		});
		return;
	}
	pushWrappedText(
		lines,
		detail.text,
		context.width,
		context.theme,
		"muted",
		indent,
		indent
	);
}

function renderEditorWithIndent(args: {
	lines: string[];
	editor: QuestionRenderContext["editor"];
	width: number;
	theme: Theme;
	indent: string;
	placeholder: string;
}) {
	const { lines, editor, width, theme, indent, placeholder } = args;
	const availableWidth =
		width - visibleWidth(indent) - UI_DIMENSIONS.contentRightMargin;
	renderEditorBlock({
		lines,
		// Wrap at the text width inside the background bar, or lines get "...".
		editorLines: editor.render(
			Math.max(
				UI_DIMENSIONS.editorMinWidth,
				availableWidth - UI_DIMENSIONS.editorBarPadding
			)
		),
		width,
		theme,
		indent,
		availableWidth,
		placeholder,
		isEmpty: editor.getText().length === 0,
	});
}

function formatOptionLabel(row: OptionRowModel): string {
	return row.isFreeformOnly
		? row.label
		: `${row.index + 1}. ${row.prefix}${row.label}`;
}

function renderInteractiveCustomOption(
	lines: string[],
	row: OptionRowModel,
	context: QuestionRenderContext
) {
	const indent = row.isFreeformOnly ? " " : row.pointer;
	pushWrappedText(
		lines,
		formatOptionLabel(row),
		context.width,
		context.theme,
		row.color,
		indent,
		" ".repeat(visibleWidth(indent))
	);
	renderOptionDetail(lines, row.detail, context, {
		indent: row.isFreeformOnly ? " " : undefined,
	});
}

function renderOptionSubtitle(
	lines: string[],
	description: string | undefined,
	recommended: boolean,
	width: number,
	theme: Theme
) {
	if (!recommended) {
		if (description) {
			pushWrappedText(
				lines,
				description,
				width,
				theme,
				"muted",
				OPTION_SUBTITLE_INDENT,
				OPTION_SUBTITLE_INDENT
			);
		}
		return;
	}

	const text =
		theme.fg("warning", UI_TEXT.recommendedMarker) +
		(description ? theme.fg("muted", ` | ${description}`) : "");
	for (const line of wrapTextWithAnsi(
		text,
		Math.max(1, width - visibleWidth(OPTION_SUBTITLE_INDENT))
	)) {
		lines.push(truncateToWidth(`${OPTION_SUBTITLE_INDENT}${line}`, width));
	}
}
