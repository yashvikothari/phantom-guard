---
inclusion: always
---

# PhantomGuard: technical steering

## Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript 5.9, ESM only | `strict` plus extra flags; see below. Move to 6.x as a deliberate upgrade task. |
| Runtime | Node.js 22 (`engines`: `>=20.19.0`) | Netlify builds with 22. |
| Monorepo | npm workspaces, `packages/*` | Yarn resolves the same workspaces; root scripts call `npm`. |
| Web app | Vite 7 + React 19 + Tailwind CSS 4 | Static SPA. |
| Tests | Vitest 3 + fast-check 4 | Property-based first. |
| Lint and format | ESLint 9 flat config + typescript-eslint, Prettier 3 | `--max-warnings=0`. |

Major versions are chosen conservatively on purpose. Newer majors exist (Vite 8, Vitest 5, TypeScript 6, ESLint 10); moving to them is an upgrade task with its own review, not a drive-by change.

## Repository layout

```text
.kiro/            specs, steering, hooks, settings
packages/core-engine     pure analysis library (no DOM, no Node API, no runtime dependency)
packages/cli-toolkit     `phantomguard` command (Node only)
packages/web-playground  Vite SPA
scripts/                 governance and secrets audits (Node built-ins only)
```

Dependencies point one way: `cli-toolkit` and `web-playground` depend on `core-engine`. Never the reverse.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server for the Playground |
| `npm run build` | Build engine, CLI and Playground in order |
| `npm run build:web` | Build only the site (what Netlify runs) |
| `npm run typecheck` | Build the engine, then type-check every package |
| `npm run lint` / `npm run format:check` | ESLint and Prettier, zero warnings |
| `npm test` | All tests |
| `npm run audit:governance` | Governance files, hooks, and requirement-to-task traceability |
| `npm run audit:precommit` | Everything above plus the secrets audit; run by the `pre-commit-audit` hook |

## TypeScript standards

Shared compiler flags live in `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `useUnknownInCatchVariables`, `isolatedModules`, `verbatimModuleSyntax`. Do not weaken them in a package.

- No `any`. Use `unknown` and narrow. No `@ts-ignore`; `@ts-expect-error` needs a comment that says why.
- No non-null assertions (`!`). Narrow or handle `undefined`.
- Use `import type` for types. Relative imports in `core-engine` and `cli-toolkit` end in `.js` (NodeNext).
- Named exports only. No default exports (the one exception is a tool config file such as `vite.config.ts` or `vitest.config.ts`, which the tool requires), no enums (use string-literal unions), no namespaces.
- Prefer `readonly` data and `readonly` arrays in contracts. Never mutate an argument.
- Exported functions declare their return type.
- Model variants as discriminated unions and switch exhaustively.
- Expected failures are values (`{ ok: false, error }`, Diagnostics). `throw` only for programmer errors, such as a duplicate rule id.

### `core-engine` is a pure library

Forbidden in `packages/core-engine/src`: DOM and Node APIs, `fetch` and sockets, `eval`, `new Function`, dynamic `import()` of derived paths, `Date.now`/`new Date`, `Math.random`, and reading `process.env`. This is how Requirements 9.6 and 12.1 stay true. Enforcement: the build config sets `"types": []` and `"lib": ["ES2022"]`, and ESLint `no-restricted-globals`/`no-restricted-imports` cover the rest.

- Regular expressions on user text must be linear. Prefer a scanning loop. No nested quantifiers; no `(a+)+`, `(a|a)*`, `.*.*`.
- Every loop is bounded by input size. Respect `MAX_INPUT_BYTES` (1 MiB), `MAX_JSON_DEPTH` (64) and `MAX_RESOURCES` (5,000).
- Build objects from untrusted keys with `Object.fromEntries` or own-property reads (`Object.prototype.hasOwnProperty`), never by assigning to `obj[key]` on a plain object.

## Vite or Next.js

**Vite is the build tool of record** for `web-playground`. The product is a client-side app with no server work, and Vite's output is plain static files that deploy to Netlify with no adapter and no runtime.

Next.js is acceptable only if all of these hold, and a migration needs a written reason:

- `output: 'export'` (static export). No API routes, middleware, server actions, ISR or image optimizer.
- The deployed headers still come from `netlify.toml`, and the CSP still forbids outbound origins.
- `core-engine` is imported unchanged, and scanning still runs in the browser.

## Tailwind CSS standards

Tailwind v4, configured in CSS (`src/index.css`) with `@import "tailwindcss"` and an `@theme` block. There is no `tailwind.config.js`.

- Design tokens are theme variables: `--color-neon-red`, `--color-neon-green`, `--shadow-neon-red`, `--shadow-neon-green`, `--animate-flicker`. Use utilities (`text-neon-red`, `shadow-neon-green`), not raw hex values in components.
- The page background is `bg-slate-950`. Panels are `bg-slate-900` with `border-slate-800`.
- Follow the contrast table in `product.md`. In particular: no `text-slate-500` or darker on dark surfaces, and no `neon-red` body text on `slate-800` or on tints above 10%.
- Animations use `motion-safe:` variants. A `@media (prefers-reduced-motion: reduce)` block in `index.css` is the backstop.
- Mobile first. Verify 360 px width.
- Do not build class names dynamically (`text-${color}`). Tailwind cannot see them. Map a value to a complete class string.
- Keep `@apply` to small, repeated primitives. Prefer composing utilities in the component.

## React standards

- Function components and hooks only. Follow the hooks lint rules.
- Props are `readonly` interfaces. Keep state as low in the tree as it can be.
- Never render user text as HTML. `dangerouslySetInnerHTML` is banned by ESLint. User configuration is shown as text content only.
- Scan results are derived data: compute them from inputs with `useMemo`, do not mirror them into state.
- Interactive elements are real `button`, `a`, `input`. Tabs implement the WAI-ARIA tabs pattern.

## Testing standards (fast-check)

- Property-based tests are the default for anything with logic. Example tests are for datasets, SARIF and CLI output, and UI rendering.
- Each property carries two comments: `Feature: phantom-guard, Property N: <name>` and `Validates: Requirements X.Y`. `N` is the property number in `design.md`; `X.Y` are real criteria from `requirements.md`.
- Use `FC_PARAMS` from `test/support/fc.ts` for every `fc.assert`. It sets at least 200 runs, honors `FC_NUM_RUNS`, and replays a failure with `FC_SEED=<seed>`.
- **The oracle must not copy the implementation.** Compute the expected result from the generator's own model, written from the requirement text. A test that reuses the rule's code to decide the answer proves nothing.
- Generators live in `test/arbitraries/` and are shared. Extend them; do not duplicate them. Include look-alike values (`"true"` for `true`, `aes256` for `AES256`) and hostile fragments (control characters, `__proto__`, deep nesting).
- Rule tests mirror the rule path: `src/rules/iam/wildcard-permissions.ts` has `test/rules/iam/wildcard-permissions.property.test.ts`. The `sync-rule-tests` hook keeps them in step.
- Patch properties to cover for every rule: it fixes its own Finding, adds none, is idempotent, does not mutate its input, and never widens access.
- When a property fails, decide whether the rule, the test or the requirement is wrong. Do not weaken a rule or loosen a property to get green.
- Do not assert on random data with snapshots.

## Dependencies

- `core-engine` has zero runtime dependencies. Adding one needs a written justification, and it must run in a browser and in Node.
- Dev tooling lives in the root `package.json`; each package lists only what it uses.
- Commit `package-lock.json`. Run `npm audit` before a release. Pin MCP servers to a version when you can.

## Git and Kiro automation

- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Never commit `.env` files or credentials; the secrets audit blocks them.
- Hooks in `.kiro/hooks/`:
  - `sync-rule-tests`: when a file under `packages/core-engine/src/rules/` is saved, the agent creates or updates its property test.
  - `pre-commit-audit`: before an agent runs `git commit`, `npm run audit:precommit` must pass, and the commit is blocked otherwise.
- MCP servers in `.kiro/settings/mcp.json`: a **filesystem** server limited to `./packages` and `./.kiro`, and an **AWS documentation** server. Use the documentation server to check IAM action names, Terraform and CloudFormation property names, and service defaults before writing a rule or a patch. Do not guess AWS syntax.
- `.kiro/` is always committed. The `.gitignore` re-includes it last so no earlier pattern can hide it.
