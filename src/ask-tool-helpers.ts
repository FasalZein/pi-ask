import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { UI_DIMENSIONS } from "./constants/ui.ts";
import { renderResultText } from "./result.ts";
import {
	resolveSkillReferences,
	type SkillCommands,
} from "./skill-references.ts";
import { createInitialState } from "./state/create.ts";
import { collectValidationIssues } from "./state/normalize.ts";
import { summarizeResult, toAskResult } from "./state/result.ts";
import type {
	AskParams,
	AskQuestionInput,
	AskResult,
	AskValidationIssue,
} from "./types.ts";

interface ValidateParamsOptions {
	allowFreeform?: boolean;
	presentSingleAsMulti?: boolean;
}

export function validateParams(
	params: AskParams,
	options: ValidateParamsOptions = {}
):
	| { ok: true; state: ReturnType<typeof createInitialState> }
	| { ok: false; issues: AskValidationIssue[] } {
	const issues = collectValidationIssues(params, options);
	if (issues.length > 0) {
		return { ok: false, issues };
	}

	return {
		ok: true,
		state: createInitialState(params, options),
	};
}

export function invalidPayloadResponse(
	params: AskParams,
	issues: AskValidationIssue[]
) {
	return {
		content: [{ type: "text" as const, text: formatValidationError(issues) }],
		details: errorResultDetails(params, issues),
	};
}

export const ABORTED_ASK_TEXT =
	"The ask_user form was closed because the run was aborted. No answers were collected.";

export function abortedResponse(params: AskParams) {
	return {
		content: [{ type: "text" as const, text: ABORTED_ASK_TEXT }],
		details: {
			...toAskResult(createInitialState(params)),
			cancelled: true,
			cancelReason: "aborted" as const,
		},
	};
}

export function nonInteractiveResponse(
	state: ReturnType<typeof createInitialState>
) {
	return {
		content: [
			{ type: "text" as const, text: formatNonInteractiveMessage(state) },
		],
		details: {
			...toAskResult(state),
			cancelled: true,
			cancelReason: "ui_unavailable" as const,
		},
	};
}

export function successfulResponse(
	result: AskResult,
	commands: SkillCommands = []
) {
	const texts = Object.values(result.answers).flatMap((answer) => [
		answer.customText ?? "",
		answer.note ?? "",
		...Object.values(answer.optionNotes ?? {}),
	]);
	for (const item of result.elaboration?.items ?? []) {
		texts.push(
			item.note,
			item.answer?.customText ?? "",
			item.answer?.note ?? ""
		);
	}
	const resolvedSkills = result.cancelled
		? []
		: resolveSkillReferences(texts, commands);
	return {
		content: [
			{
				type: "text" as const,
				text:
					summarizeResult(result) +
					resolvedSkills
						.map(({ name, path }) => `\nRead skill /skill:${name}: ${path}`)
						.join(""),
			},
		],
		details: resolvedSkills.length ? { ...result, resolvedSkills } : result,
	};
}

type ToolTheme = ExtensionContext["ui"]["theme"];

export function renderAskToolCall(args: unknown, theme: ToolTheme) {
	const params = args as AskParams;
	const labels = Array.isArray(params.questions)
		? params.questions
				.map(
					(question: AskQuestionInput, index) =>
						question.label?.trim() || `Q${index + 1}`
				)
				.join(", ")
		: "";
	let text = theme.fg("toolTitle", theme.bold("ask_user "));
	text += theme.fg("muted", `${params.questions?.length ?? 0} question(s)`);
	if (labels) {
		text += theme.fg(
			"dim",
			` (${truncateToWidth(labels, UI_DIMENSIONS.callLabelTruncateWidth)})`
		);
	}
	return new Text(text, 0, 0);
}

export function renderAskToolResult(
	result: {
		content: Array<{ type?: string; text?: string }>;
		details?: AskResult;
	},
	_options: unknown,
	theme: ToolTheme
) {
	const details = result.details;
	if (!(details && Array.isArray(details.questions))) {
		const text = result.content[0];
		return new Text(text?.type === "text" ? (text.text ?? "") : "", 0, 0);
	}
	const text = renderResultText(details);
	return new Text(
		details.error || details.cancelled ? theme.fg("warning", text) : text,
		0,
		0
	);
}

function errorResultDetails(
	params: AskParams,
	issues: AskValidationIssue[]
): AskResult {
	return {
		title: params.title,
		cancelled: true,
		cancelReason: "invalid_input",
		mode: "submit",
		questions: [],
		answers: {},
		error: {
			kind: "invalid_input",
			issues,
		},
	};
}

function formatValidationError(issues: AskValidationIssue[]): string {
	return [
		"Invalid ask_user payload:",
		...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
	].join("\n");
}

function formatNonInteractiveMessage(
	state: ReturnType<typeof createInitialState>
): string {
	const lines = [
		"Needs user input: ask_user requires interactive TUI mode.",
		"Run same tool call in interactive TUI mode, or ask user these questions manually:",
	];

	for (const [index, question] of state.questions.entries()) {
		lines.push(`${index + 1}. ${question.label}: ${question.prompt}`);
		for (const option of question.options) {
			lines.push(`   - ${option.label} [${option.value}]`);
		}
		lines.push("   - Type your own [custom]");
	}

	lines.push(
		"details.questions contains normalized pending questions. details.answers stays empty until user responds."
	);
	return lines.join("\n");
}
