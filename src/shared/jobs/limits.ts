// Job field limits enforced by main's IPC validation and shown by the job editors, so the
// two cannot disagree. Context-pack fields are sent with every suggestion and summary.

export const JOB_NAME_MAX_CHARS = 120
export const JOB_CONTEXT_MAX_CHARS = 20_000
/** Widened from 2,000 to match the resumes interview-pack contract (imported personas). */
export const JOB_PERSONA_MAX_CHARS = 20_000
export const JOB_SUMMARY_EMAIL_MAX_CHARS = 200
export const GLOSSARY_TERM_MAX_CHARS = 100
export const GLOSSARY_NOTE_MAX_CHARS = 500
