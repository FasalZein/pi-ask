# The base model gates changes to model-facing text

Some models follow tool rules worse than others, and strong models hide regressions. A change to model-facing text (prompt mode, rule homes, result texts) ships only when the base model, `9router/cbcn/deepseek-v4.1-flash`, shows no behavior regression against full prompt mode on the scripted behavior set, with 3 runs per prompt per mode. The other models in the matrix (`anthropic/claude-opus-5-5`, `openai-codex/gpt-6-sol`, `zai/glm-5.3`, `9router/cbcn/kimi-k3-1`, `grok-cli/grok-4.7`) run the same set once and only report: a regression there opens an issue but does not block.

Token savings are measured on `anthropic/claude-opus-5-5` (billed tokens) and on the base model, because tokenizers differ.
