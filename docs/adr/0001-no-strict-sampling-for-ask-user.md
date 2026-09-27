# ask_user does not use constrained sampling

pi 0.82+ lets a tool request strict JSON-schema sampling (`constrainedSampling`). We do not set it on `ask_user`. For strict-capable models, pi rewrites the schema so every optional field becomes required-or-null. On 2026-09-24 that added 355 characters (about 125 tokens) to every request, and pi's catalog marks all current Anthropic models as strict-capable. It would also change full prompt mode's provider request, which must match upstream v1.2.0. It gives nothing on the base model: pi sends no strict schemas to unknown OpenAI-compatible endpoints such as 9router. The runtime validation in `ask_user` already returns fix hints for bad payloads.

Reopen this decision if the model matrix shows schema-shape failures on strict-capable models.
