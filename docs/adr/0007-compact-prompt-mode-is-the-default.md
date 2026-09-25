# Compact prompt mode is the default

This replaces the default in ADR 0005 and closes the switch condition in ADR 0006. With `PI_ASK_PROMPT_MODE` unset or empty, pi-ask loads compact text. `full` still loads the frozen upstream v1.2.0 text, pinned by the golden test, and stays the comparison baseline for every change to model-facing text. Unknown values warn once and use the default.

Both ADR 0006 checks passed on the current compact text (#39). The base-model gate (ADR 0003) showed no regression against full: compact asked fewer questions (39 against 47) and had no rejected calls (0 against 3). Opus and gpt-6-sol showed no regression either. Billed tokens per conversation fell by 5.3% on the base model, 14.2% on Opus, and 8.5% on gpt-6-sol.

## Considered options

- **Keep full as the default until compact makes zero unsolicited follow-up calls.** Rejected. Full mode fails that rule too, on every model we tested, so the rule measures model behavior, not a compact regression. The recorded criterion is "no regression against full" (ADR 0003).

## Consequences

- Tests that assert full-mode text must select full explicitly before `src/prompt-text.ts` loads.
- Users who pin a release before this change keep full mode until they update.
