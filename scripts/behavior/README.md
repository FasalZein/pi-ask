# Live behavior harness

Run from the repository root, outside `pnpm test`. The driver starts a fresh Pi RPC process and session for each case. It loads only this worktree's extension and an in-process auto-answer bridge. The bridge uses `pi-ask:started` and `pi-ask:submit`, not terminal keys or RPC dialog responses. The default matrix is the base model (three runs per case per mode) and five report-only models (one run per case per mode). **The default run makes 96 model conversations, potentially with multiple turns each; it can incur significant provider charges.** Get approval before running paid models. The base-only full-mode dry run makes six conversations.

```sh
node scripts/behavior/run.mjs --models 9router/cbcn/deepseek-v4.1-flash --modes full --repeats 1
```

Default: `node scripts/behavior/run.mjs`. Override with `--models provider/id,provider/id`, `--modes full,compact`, `--repeats N` (all selected models), or `--case naming` for diagnosis. Each run uses a separate process and has a 120-second timeout. Set `PI_ASK_BEHAVIOR_TIMEOUT_MS` for slower providers. Set `PI_ASK_BEHAVIOR_DIR` to change the output directory (default `~/.pi/artifacts/pi-ask/behavior/`). A non-zero exit indicates infrastructure failure (unavailable model, RPC error, rejected bridge answer, timeout, or process failure). Behavioral differences are recorded, not treated as infrastructure errors.

Each JSON record contains the model, mode, case, run number, prompt, bridge trace, tool calls, assistant text, and the spec metrics. `asked`, `questionCount`, `questionTypes`, `recommendations` (with descriptions), `validationErrors`, `followUp` (`bundled`, `plain_text`, `separate`, or `none`), and `configurationDocRead` are observations, not automatic pass/fail judgments. Read the trace and text before drawing conclusions. A follow-up can be assessed only when the model actually asks one. Configuration-doc reads are detected from `read` tool calls. Token usage belongs to the separate token-efficiency experiment in spec #1 and is not estimated here.

`--no-extensions` prevents the installed upstream package from loading twice; explicit `-e` loads this worktree and its bridge. No settings file is changed. Pi uses `--no-session`, allows only `read` and `ask_user`, and disables discovered skills, prompts, themes, and project context. The harness does not modify the project.
