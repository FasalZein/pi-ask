# Live behavior harness

Run from the repository root, outside `pnpm test`. Each case has a fresh Pi process and session. The six original cases plus `interview` use RPC with the in-process auto-answer bridge. The bridge uses `pi-ask:started` and `pi-ask:submit`, not terminal keys or RPC dialog responses. `subagent` runs `pi -p --mode json`, with `--tools read,ask_user` and `--no-context-files`, matching a background child's print mode and restricted tool list. Both paths use only this worktree's `src/index.ts` via `--no-extensions -e`; print mode needs no answer bridge. Both modes can call `ask_user` in print mode but cannot open its UI; the call returns the "Needs user input" result.

The default matrix is the base model (three runs per case per mode) and five report-only models (one run per case per mode). **With eight cases, the default makes 128 model conversations, potentially with multiple requests each; it can incur significant provider charges.** Get approval before running paid models. A base-only full-mode dry run with `--repeats 1` makes eight conversations.

```sh
node scripts/behavior/run.mjs --models 9router/cbcn/deepseek-v4.1-flash --modes full,compact --repeats 1 --case interview
node scripts/behavior/run.mjs --models 9router/cbcn/deepseek-v4.1-flash --modes full,compact --repeats 1 --case subagent
```

For more base-model evidence, use `--models 9router/cbcn/deepseek-v4.1-flash --repeats 5`. Across all eight cases and both modes this starts **80 conversations** (plus any internal requests), versus 48 at the default base repeat count. Restrict `--case` for a smaller paid run.

Default: `node scripts/behavior/run.mjs`. Override with `--models provider/id,provider/id`, `--modes full,compact`, `--repeats N` (all selected models), or `--case naming` for diagnosis. Each run has a 120-second timeout. Set `PI_ASK_BEHAVIOR_TIMEOUT_MS` for slower providers. Set `PI_ASK_BEHAVIOR_DIR` to change the output directory (default `~/.pi/artifacts/pi-ask/behavior/`). A non-zero exit indicates infrastructure failure (unavailable model, RPC error, rejected bridge answer, timeout, or process failure). Behavioral differences are recorded, not treated as infrastructure errors.

Each JSON record contains model, mode, case, run number, prompt, tool calls, assistant text, and `tokenUsage`: `firstRequest`, `total` (each with billed `input`, `output`, `cacheRead`, `cacheWrite` tokens), and `requestCount`. Usage sums finalized assistant messages only; it does not add `totalTokens` to its components. RPC records also include the bridge trace, `asked`, `questionCount`, `questionTypes`, `recommendations` (with descriptions), `validationErrors`, `followUp` (`bundled`, `plain_text`, `separate`, or `none`), and `configurationDocRead`. These are observations, not automatic pass/fail judgments. Read the trace and text before drawing conclusions.

`subagent` records `asked`, `askCalls`, `questionCount`, `needsUserInput` (the exact noninteractive tool result), `statedAssumption`, and `stoppedForDecision` in both modes, as well as the tool results. The text flags use simple keyword matching; inspect `assistantText` to distinguish a plan chosen alone from a safe stop. `interview` asks for a first decision, a bundled follow-up round, and a final dependent decision before a `PLAN:` marker. Its `interview` metrics are `askCalls`, `questionCount`, `followUpBundled`, `elapsedBeforePlanMs` (null if no marker), `runDurationMs`, and `runaway` (more than five ask calls). The bridge chooses the first option for each question. Questions and calls are recorded even if the model stops early or keeps asking. Model compliance is not guaranteed.

No settings file is changed. RPC allows only `read` and `ask_user`; print uses the same allowlist. Both disable discovered skills, prompts, themes, and project context. The harness does not modify the project.
