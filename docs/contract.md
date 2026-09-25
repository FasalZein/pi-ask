# Ask tool contract

`ask_user` is a pi-native clarification tool for cases where implementation depends on user preference or missing requirements.

This document defines the stable external behavior. It does not explain internal helper-by-helper implementation.

## Prompt mode

The extension selects tool text once at load from `PI_ASK_PROMPT_MODE`. Unset, empty, and `full` keep the upstream v1.2.0 description, guidelines, and parameter schema. `compact` uses a shorter description, two guidelines, and instructional `questions`, option `value`, and `recommended` descriptions. Its question schema permits up to four questions and makes option `value` optional. The tool snippet and other parameter descriptions remain unchanged. Unknown values use full mode and log one warning. The tool definition does not change between turns. Compact mode places general follow-up rules in tool text once. Results do not carry a general follow-up hint, including recovery and command-flow deliveries. Only compact elaborate results add one answer-first instruction to model-facing content: `First answer the user's note directly using the question and option context; re-ask only the affected question if a choice is still needed.` This instruction does not change transcript rendering or full-mode content. Conditional configuration guidance is active in compact mode.

## Input

```ts
{
  title?: string;
  questions: Array<{
    id: string;
    label?: string;
    prompt: string;
    type?: "single" | "multi" | "preview";
    required?: boolean;
    options: Array<{
      value: string;
      label: string;
      description?: string;
      preview?: string;
      recommended?: boolean;
    }>;
  }>;
}
```

This input shape shows full mode. In compact mode, option `value` is optional in the tool schema; the tool fills it before execution.

## Input rules

- at least one question is required
- every question must have non-empty trimmed `id` and `prompt`
- every question must have at least one option
- question ids must be unique within one tool call
- option `value`s must be unique within a question; in compact mode, missing values derive from label slugs and avoid collisions with explicit and derived values in that question
- blank optional `title`, question `label`, option `description`, and option `preview` fields are treated as omitted
- question `label` falls back to `Q1`, `Q2`, ...
- option `label` is required in the public schema; before schema validation, a missing or blank string label is derived from a non-empty `value` by replacing hyphens and underscores with spaces and capitalizing the first character
- `recommended` is optional presentation metadata; zero, one, or multiple options may set it to `true`
- recommended options show `(recommended)` after the option label on the same row; the description, when present, stays on the next row; recommendations never preselect an answer
- `type` defaults to `single`
- `required` defaults to `false`
- `required` is metadata only; it never blocks submission
- preview questions require preview text for every declared option; option descriptions do not satisfy this requirement, and invalid preview payloads report a fix hint to add preview text or switch to `type: "single"`
- all questions get an internal `Type your own` option

## Output

```ts
{
  content: [{ type: "text"; text: string }];
  details: {
    title?: string;
    cancelled: boolean;
    cancelReason?: "user" | "aborted" | "ui_unavailable" | "invalid_input";
    error?: {
      kind: "invalid_input";
      issues: Array<{
        path: string;
        message: string;
      }>;
    };
    mode: "submit" | "elaborate";
    questions: Array<{
      id: string;
      label: string;
      prompt: string;
      type: "single" | "multi" | "preview";
      presentedType?: "single" | "multi" | "preview";
    }>;
    answers: Record<
      string,
      {
        values: string[];
        labels: string[];
        indices: number[];
        customText?: string;
        note?: string;
        optionNotes?: Record<string, string>;
      }
    >;
    continuation?: {
      strategy: "refine_only" | "resume";
      affectedQuestionIds: string[];
      preservedAnswers: Record<string, {
        values: string[];
        labels: string[];
        indices: number[];
        customText?: string;
        note?: string;
        optionNotes?: Record<string, string>;
      }>;
      questionStates: Record<string, {
        status: "answered" | "needs_clarification" | "unanswered";
      }>;
    };
    elaboration?: {
      instruction: string;
      nextAction: "clarify" | "clarify_then_reask";
      items: Array<
        | {
            target: { kind: "question" };
            question: {
              id: string;
              label: string;
              prompt: string;
              type: "single" | "multi" | "preview";
              presentedType?: "single" | "multi" | "preview";
              options: Array<{
                value: string;
                label: string;
                description?: string;
                preview?: string;
                recommended?: boolean;
              }>;
            };
            answered: boolean;
            answer?: {
              values: string[];
              labels: string[];
              indices: number[];
              customText?: string;
              note?: string;
              optionNotes?: Record<string, string>;
            };
            note: string;
          }
        | {
            target: { kind: "option"; optionValue: string };
            question: {
              id: string;
              label: string;
              prompt: string;
              type: "single" | "multi" | "preview";
              presentedType?: "single" | "multi" | "preview";
              options: Array<{
                value: string;
                label: string;
                description?: string;
                preview?: string;
                recommended?: boolean;
              }>;
            };
            option: {
              value: string;
              label: string;
              description?: string;
              preview?: string;
              recommended?: boolean;
            };
            selected: boolean;
            answered: boolean;
            answer?: {
              values: string[];
              labels: string[];
              indices: number[];
              customText?: string;
              note?: string;
              optionNotes?: Record<string, string>;
            };
            note: string;
          }
      >;
    };
  };
}
```

## Live progress

While the TUI or RPC ask flow is open, `ask_user` sends a tool update after each committed answer change. Each update carries the answers so far in `details` and the same summary text shape as a submitted result in `content`. Navigation and review do not send updates. Updates stop when the flow ends, are not stored in the session, and are not sent to the model. The final result text is unchanged.

## Output rules

- `cancelled: true` means the user dismissed the flow, the run was aborted, UI was unavailable, or the payload was invalid before UI opened; every cancelled result includes `cancelReason`: `user` for cancel or dismiss (including command flows), `aborted` for a tool run interrupted by its abort signal, `ui_unavailable` for non-interactive modes, or `invalid_input` for payload validation failures. An aborted tool result says exactly: `The ask_user form was closed because the run was aborted. No answers were collected.` It contains no answers.
- semantically invalid payloads that reach tool execution return `error.kind === "invalid_input"` with structured `issues` and a transcript-friendly `Invalid ask_user payload:` message; their rendered status is `Invalid tool payload`
- payloads missing schema-required fields fail Pi's schema validation before tool execution and use Pi's standard tool-error result without structured `details`
- `mode: "submit"` is normal completion; `mode: "elaborate"` means the user asked the agent to continue with follow-up clarification based on notes
- unanswered questions without notes are omitted from `answers`; note-only entries remain in `answers` to carry their notes, but all non-cancelled submitted result text includes `<label>: (no answer)` in summary mode and `? <label>: (no answer)` in transcript rendering
- in `mode: "elaborate"`, `answers` contains only committed answers; note-only entries move to `elaboration.items`
- `continuation.strategy === "refine_only"` means the next ask should refine the current flow rather than restart it
- `continuation.preservedAnswers` contains previously committed answers that should be kept as context and not re-asked
- `continuation.affectedQuestionIds` lists the only questions that should be revisited
- `continuation.questionStates` marks each question as `answered`, `needs_clarification`, or `unanswered`
- single-select answers still use arrays
- recommendation markers never change canonical submitted labels or values
- when `behaviour.presentSingleAsMulti` is enabled, requested single-select questions are presented and handled as multi-select in future/replayed ask flows; result question metadata keeps the requested `type`, adds `presentedType` when final presentation differs, and result text uses one compact note when any answered questions were presented differently
- `indices` are 1-based rendered option positions
- `customText` stores the free-form answer
- on single-select questions, saving free-form text clears selected options for that question
- on multi-select questions, `values` and `labels` include both selected options and `customText` when both are present
- on multi-select questions, selected options keep their original order and `customText` is appended last
- submitting free-form text on a multi-select question stays on the same question tab and marks the custom row selected
- on multi-select questions, toggling an empty custom row opens the free-form editor, while toggling a custom row with saved free-form text selects or deselects it without opening the editor or clearing the text
- saving or clearing free-form text on a multi-select question does not clear other selected options
- `note` stores a question-level note
- `optionNotes` includes only notes for selected options
- question notes may exist without a selected answer
- `elaboration.items` includes all question notes and all option notes, even for unselected options
- every elaboration item includes the full normalized question and option list for that question so referential notes like `above` remain understandable to the agent
- option-targeted elaboration items include the specific noted option plus whether it is currently selected
- question-targeted elaboration items include whether the question already has a committed answer
- `elaboration.instruction` tells the agent to answer the clarification directly first, then re-ask only the affected questions if a choice is still needed; in compact mode only, elaborate result `content` also carries the short answer-first instruction so the model receives it
- after clarification, agents should prefer another structured follow-up over plain-text multiple choice when a decision is still unresolved
- once prior answers narrow the branch, agents should bundle the next 2-3 related unresolved questions into one follow-up ask when possible, instead of using a long sequence of single-question asks
- `elaboration` is only present when `mode === "elaborate"`
- elaborate `content` text and transcript rendering describe each note directly using the full question prompt and option label, and include the current committed answer text when available, instead of a generic elaboration banner
- when the user selects `Elaborate` without adding notes, elaborate `content` text and transcript rendering still include the committed answer text so the agent can elaborate on that answer directly

## Supported UX

- tabbed multi-question flow
- rules and preview frames use pi border colors; the custom-answer and note editor uses pi editor colors and completion-list styling
- single-select, multi-select, and preview questions
- preview boxes appear beside options at wide widths and below them at narrow widths; each is at most 14 rows tall and shrinks on short terminals. Long previews scroll independently with `[` and `]` by default, show the number of lines above and below, and preserve plain-text spacing without Markdown. Long option descriptions may be shortened inside the cap.
- recommended options show `(recommended)` after the label in standard and preview lists, without automatic selection
- active question type changes via configurable `main.changeQuestionType` hotkey, default `t`; non-preview questions toggle `single <-> multi`; preview questions toggle `preview <-> multi`
- inline free-form answers for all question types
- native pi-style `@` file path autocomplete inside free-form answer and note editors
- `/skill:` completion in custom-answer and note editors (including notes used for Elaborate) lists skills loaded by pi, including skills provided by other extensions; it works after prose and on later lines
- submitted and elaborated results retain typed `/skill:name` tokens in the recorded answer or note; each distinct known skill referenced there adds its `SKILL.md` path to model-facing content and to `details.resolvedSkills`, without inlining the skill body; unknown tokens add no path and results without known tokens do not change
- question notes via `Shift+N`
- option notes via `n`
- number-key quick selection
- review tab shows `Review · n of m answered`, then aligned ✓/– question rows with answers or `not answered`, then Submit, Elaborate, and Cancel actions
- on the review tab, `Submit` and `Cancel` preview notes only for answered questions
- on the review tab, `Elaborate` preview expands to all question notes and all option notes, including notes on unselected options
- transcript-friendly call and result rendering
- `/answer` command to convert the latest completed assistant message into an `AskParams` form through a synthetic `ask_user` tool call and open the ask UI
- `/answer` extraction may use an internal `freeform: true` option for open-ended questions with no explicit choices; these render as user-input-only questions with the label `Type your answer:`, no numbered option row, and no selection caret; this marker is not part of the public `ask_user` tool contract
- `/answer:again` command to replay the latest `/answer`-extracted form on the current branch
- `/ask:replay` command to replay the latest real `ask_user` form on the current branch
- automatic recovery of the newest unresolved `ask_user` form on startup, resume, fork, or in-session `/tree` navigation
- ask settings list with binary behaviour/notification toggles and a guarded reset-to-defaults action
- `?` in the ask flow and `/ask-settings` in pi open the same lightweight ask settings overlay
- settings attempt to persist immediately when changed: `Auto-submit when answered without notes`, `Confirm dismiss when dirty`, `Double-press review shortcuts`, `Notifications`, and `Show footer hints`; `Present single-select as multi-select` persists immediately when saving succeeds but applies only to new/replayed ask flows; save failures revert the setting and show a manual-edit message; resetting config to defaults requires pressing the reset action twice within a short confirmation window
- `Keymaps` is a persisted, context-aware config section for global, main-flow, editor, note-editor, and settings-modal actions
- the settings overlay scales to the terminal width and windows long content on short terminals so the focused setting and close hint remain visible; the settings list shows the absolute config file path for customizing keymaps, notifications, and extraction settings
- if the flow is already on the review tab, all questions are answered, and no notes exist, enabling auto-submit can complete the current ask flow immediately
- elaborate results are phrased as direct follow-up instructions, for example: `User asked to elaborate on question "Which option would you like to select?" option "Option A" with note "why this one?"`

## Keyboard behavior

Main flow:

- `global.settings` opens ask settings; default: `?`
- `global.dismiss` dismisses the active ask surface; default: `Ctrl+C`
- `main.nextTab` / `main.previousTab` move between tabs; defaults: `Tab`/`Right`, `Shift+Tab`/`Left`
- `main.nextOption` / `main.previousOption` move between options or review rows and actions; on review, Up from Submit focuses the last question row and Enter opens the focused question; defaults: `Down`, `Up`
- `main.pageUp` / `main.pageDown` move question focus by one visible page, or scroll review answers without moving the selected action; defaults: `Shift+Up` / `PageUp`, `Shift+Down` / `PageDown`
- `main.previewUp` / `main.previewDown` scroll long preview text in a bounded preview pane, without moving option focus; defaults: `[` and `]`
- `main.confirm`, `main.cancel`, and `main.toggle` confirm, cancel, or toggle; defaults: `Enter`, `Esc`, `Space`
- `main.changeQuestionType` changes the active question type (non-preview: `single <-> multi`; preview: `preview <-> multi`); default: `t`; destructive `multi -> single` changes require pressing the type hotkey again, with no timeout, and the pending confirmation clears on other navigation/actions
- `main.optionNote` and `main.questionNote` open option/question notes; defaults: `n`, `Shift+N`
- question options use `▶` for focus; multi-select options use `[ ]` and `[✓]`, and the question shows `Pick any · N of M selected` for predefined options (plus a selected custom answer, if any)
- question footers show the configured up/down and next-tab navigation, plus fixed `1-9` shortcuts; editor footers do not advertise tab navigation
- on a short terminal, the header, tabs, question prompt, multi-selection count, and footer stay fixed while option rows and review answers window to the available rows; focused options, review rows, and review actions stay visible, and indicators count hidden options or review rows when space permits
- in pi fullscreen on pi-tui 0.85.0 or later, the wheel scrolls option or review rows under the pointer, or only the preview when over its box; scrolling does not move selection, and the next key restores list focus-follow; at a scroll boundary, the wheel event passes through to pi. Older hosts do not call the mouse handler, and regular mode leaves mouse input to the terminal.
- the header shows `Question N of M` for questions and `Review` on the review tab; text tabs show ✓ after answered question labels, a filled active tab, and a separate `│ Review n/m` count; narrow tab rows keep the active tab visible and show overflow markers only for hidden tabs
- pi `tui.select` up/down/confirm bindings also navigate and confirm when they do not conflict with an ask binding; pi select cancel never cancels an ask, and `Ctrl+C` still dismisses
- `1..9` is fixed and selects or toggles the matching option; on the review tab, `1`, `2`, and `3` trigger `Submit`, `Elaborate`, and `Cancel` even when a question row has focus
- when `Double-press review shortcuts` is enabled, review-tab `1`, `2`, and `3` require the same key twice without a timeout, and the review screen shows an inline hint for the pending action

Editing flow:

- `editor.submit` submits the current custom-answer editor input and closes the editor; default: `Enter`
- `noteEditor.save` saves the current note editor and keeps the ask flow open; default: `Enter`
- `editor.close` / `noteEditor.close` save draft and close the editor; default: `Esc`
- `global.dismiss` dismisses the entire flow immediately without saving the current editor draft when no dirty-dismiss confirmation is pending
- `global.settings` opens ask settings when the editor is empty; otherwise the key is delegated to the editor as text/input
- when editor has text, arrow keys and `Tab` stay in the editor so the cursor can move while typing
- when editor is empty, editor-context `*WhenEmpty` navigation actions move options or tabs without requiring the editor close binding first
- `@` remains a fixed file-reference affordance in editors; `/skill:` opens pi skill completion

Settings modal:

- `settingsModal.close` closes settings; defaults: `Esc`, `Ctrl+C`, `?`
- `settingsModal.nextOption` / `settingsModal.previousOption` move between settings; defaults: `Down`, `Up`
- `settingsModal.toggle` toggles the highlighted setting and attempts to save immediately; if saving fails, the setting reverts and an error is shown; on the reset action, the same binding must be pressed twice within a short confirmation window; defaults: `Enter`, `Space`

Dirty dismiss:

- when `Confirm dismiss when dirty` is enabled, cancelling or dismissing a dirty ask flow requires the same action a second time
- the dirty-dismiss warning stays visible until the user changes tabs in the ask flow

## Execution and lifecycle

While an interactive ask flow is open, pi-ask sets the `pi-ask` footer status and terminal title to the current question number, or to review. Both update when the active tab changes and clear when the flow submits, cancels, aborts, or errors. This also applies to recovered TUI asks and RPC dialogs. Non-interactive calls do not show a waiting indicator.

`ask_user` requests sequential execution. When one assistant message calls it alongside other tools, pi runs the entire batch one call at a time. A pre-aborted call does not open the UI; aborting an open flow closes it and emits the remote `completed` event. On session shutdown, open flows close. An interrupted recovered ask has no dismissal marker or tool result, so startup can reopen it again.

## Compact-mode configuration advice

In compact mode, pi-ask leaves the system prompt unchanged. When the expanded user prompt mentions `pi-ask`, `ask_user`, `ask-user`, `/ask-settings`, `ask settings`, `/answer`, `/ask:replay`, `keymap`, or `keybinding` (case-insensitive), pi-ask sends the configuration-doc sentence as a hidden model-facing message. It sends only one copy while that message remains in the model context, and sends it again after compaction removes it. A typed `/ask-settings` extension command runs before prompt matching and does not trigger this message. Full mode continues to append the sentence to the system prompt on every run.

## Non-TUI and non-interactive modes

In compact mode, print and JSON sessions without a UI remove `ask_user` from the active tools at session start. No other active tool changes, and tools excluded by a CLI allowlist or denylist stay excluded. RPC and TUI keep `ask_user` active when it was active already. Full mode never changes the active tool list. The compact configuration-doc trigger remains active in headless sessions when the user's prompt matches; it does not require `ask_user` to be active.

The rich ask flow uses `ctx.ui.custom()` only in TUI mode. In RPC mode with a UI, pi-ask uses pi dialogs: single and preview options show labels and preview text before selection, multi options use repeated checkbox-prefixed selects with Done, and custom answers use input. The last select offers Submit or Cancel. Dismissing any dialog cancels as `user`; aborting cancels as `aborted`. RPC does not offer notes or Elaborate. Every dialog receives an abort signal. If `ask_user` is called directly without an interactive UI, it keeps the existing `Needs user input: ask_user requires interactive TUI mode.` content and `cancelReason: "ui_unavailable"` details.

The full-mode public schema requires question `id` and `prompt` plus option `value` and `label`. The compact-mode schema requires `id`, `prompt`, and `label`, caps questions at four, and fills a missing option `value` from a slug of its label before schema validation. Derived values are unique within each question, including against explicit values. For example, `Offline only` becomes `offline-only`; a collision gets a numeric suffix. Blank explicit values remain invalid. Both schemas restrict question `type` to `single`, `multi`, or `preview`, so malformed structural fields fail before execution. The tool still validates trimmed text, uniqueness, option counts, and preview requirements during execution and returns structured issues for those failures. Result rendering falls back to Pi's raw tool-error text when schema validation prevents execution.

The ask flow subscribes to runtime settings updates while open. In practice, this means changing `Auto-submit when answered without notes`, `Confirm dismiss when dirty`, `Double-press review shortcuts`, `Notifications`, `Show footer hints`, resetting config to defaults, or reloading config-backed keymaps can affect the in-progress ask flow immediately instead of only future asks when the change is saved or otherwise applied in memory. Load-time migrations and invalid config handling do not rewrite, rename, or back up the config file; invalid files load defaults for the session and show a notice. `Present single-select as multi-select` is applied when an ask flow is created and does not rewrite question semantics for an already-open flow; use `main.changeQuestionType` for live per-question changes.

## Notifications

When enabled, pi-ask emits one best-effort external notification per ask session after the ask UI opens and waits for input. The default title is `pi ask`; the message is `Question waiting: <label or prompt>`. Channels run in configured order and failures never fail or cancel the ask flow. Command channels run through Pi with shell syntax, a 5-second timeout, and the ask tool abort signal.

## Remote inter-extension events

pi-ask exposes a local `pi.events` contract for trusted Pi extensions. It does not expose a network API and does not automate terminal keystrokes. RPC opens pi dialogs and also emits lifecycle events. A trusted in-process bridge can submit while an RPC dialog is open; its valid submission wins and closes the dialog. Headless integrations cannot open dialogs and need their own user interaction.

Channels:

- `pi-ask:started`
- `pi-ask:completed`
- `pi-ask:submit`
- `pi-ask:submit-result`

Remote submissions must be explicit `{ kind: "answer" }` or `{ kind: "cancel" }` responses. Remote answers use question ids and normalized option values from the started event. pi-ask validates ids and values, recomputes labels/indices, and does not infer approval semantics from labels.

See [`remote-events.md`](remote-events.md) for payload shapes, examples, and a local smoke test.

## Slash command replay/extraction

- valid `ask_user` payloads are persisted as branch custom entries before the UI opens, so `/ask:replay` can reopen them after cancel, `/resume`, or `/tree`
- `/answer` scans the current branch for the latest assistant message; if that message did not finish with `stop`, extraction is refused
- `/answer` sends the preceding user message as context with the latest assistant text and asks the extractor for one synthetic `ask_user` tool call
- missing or invalid tool calls and deferred model responses are retried according to `answer.extractionRetries`; deferred content is ignored, and raw or fenced JSON text remains supported as a last-resort fallback
- `{ "questions": [] }` from extraction means no questions were found and is not treated as an invalid ask payload
- command-flow cancellation closes with a notification and does not send a message to the agent
- submitted or elaborated command-flow results are sent back with user-message semantics
- replay commands scan only `ctx.sessionManager.getBranch()`, ignore sibling/future branch payloads, and revalidate stored payloads before opening the UI
- the TUI transcript shows a one-line themed `ask saved` marker with the title or question count for each stored ask, and `pending ask dismissed` for each dismissal; both remain custom session entries and are never added to model context

## Interrupted ask resume

- on `session_start` with reason `startup`, `resume`, or `fork`, or after a `session_tree` navigation, pi-ask finds the newest `ask_user` tool call on the active branch that has neither a tool result nor an `ask:pending-dismissed` entry
- recovery does not run for `new`, `reload`, or non-TUI sessions; another event cannot open a second recovered flow while one is open
- the matching valid `ask:payload` supplies the form; if it is missing or invalid, pi-ask validates and uses the original tool call arguments instead
- the recovery flow is detached from the session event, so an open form does not block other lifecycle handlers
- because the interrupted `execute` promise no longer exists, submit sends the result with the same user-message semantics as replay commands
- submit and cancel both append `ask:pending-dismissed`, which prevents another automatic reopen; `/ask:replay` still works
- recovered flows emit remote lifecycle events with source `ask:resume`
- before each model request, a dismissed recovered `ask_user` call without a real tool result receives one non-error result directly after its assistant message: `This ask_user call was interrupted by a restart. Its outcome, if any, follows in a later user message.` This applies to both submitted and cancelled recovery; calls without a dismissal marker or with a real result are unchanged. The result is added only to the outgoing request, not to the session file.

The fallback message includes normalized pending questions and options so the caller can re-ask them manually. `details.questions` still contains normalized question metadata, while `details.answers` stays empty until a user responds.

## Skill alignment (advisory)

The auto-bundled skill profile at `skills/ask-user/SKILL.md` defines agent-side decision-gate guidance for when to call `ask_user`. It is enabled by default when the package is installed, but can be disabled via `pi config`.

It is advisory only. If there is any conflict, contract + tests win.

## Source of truth

Behavior should be verified against:

1. `src/types.ts` and exported state/result helpers
2. `tests/*.test.ts`
3. this contract
