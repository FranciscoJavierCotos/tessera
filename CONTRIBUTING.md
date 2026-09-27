# Contributing

Thanks for your interest in Tessera. The workflow is small and strict: every
change is tracked by an issue, lands through a pull request, and must pass CI.

## Workflow

1. **Issue first.** Every change starts from a GitHub issue. Stories in the
   [roadmap](docs/roadmap.md) (`F03`, `C05`, …) map one-to-one to issues.
2. **Branch** from `main` as `<type>/<issue>-<slug>`, e.g.
   `feat/12-entity-mentions` or `fix/40-invite-expiry`.
3. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/).
4. **Open a PR** against `main`. The description must include `Closes #<issue>`.
   Keep one story per PR.
5. **Merge** once the `ci` check is green. `main` is protected: no direct
   pushes, no force pushes, and **squash merge only**. The PR title becomes the
   commit message on `main`, so write it as a Conventional Commit too.

## Conventional Commits

Format: `<type>(<optional scope>): <summary>`, e.g. `feat(catalog): add owner filter`.

| Type       | Use for                                       |
| ---------- | --------------------------------------------- |
| `feat`     | A new user-facing feature                     |
| `fix`      | A bug fix                                     |
| `docs`     | Documentation only                            |
| `test`     | Adding or fixing tests                        |
| `refactor` | Code change that neither fixes nor adds       |
| `ci`       | CI configuration (GitHub Actions)             |
| `chore`    | Tooling, dependencies, and other housekeeping |
| `style`    | Formatting only, no behavior change           |
| `perf`     | Performance improvement                       |

## Before opening a PR

Run the same checks CI runs:

```bash
pnpm lint && pnpm typecheck && pnpm format:check && pnpm test && pnpm build
```

Also run `pnpm test:e2e` when you change a primary user flow. See the
[architecture spec](docs/specs/architecture.md) for conventions and the
definition of done (tests, RLS tests for new tables, docs, and CHANGELOG).
