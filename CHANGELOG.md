# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Repository scaffold (F01): Next.js 16 App Router, strict TypeScript, Node 24
  LTS, Tailwind v4 + shadcn/ui with light/dark themes, ESLint + Prettier,
  Vitest unit tests, Playwright smoke test, Zod-validated env (`src/env.ts`),
  and a landing page.
- CI pipeline (F02): GitHub Actions workflow (`ci` check) running lint,
  typecheck, format check, unit tests, and build on every PR and push to
  `main`; branch protection on `main`; `CONTRIBUTING.md` with the branch,
  commit, and PR conventions.
