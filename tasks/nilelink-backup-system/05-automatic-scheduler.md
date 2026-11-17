# Task 05 — Automatic Scheduler

## Objective

Run an automatic backup every day at **21:00 Africa/Cairo** inside the agent, with explicit timezone handling, no overlapping jobs, and safe behaviour across restarts.

## Why This Is Needed

The requirement is unattended daily backups. The scheduler must live in the agent (always-on Windows service), not in Cloudflare (no access to the disk) and not in Windows Task Scheduler (harder to keep consistent with job locking/metadata).

## Existing Project Files Involved

- `lib/cron/expiry-tracker.ts`, `app/api/cron/check-expiries/route.ts` — existing cron pattern in the *web app* (Bearer `CRON_SECRET`). **Not reused** for backups; noted so nobody wires backups into the Worker cron.
- `.env.example` (`CRON_SECRET` section) — do not add backup scheduling vars there; they belong to the agent's `.env.example`.

## New Files To Create

- `backup-agent/src/scheduler/scheduler.ts`
- `backup-agent/src/scheduler/time.ts` (timezone helpers)
- `backup-agent/src/scheduler/state.ts` (persist last-run info: `<BACKUP_ROOT>\logs\scheduler-state.json`)

## Files To Modify

- `backup-agent/src/index.ts` (start scheduler after server is up)
- `backup-agent/src/config.ts` (`BACKUP_SCHEDULE_TIME=21:00`, `BACKUP_TIMEZONE=Africa/Cairo`, `SCHEDULER_ENABLED=true`, `MISSED_RUN_GRACE_MINUTES=180`)

## Design

- Use a tiny dependency (`cron`/`node-cron` with timezone support) **or** a self-written loop using `Intl.DateTimeFormat` with `timeZone: "Africa/Cairo"`. Either way the schedule is expressed as **wall-clock time in Africa/Cairo**, never as a fixed UTC offset.
- ⚠ Egypt observes **DST** (reinstated 2023: UTC+3 in summer, UTC+2 in winter). A fixed `+02:00` would drift one hour. Always compute the next run from the IANA zone.
- DST edge cases: 21:00 is never skipped or repeated by Egypt's transitions (they occur around midnight), but tests must still cover transition weeks.
- Overlap prevention: scheduler calls `createBackup({type:"auto"})`, which uses the shared lock from Task 04. If locked → log `skipped: busy`, retry in 10 minutes up to the grace window, then give up and record `missed`.
- Restart safety: on startup read `scheduler-state.json`; if today's 21:00 run was due while the agent was down and `now` is within `MISSED_RUN_GRACE_MINUTES`, run once (catch-up). Never run twice for the same schedule date (key = `YYYY-MM-DD` in Cairo time).
- Clock safety: if system clock jumps backwards, do not re-trigger an already-recorded date.
- Machine TZ may be set differently — scheduler must not depend on the OS timezone.

## Implementation Tasks

- [ ] Implement `time.ts`: `nowInZone(tz)`, `nextRun(timeHHmm, tz, from)`, `scheduleDateKey(tz, date)`.
- [ ] Implement `state.ts`: atomic read/write (write temp + rename) of `{lastScheduledKey, lastRunAt, lastResult, lastBackupId}`.
- [ ] Implement `scheduler.ts`: timer (re-armed after each tick using `setTimeout` to next computed run, max 1-minute safety re-check to survive clock changes).
- [ ] On trigger: check `SCHEDULER_ENABLED`, check key not already run, call `createBackup`.
- [ ] Handle `BUSY` with bounded retry (10 min interval, within grace window).
- [ ] Startup catch-up logic (see above).
- [ ] Expose `GET /v1/scheduler` data (next run time in ISO + Cairo local, last result) for the dashboard (consumed in Task 09).
- [ ] After each successful automatic backup call retention (Task 13).
- [ ] Log every decision (`scheduled`, `skipped`, `missed`, `caught_up`).
- [ ] Unit tests with a fake clock for: normal run, DST weeks (late March / late October), restart before/after 21:00, restart after grace, overlap with manual backup, clock moved back.

## Security Requirements

- Scheduler has no network trigger; it cannot be invoked remotely except via the authenticated "create backup" API.
- State file writable only by the service account.

## Error Handling

- Backup failure → record `failed`, **do not retry automatically in a tight loop**; one retry after 30 minutes, then wait for next day; raise alert hook (Task 15/16 notifications).
- Invalid time config → refuse to start scheduler with clear log.

## Testing

- Fake-clock unit tests (listed above) and one real-time smoke test with schedule set to "now + 2 min" on a test DB.

## Acceptance Criteria

- [ ] Backup fires at 21:00 Cairo local time in both DST and non-DST periods (verified by tests).
- [ ] Never two concurrent backups; never two automatic backups for the same date.
- [ ] Restart during the day does not cause duplicate or missed runs (within grace).
- [ ] Next-run time exposed via API.

## Depends On

- 03, 04

## Blocks

- 13, 16, 17, 19, 20
