# November 2026 answer latency decisions

Historical rationale retained from the current decision map.

## 2026-11-05 — Neutral speculation for every accepted verdict (answer latency, round 2)

Supersedes the 2026-11-04 "question me only" speculation. Plan: `docs/plans/answer-latency-round2.md`.
The automatic focus block (`answer-context/automatic-turn.ts`) now uses ONE neutral wording for all
six accepted verdicts (question/request/objection × me/room): respond to this completed turn; answer
if it asks for information or an opinion, act on it if it asks Me to explain, demonstrate, decide or
act, reply if it challenges something; plus the anchor reminder and a conditional room rule (put to
the group rather than to Me: suggest only if genuinely useful and non-repeated, else `<none>`). It
never states the classifier's kind or addressee, so the speculation built before the classifier is
the same prompt as the ordinary one and is promoted for every accepted verdict when nothing else
moved. `other` under Answer every question keeps the explicit reference-answer prompt, so that
speculation is discarded and the ordinary path answers.

- **Cost unchanged:** at most one speculative call per classified candidate on a free lane; no
  verdict-only replacement call for request/room any more.
- **Tradeoff accepted:** the model must infer direct-vs-room from context instead of being told, so
  answer quality needs owner observation (live acceptance, docs/REHEARSAL.md).
- Rejected: six per-verdict speculations (6x spend); a follow-up instruction after the verdict (it
  cannot retroactively fit held text); keeping verdict wording in the prompt (forces a replacement
  call for request/room).
