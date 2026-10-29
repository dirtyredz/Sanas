// The overlay's output contract, shared by every live suggestion (answers and next points)
// so the safe renderer (renderer/src/lib/CompactSuggestion.tsx) always sees the same subset:
// one bold headline, optionally one short fenced code block, at most two short lines.

export const COMPACT_CONTRACT = `Format for a small live-meeting overlay (follow exactly):
- Line 1 is one bold headline, written as **text**, at most about 20 words. It must contain
  the thing to say or the answer, not a label.
- Optionally include ONE fenced code block after it. Keep it minimal, runnable, and at most
  25 lines. No comments unless essential.
- Optionally include at most 2 short follow-up lines after the headline or code.
- No headings, bullet walls, preamble, or praise such as "Great question".`
