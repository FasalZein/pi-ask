# Compact mode is the improvement track; full mode stays frozen

This refines ADR 0005. Full mode stays the default for now, and it stays frozen: upstream v1.2.0 text plus the package rename, pinned by the golden test. It is the comparison baseline for every change to model-facing text.

Every change to what the model sees goes into compact mode only. That covers tool text, the parameter schema, result text, system-prompt additions, and whether `ask_user` is active at all. UI, session, and command changes that the model never sees apply to both modes.

The fork diverges from upstream on purpose. We do not plan upstream contributions, so upstream parity is not a goal for compact mode.

Compact becomes the default after two checks. First, the base-model gate (ADR 0003) passes on the current compact text. Second, a report run on `anthropic/claude-opus-5-5` and `openai-codex/gpt-6-sol` shows no behavior regression against full mode. A later ADR records that switch and replaces 0005's default.

`PI_ASK_PROMPT_MODE` is inherited by child pi processes. So setting compact mode in the parent shell also applies it to subagents.

Exception: removing the bundled `ask-user` skill changes the model-visible skill catalog in both modes. This is deliberate. The skill is package content, not full-mode tool text; the full-mode golden text remains frozen.
