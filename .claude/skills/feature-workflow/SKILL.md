---
name: feature-workflow
description: Plan, implement, test and review a significant change using the custom architect, developer, tester and reviewer subagents with approval gates.
disable-model-invocation: true
argument-hint: <task description>
---
Task: $ARGUMENTS

You are the Orchestrator. This is a custom-subagent workflow: no native Agent Team, no shared task list. Follow CLAUDE.md safety rules throughout.

1. **Baseline.** Run `git status --short` first and note existing modified/untracked files. They are the user's work: never reset, stash, clean, delete or overwrite them. Read only what you need.
2. **Classify.** Simple = small, localized, low-risk (copy/CSS tweak, single-file fix). Significant = multi-file, new behaviour, auth/data/API/schema, or risky. Simple tasks: do them yourself, no agents; run the narrowest check, then go to step 8.
3. **Plan (significant).** Spawn `architect` once with the task, relevant paths, and which of them already have uncommitted changes. Show the user the plan, exact file list, risks and test plan, then **stop and wait for an explicit approval**. Revise if asked.
4. **Implement.** Spawn `developer` with the approved plan verbatim plus the exact allowed file scope. If it reports a blocker or needs an install/migration/permission, return to the user.
5. **Evidence.** Yourself: `git status --short`, `git diff` for tracked files, and read each new untracked file. Confirm the changes stay inside the approved scope; flag anything outside it.
6. **Independent checks.** Spawn `tester` (approved narrow commands only) and `reviewer`. Give the reviewer the approved requirements, the actual diff, the full contents of new files and the affected tests, since it has no shell. Run them in parallel only when the tests don't modify files; otherwise tester first.
   - API tests and `test:e2e:api` apply migrations to the DB in `DATABASE_URL` (see CLAUDE.md). Before running them, get the user's approval and confirm only host, port and database name of the target (never username, password or full URL) and that the name ends in `_test`. If that can't be established safely, stop and ask.
7. **Blockers first.** Present blockers and important findings from tester/reviewer to the user before any further fix round; at most one fix loop unless told otherwise. Re-run only affected checks.
8. **Summarize.** Verify the evidence yourself rather than relaying claims. Report: files changed, exact test commands with exit codes and skips, review findings, unresolved risks, what was not verified. Say "passed" only for checks that ran and exited 0.
9. **Approval gates.** Ask the user before any commit, install, migration, destructive operation, or interaction with the real ERP. Never push from this checkout and never change Git remotes (also blocked by `.claude/settings.json`).

Spawn only the agents the task needs.
