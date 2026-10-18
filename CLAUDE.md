# Pratyangi Fashions

You (the main Claude session) are the **Orchestrator**. Subagents (`architect`, `developer`, `tester`, `reviewer` in `.claude/agents/`) are custom subagents, not a native Agent Team. Spawn them only when a task needs them; simple changes you do directly. For significant work, run `/feature-workflow`.

## Stack (pnpm workspace, `apps/*`)
- `apps/web` — Next.js 16 (App Router), React 19, TypeScript, CSS modules, framer-motion, lenis. Tests: Playwright e2e.
- `apps/api` — Express 5 + TypeScript, Prisma 6 + MySQL, zod, pino. Tests: Vitest + supertest.
- Use **pnpm** only (npm/yarn are blocked by preinstall).

## Commands (run from repo root)
- `pnpm typecheck` / `pnpm api:typecheck`
- `pnpm api:test` — Vitest. Its global setup loads `apps/api/.env.test` and **runs `prisma migrate deploy`** on that `DATABASE_URL`; it refuses unless the DB name ends in `_test`. Never run without user approval.
- `pnpm test` — web demo e2e: builds with `NEXT_PUBLIC_AUTH_DEMO=true`, then Playwright on :3100 (desktop + mobile), slow. A `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` can leak into this build and break demo tests.
- `pnpm --filter pratyangi-web run test:e2e:real-mode` — builds with `NEXT_PUBLIC_API_URL=http://localhost:4001`, API faked in-browser; no DB; web on :3101.
- `pnpm --filter pratyangi-web run test:e2e:api` — real API (starts it on :4001) + real MySQL, web on :3100. `DATABASE_URL` must be set in the shell to a `_test` DB with migrations applied; the API does not use `.env.test` here. Needs approval like `api:test`.
- Before any DB-touching run, confirm only host, port and DB name (never user, password or full URL). If isolation can't be confirmed, stop and ask.
- Prefer the narrowest check that covers the change; avoid repeated full suites.
- `.claude/settings.json` denies/asks on risky commands. It is a guardrail, not a sandbox: `sh -c`, scripts and wrappers can bypass Bash rules, so these rules are a second layer after the instructions here.

## Next.js rule (from `apps/web/AGENTS.md`, preserved)
This is NOT the Next.js you know: APIs, conventions and file structure may differ from training data. Before writing web code, read the relevant guide in `apps/web/node_modules/next/dist/docs/` (the `next` package may not resolve from the repo root) and heed deprecation notices. `apps/web/AGENTS.md` is auto-maintained by `next dev`; leave it as is.

## Safety rules
- Never push to the original Pratyangi repository; never add/change/remove Git remotes (current `origin` is `NinjaStudios/pratyangi-fashions-web`).
- Never read or print `.env*` contents (`apps/api/.env`, `.env.test`). `.env.example` files are fine.
- Preserve uncommitted local work: no `git reset`, `checkout --`, `clean`, or `stash drop`; don't overwrite files you didn't need to change. Check `git status` first.
- Never connect to or modify the real ERP (mock/adapter only).
- Ask the user before: commits, pushes, installs, migrations, destructive actions, anything touching the real ERP.
- Never claim tests passed unless they ran and exited 0; report exact command, exit code, and skipped tests.
- Keep this file short; workflow detail lives in the `feature-workflow` skill.
