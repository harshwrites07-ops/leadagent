# Quelro (repo: leadagent)

AI outreach OS for freelancers selling services to YouTube creators. Stack:
Node.js/Express backend in `backend/src`, React/Vite frontend in
`frontend/src`, PostgreSQL in production (Railway) with SQLite local-dev
parity.

## HARD CONVENTIONS — violating any of these is a failed task

1. DUAL-DB: every query must work on BOTH SQLite and Postgres. The codebase
   uses `USE_PG` from `backend/src/models/database.js` and patterns like
   `${USE_PG ? 'NOW()' : "datetime('now')"}`. Follow existing examples.
2. MIGRATIONS: schema changes are done via `alterTry(\`ALTER TABLE ...\`)`
   calls inside `initializeDatabase()` in `backend/src/models/database.js` —
   idempotent, safe to re-run. New tables use `CREATE TABLE IF NOT EXISTS`.
   There is NO separate migration framework. Do not introduce one.
3. SQL SAFETY: parameterized queries only (`?` placeholders). Never
   interpolate user input into SQL strings.
4. SCHEDULING: recurring jobs use node-cron in
   `backend/src/services/schedulerService.js` (see existing `cron.schedule`
   blocks) or the scraperLoopService self-rescheduling pattern.
5. SERVICES: business logic lives in `backend/src/services/*.js`, HTTP in
   `backend/src/routes/*.js`, auth via `requireAuth`/`requireAdmin` middleware.
6. NO FABRICATED DATA: never hardcode fake metrics, placeholder scores, or
   invented numbers anywhere user-visible. Honest empty states only. This is
   a founding principle of this codebase.
7. LOGGING: use the existing console tag convention: `[ServiceName] message`.
8. Do not modify the Marcus generation pipeline (`claudeService.js`,
   `qualityGate.js`, `codeGate.js`) unless the session explicitly says so.
9. After implementing, run the app locally (`npm run dev` in `backend/`) and
   verify no startup errors before declaring done.
10. Keep diffs surgical. Do not refactor unrelated code, do not reformat
    files, do not upgrade dependencies unless instructed.
11. DESTRUCTIVE SCRIPTS: any script that writes/nulls/flags/deletes data
    MUST be run in `--dry` mode first, output reviewed and explicitly
    approved by the user, before a live run. No exceptions.
