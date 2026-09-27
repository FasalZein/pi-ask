# Full prompt mode is the reference; compact mode is opt-in

Status: Superseded by [ADR 0008](0008-compact-is-the-only-prompt-mode.md).

pi-ask keeps two shapes of model-facing text. Full mode is the default. It is the upstream v1.2.0 text, with only the package name and doc path in the config sentence changed, and a golden test pins it byte for byte. Compact mode (`PI_ASK_PROMPT_MODE=compact`) states each rule once, in the place where the model reads it when it applies. pi-ask reads the mode once at load, because registering `ask_user` again with different text is a tool redefinition that can invalidate the provider's cached prefix.

Full mode still adds the config sentence by returning a replaced system prompt on every run, although pi 0.86+ recommends section edits. We keep that on purpose, so full mode stays a byte-identical reference. Compact mode leaves the system prompt alone and sends the config sentence as one hidden message, only when the user's prompt mentions pi-ask settings or keys. A message appended to the transcript keeps the cached prefix valid; a system prompt that changes between turns does not. A compact-mode change ships only when the base model gate passes (ADR 0003).
