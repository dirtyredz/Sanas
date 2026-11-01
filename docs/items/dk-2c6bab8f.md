---
id: dk-2c6bab8f
type: task
created: 2026-11-01
status: todo
since: 2026-11-01
area: settings
priority: P3
rank: zzzzzzzt
parent:
fixes: []
blocked_by: []
relates: []
---
# Fold settings-pager.test.ts into page-order.test.ts

Sign-off nit 2026-11-01: frame/paging/settings-pager.test.ts tests only page-order.ts (INITIAL_PAGER/selectPage/stepPage) but is named for useSettingsPager; page-order.test.ts covers pageDirection. Merge them. Also: generic pageDirection<T> has one caller — move to lib/ only if a second caller appears.
