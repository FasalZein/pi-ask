import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { AskOptionSchema, AskParamsSchema } from "./schema.ts";

// Mode is fixed when the extension module loads. Tool definitions must not change between turns.
export type PromptMode = "full" | "compact";

function readPromptMode(value: string | undefined): PromptMode {
	if (value === undefined || value === "" || value === "full") {
		return "full";
	}
	if (value === "compact") {
		return "compact";
	}
	console.warn(
		`pi-ask: unknown PI_ASK_PROMPT_MODE "${value}"; using full mode`
	);
	return "full";
}

export const promptMode = readPromptMode(process.env.PI_ASK_PROMPT_MODE);

export const ASK_TOOL_DESCRIPTION =
	"Interactive clarification tool for cases where the next step depends on user preferences, missing requirements, or choosing between multiple valid directions. Ask a short structured interview, collect normalized answers, and continue using those answers explicitly instead of guessing. Supports single-select, multi-select, and preview-pane questions. Always include a stable `id` and non-empty `prompt` for every question, plus a machine-readable `value` and visible `label` for every option. Use `preview` only when every option includes `preview` text; descriptions alone are not enough.";

export const ASK_TOOL_PROMPT_GUIDELINES = [
	"Use `ask_user` before making preference-sensitive decisions about scope, tone, UX, naming, architecture, docs, or implementation direction.",
	"When multiple valid directions exist, call `ask_user` with 1-3 concise questions instead of committing to one path on your own.",
	"When calling `ask_user`, prefer one focused decision per question. Use short labels. Provide clear, distinct options. Do not add filler options.",
	"When calling `ask_user`, always include a stable `id` and non-empty `prompt` for every question.",
	"When calling `ask_user`, always include a non-empty machine-readable `value` and visible `label` for every option.",
	"When calling `ask_user`, mark grounded preferences with `recommended: true` and use the option `description` to state the reason.",
	"When calling `ask_user`, choose question `type` from the question semantics: `single` means one answer is expected, `multi` means multiple answers could reasonably be selected, and `preview` means options need preview-pane detail.",
	'When calling `ask_user`, use `type: "preview"` only when every option includes non-empty `preview` text. Option descriptions do not satisfy this requirement.',
	"After an `ask_user` elaboration or follow-up note, prefer another structured `ask_user` follow-up if a choice is still needed instead of switching to plain-text multiple choice in chat.",
	"When prior `ask_user` answers narrow the branch, bundle the next 2-3 related unresolved decisions into one follow-up `ask_user` call when possible.",
	"Use one-at-a-time `ask_user` follow-up calls only when the next question materially depends on the previous answer.",
] as const;

export const ASK_TOOL_PROMPT_SNIPPET =
	"Clarify ambiguous or preference-sensitive decisions with a short interactive interview before proceeding";

export const COMPACT_TOOL_DESCRIPTION =
	"Interactive clarification tool for cases where the next step depends on user preferences, missing requirements, or choosing between multiple valid directions. Ask a short structured interview, collect normalized answers, and continue using those answers explicitly instead of guessing.";
export const COMPACT_TOOL_PROMPT_GUIDELINES = [
	"Use `ask_user` before preference-sensitive decisions (scope, tone, UX, naming, architecture, docs, implementation direction), or when several valid directions exist; ask 1-3 concise questions instead of choosing one path yourself.",
	"If a choice is still needed, use another structured `ask_user` call, not plain-text choices in chat.",
] as const;
export const COMPACT_ELABORATION_INSTRUCTION =
	"First answer the user's note directly using the question and option context; re-ask only the affected question if a choice is still needed.";
export const COMPACT_RECOMMENDED_DESCRIPTION =
	"Optional. Set true on an option you recommend for a grounded reason; state the reason in `description`.";
const { value: _fullValue, ...compactOptionProperties } =
	AskOptionSchema.properties;
const compactOptionSchema = {
	...AskOptionSchema,
	required: ["label"],
	properties: {
		...compactOptionProperties,
		label: Type.String({
			description:
				"Required short visible option label shown in the list; a unique machine identifier is derived from this label.",
		}),
		recommended: Type.Optional(
			Type.Boolean({ description: COMPACT_RECOMMENDED_DESCRIPTION })
		),
	},
};
const compactQuestionSchema = {
	...AskParamsSchema.properties.questions.items,
	properties: {
		...AskParamsSchema.properties.questions.items.properties,
		options: {
			...AskParamsSchema.properties.questions.items.properties.options,
			items: compactOptionSchema,
		},
	},
};
export const CompactAskParamsSchema = {
	...AskParamsSchema,
	properties: {
		...AskParamsSchema.properties,
		questions: {
			...AskParamsSchema.properties.questions,
			description:
				"Questions to ask in the interactive clarification flow. When prior answers narrow the branch, bundle the next 2-3 related decisions into one call; ask one at a time only when the next question depends on the previous answer.",
			maxItems: 4,
			items: compactQuestionSchema,
		},
	},
};

const CONFIGURATION_DOC_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"docs",
	"configuration.md"
);
export const PI_ASK_CONFIG_PROMPT = `When the user asks to configure, customize, debug, or explain @fasalzein/pi-ask settings or keymaps, first read ${CONFIGURATION_DOC_PATH} and follow it as the source of truth before editing config files.`;
