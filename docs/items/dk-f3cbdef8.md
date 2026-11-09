---
id: dk-f3cbdef8
type: task
created: 2026-11-03
status: done
since: 2026-11-09
area: structure
priority: P3
rank: zzzzzzzzzt
parent:
fixes: []
blocked_by: []
relates: []
---
# Split resume import-file.ts into bounded read + text extraction


Push review 2026-11-03 (componentization, P2): importResumeFile mixes the bounded filesystem read with PDF/DOCX parsing. Split into readBounded(path,max) and extractResumeText(buffer,ext); keep importResumeFile as the composition.
