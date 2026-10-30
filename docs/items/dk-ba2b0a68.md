---
id: dk-ba2b0a68
type: feature
created: 2026-10-30
status: wip
since: 2026-10-30
area: assist
priority: P1
rank: t
parent:
fixes: []
blocked_by: []
relates: []
---
# Presentation mode: ordered slides with a Prev/Next cursor; coaching scoped to the current slide


Owner presents a prepared deck through Sanas (first case: Constellation AS9 writeback deck, 2026-10-30). Today the job's talking points are one flat list, so Next point can jump ahead to later slides.

Acceptance:
- A job can hold an ordered slide list: title, talking point, optional script (planned wording), optional key facts. Editable in the job page; bulk import from pasted text/Markdown.
- During a live meeting the overlay shows the current slide (title, talking point, script) with Prev/Next controls and a global hotkey; the cursor is per meeting and recorded.
- Next point and answers receive the current slide (+ the next one as a lookahead) and are told not to raise later slides; the coach compares what Me said with the current slide's script and points out what was skipped or misstated.
- Meetings without slides behave exactly as today.
- No cloud persistence; slides stored locally like other job context.

Owner clarifications (2026-10-30):
- Sanas never shows the slides themselves: the deck is presented from the same machine in its own app. A slide in Sanas is the owner's words for that point (title, talking point, script). The overlay is a teleprompter plus suggestions, not a slide viewer.
- Question listening and answering stays fully on in presentation mode. When another speaker asks something, the answer path works as today and draws on the WHOLE job context (notes, all slides); the current slide is only a hint about where the talk is. Only the Next point coach is scoped to the current slide.
