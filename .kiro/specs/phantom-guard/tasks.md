# Implementation Plan

Tasks run in order. Each cites the acceptance criteria in `requirements.md` it satisfies; `npm run audit:governance` fails if a citation does not exist or a criterion is cited by no task. A task is checked only when its work exists in the repository **and** has been run, not when it merely compiles.

Legend: `[x]` done and verified. `[ ]` not done. `*` after the box marks an optional task that can be skipped for a first release (Kiro convention).

Verification status: the sandbox has no access to the npm registry, so `npm install`, Vite, Tailwind, ESLint, the real Vitest and the real fast-check have **not run**. What was run instead: `tsc` 5.9 under the full strict flag set for the engine, its tests, the CLI and the playground (against stand-in React types); all 57 engine properties against stand-ins for fast-check and Vitest (seeded random, no shrinking); the engine and CLI in Node on Terraform, IAM and Dockerfile inputs; the CVSS equations against 18 published scores; the diff alignment on 5,000 random inputs; and contrast arithmetic. Task 1.4 closes the gap on a networked machine.

## 1. Monorepo foundation

- [x] 1.1 Create the npm workspaces root
  - Root `package.json` with `workspaces: ["packages/*"]`, shared `tsconfig.base.json`, Prettier and EditorConfig, and the scripts listed in `tech.md`.
  - MIT `LICENSE`, and a `.gitignore` that ignores `node_modules`, `dist`, `.env` and build artifacts while keeping `.kiro/` tracked (verified with `git check-ignore` in a scratch repository).
  - _Requirements: 23.1, 23.2_

- [x] 1.2 Add the governance architecture
  - Steering files `product.md`, `tech.md`, `secops-guardrails.md`; hooks `sync-rule-tests` and `pre-commit-audit`; spec files for this feature.
  - `scripts/audit-governance.mjs` and `scripts/audit-secrets.mjs`, wired into `npm run audit:precommit`.
  - _Requirements: 23.3, 23.4, 23.5_

- [ ] 1.3 Configure the MCP servers
  - `.kiro/settings/mcp.json` with a Filesystem server scoped to `./packages` and `./.kiro` and the AWS Documentation server (`uvx awslabs.aws-documentation-mcp-server`). Auto-approve read-only tools only. The write was blocked by a permission rule while this repository was scaffolded, so the file still has to be created.
  - Pin the server versions once the exact releases are confirmed.
  - _Requirements: 23.6_

- [ ] 1.4 Install, lock and run the full pipeline once on a networked machine
  - `npm install`, commit `package-lock.json`, then `npm run audit:precommit`. Fix any version or type error that the stand-ins hid: real `@types/react` attributes, ESLint rule names, Vitest config.
  - Confirm `npm run build:web` writes `packages/web-playground/dist`.
  - _Requirements: 21.5, 22.4_

## 2. Core engine: contracts, scanner, rules

- [x] 2.1 Define the data contracts
  - `HauntedResource`, `DetectionRule`, `ExorcismPatch`, `Finding`, `Diagnostic`, `ScanReport`, `Severity`, in `packages/core-engine/src/contracts/`.
  - _Requirements: 3.1, 4.1, 9.1_

- [x] 2.2 Build the scanner and the rule registry
  - `createRuleRegistry` (id format, category match, duplicate rejection), `scan` (frozen input, error isolation, allow and deny lists, de-duplication, ordering, scoring, resource and duplicate-id limits), `scanText`.
  - _Requirements: 3.2, 4.2, 4.3, 4.4, 4.5, 4.6, 9.2, 9.3, 9.4, 9.5, 9.6, 2.5_

- [x] 2.3 Implement the GR-1 rules
  - `PG-IAM-001` wildcard permissions with severity tiers, one finding per statement, and least-privilege patches from usage evidence or the read-only catalog. `PG-IAM-002` public principal, guidance only.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

- [x] 2.4 Implement the GR-2 rule
  - `PG-NET-001` unrestricted ingress with admin, data-store and other tiers; allows exactly TCP 80 or 443; patch removes the public source or the rule.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 2.5 Implement the GR-3 rule
  - `PG-STO-001` for EBS, RDS and S3, with the accurate S3 wording (S3 already encrypts new objects by default).
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 2.6 Implement the GR-4 rule
  - `PG-CTR-001` for Dockerfile final stages and ECS container definitions, the unresolved-variable diagnostic, and the non-root patch.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 2.7 Implement patch construction, application and redaction
  - `buildPatch` (precondition, redacted preview, unified diff), `applyPatch` (pure, stale-patch guard, idempotent), `redactReport`.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 2.8 Create the mock AWS datasets
  - `haunted-mansion` (every guardrail broken) and `sanctified-sanctuary` (clean), fictional account `123456789012`, frozen on load.
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 2.9 Add engine hardening and its benchmark
  - ESLint `no-restricted-*` rules for the engine, a Vitest benchmark proving a 2,000-resource scan finishes within 1,000 ms, and a regex review against Requirement 12.3.
  - _Requirements: 1.6, 12.1, 12.3, 20.2_

- [ ] 2.10 Confirm the one unverified compliance reference
  - Every other control number was checked against a public listing. The IPv6 security-group control cited as CIS AWS Foundations v3.0.0 5.3 (`CIS_SG_IPV6_ADMIN_PORTS`) was not. Open the CIS v3.0.0 PDF, confirm the number and title, then fix `references.ts` and the table in `secops-guardrails.md` and remove the "UNCONFIRMED" comment.
  - _Requirements: 6.1_


- [x] 2.11 Implement the S3 public-access rule
  - `PG-STO-002`: public canned ACLs, public bucket-policy statements (a `Deny` is never public), and Block Public Access settings that are not all enabled. A missing declaration is rated as a declaration gap, because S3 has enabled Block Public Access for new buckets since April 2023. Datasets updated so the sanctuary stays clean and the mansion shows the rule. Verified by 7 properties and by three deliberate rule mutations (Deny flagged as public, HIGH for a missing declaration, a partial patch), each of which fails the right properties. The CIS control 2.1.4 reference is confirmed against a public listing.
  - _Requirements: 7.6, 7.7, 7.8, 7.9, 7.10_
## 3. Parsers

- [x] 3.1 Format detection and the parse entry point
  - `detectFormat`, `parseConfig` with the 1 MiB limit counted in UTF-8 bytes, declared-format override, and the unknown, unsupported and internal-error diagnostics.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.2_

- [x] 3.2 IAM policy parser
  - Linear JSON syntax checker with exact line and column, depth limit 64, `Statement` normalized to an array, statement line numbers.
  - _Requirements: 2.1, 2.4, 3.4, 3.5, 12.5_

- [x] 3.3 Dockerfile parser
  - Continuations, `# escape=`, heredoc bodies, multi-stage builds with inherited users, unresolved `USER`.
  - _Requirements: 2.3, 8.5_

- [x] 3.4 Terraform (HCL) tokenizer and parser
  - `parsers/hcl.ts`: hand-written, zero-dependency and tolerant. Blocks, attributes, strings with `${}` interpolation (a quote inside an interpolation does not end the string), heredocs, lists, objects, function calls, comments. Unknown expressions become opaque source text. Every problem is a `PG-PARSE-SYNTAX` warning with line and column and parsing continues. Verified: strict-clean, 30,000 fuzz inputs with no throw and identical repeat output, about 1 MiB of hostile input in at most 235 ms.
  - _Requirements: 1.1, 2.1, 2.3, 2.4_

- [x] 3.5 Terraform normalizer
  - `parsers/terraform.ts` maps `aws_iam_policy`, `aws_iam_role_policy`, `aws_iam_role`, `aws_security_group` (inline `ingress` blocks and list form), `aws_security_group_rule`, `aws_vpc_security_group_ingress_rule`, `aws_s3_bucket` with its ACL, policy, Block Public Access and encryption companions, `aws_ebs_volume`, `aws_db_instance` and `aws_ecs_task_definition` to the dataset attribute paths, with block start and end lines. Policies are read from `jsonencode(...)` and JSON heredocs. Unresolved values stay as text with an info Diagnostic; an ingress rule with an unresolved port range is not judged. Verified end to end through `scanText` and the CLI on a sample (6 findings at the right lines). `data "aws_iam_policy_document"` is not analyzed yet and says so. Resource property names were checked against the Terraform provider documentation from memory, not against the registry (no network): confirm them in task 1.4.
  - _Requirements: 2.6, 2.7, 2.8, 2.9, 3.3, 3.4_

- [ ] 3.6 Source writers for patches
  - Render an applied patch back into the original text so the CLI can write files and the Playground can offer a fixed copy: Dockerfile line edit, IAM JSON re-serialization, Terraform attribute edit. Preserve untouched text byte for byte.
  - _Requirements: 15.3, 15.4_

## 4. Property-based verification

- [x] 4.1 Test support and generators
  - `FC_PARAMS` (at least 200 runs, `FC_NUM_RUNS`, `FC_SEED`), shared arbitraries for IAM, network, storage, containers and hostile text. Oracles are written from the requirements, not copied from the rules.
  - _Requirements: 22.3, 22.4_

- [x]* 4.2 Rule property tests
  - One test file per rule, mirroring the rule path, covering soundness, no false positives, determinism, patch fixes and adds nothing, purity, idempotence, and never widens. Each property carries `Feature` and `Validates` tags. 57 properties pass against the stand-in runner; run them under real fast-check in task 1.4.
  - **Property 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 17, 18**
  - _Requirements: 22.1, 22.5, 5.1, 5.6, 6.5, 7.1, 8.1, 11.2, 11.4_

- [x]* 4.3 Engine property tests
  - Parser totality and determinism, scan ordering and summary arithmetic, secret redaction, rule isolation, prototype safety, duplicate ids, dataset honesty.
  - **Property 1, 9, 10, 14, 15, 16**
  - _Requirements: 22.2, 2.4, 9.2, 10.7, 3.5_

- [ ] 4.4 Run the property suite under the real tools and keep it green
  - Replace the stand-in results with a real run; record the seed of any failure and fix the rule, the test or the requirement.
  - _Requirements: 22.1, 22.3_

- [ ]* 4.5 Add the Dockerfile and IAM parser fuzz corpus
  - Seed generators with real-world files; add a differential property that compares the JSON syntax checker with `JSON.parse` (already verified by script on 20,000 mutants).
  - _Requirements: 22.2_

## 5. CLI

- [x] 5.1 Argument parsing and input collection
  - `node:util.parseArgs`, strict mode, files and directories (no symlinks, bounded depth and count), standard input, size limits, per-file errors that do not stop the run.
  - _Requirements: 14.1, 14.2, 14.3, 14.8_

- [x] 5.2 The `scan` command and exit codes
  - `--fail-on` threshold, exit code 2 for unreadable or unanalyzable input taking precedence over 1.
  - _Requirements: 14.4_

- [x] 5.3 Output formats
  - `pretty` (ANSI only on a TTY without `NO_COLOR`), `json` (one document, redacted), `sarif` 2.1.0 (rule per DetectionRule, result per Finding, physical locations, notifications). All verified by running the built CLI.
  - _Requirements: 14.5, 14.6, 14.7_

- [x] 5.4 The `exorcise` dry run
  - Prints each proposed fix as a unified diff, never modifies a file.
  - _Requirements: 15.1_

- [ ] 5.5 The `exorcise --write` mode
  - Applies only patches with `reviewRequired` false unless `--include-review`; atomic write via a temporary file and rename; re-scan afterwards and exit 1 if a targeted finding remains; loop apply-then-rescan so several patches on one resource work. Depends on task 3.6.
  - _Requirements: 15.2, 15.3, 15.4_

- [ ]* 5.6 CLI tests
  - Drive `main()` with a fake `CliIo`: exit codes, SARIF shape against the published schema, `NO_COLOR`, hostile file names, JSON-only stdout.
  - _Requirements: 14.4, 14.5, 14.6, 14.7_

## 6. Web playground

- [x] 6.1 Scaffold the Vite app and the design system
  - Vite, React, Tailwind v4 theme tokens (`neon-red`, `neon-green`, shadows, animations), `bg-slate-950`, focus ring, reduced-motion backstop, system fonts, favicon. Contrast measured and recorded in `product.md`.
  - _Requirements: 19.1, 19.4, 19.5_

- [x] 6.2 Scan worker and client
  - Engine runs in a Web Worker; a scan over 5 seconds terminates the worker and shows a message; a newer request supersedes an older one.
  - _Requirements: 12.4, 20.1_

- [x] 6.3 Dual-mode shell
  - WAI-ARIA tabs with arrow, Home and End keys, Inspector selected first, `#inspector` and `#scanner` fragments, both panels kept mounted to keep state, no network request.
  - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [x] 6.4 Mode 1, Inspect Haunted Cloud
  - Dataset picker, deterministic ghost names, glowing red and green resource cards, finding detail with compliance references and diff, confirmation for review-required patches, in-memory exorcism with rescan, reset, Haunting level meter.
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8_

- [x] 6.5 Mode 2, Scan Custom Config
  - Text area, file picker and drag-and-drop with the size refusal before reading, format selector, samples, Ctrl or Cmd+Enter, source excerpts with line numbers, diagnostics, Copy the diff, empty state, and a clear "not analyzed" message. Pasted text is never written to storage, and the app source contains no `fetch`, XHR, WebSocket or beacon call (checked by script); the CSP blocks any other origin.
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 12.2_

- [x] 6.6 Accessible severity and diff presentation
  - Every severity is an icon, a label and a color; diff rows keep body text at slate-200 and put color in the border and sigil; no color-only signals.
  - _Requirements: 19.2, 19.3, 19.6, 19.7_


- [x] 6.12 Costume upgrade: drawer, dashboard, CVSS estimate, split diff, glass
  - Resource cards open a drawer built on the native modal `<dialog>` (focus trap, Escape, focus return) with the resource's highest estimated CVSS score, each poltergeist with a plain-language risk explanation, and its exorcism. A dashboard shows zombie resources, poltergeists, worst CVSS, exorcisms done and a bar per severity. `lib/cvss.ts` applies the CVSS v3.1 equations to a vector chosen per rule and tier; it reproduces 18 published scores and is labeled an estimate. The diff is side by side, aligned line by line (checked on 5,000 random inputs), with copy actions for the hardened text and the unified diff. Panels are translucent glass; contrast was computed on the brightest backdrop (neon red 4.64:1, everything else above 6:1). Mode 2 gained a Terraform sample, a visible scan time, a pre-started worker, and a "nothing to judge" message. Typechecked under the strict flags against stand-in React types. Not yet seen in a browser: see task 6.7.
  - _Requirements: 17.9, 17.10, 17.11, 18.8, 18.9, 18.10, 19.3, 19.9_
- [ ] 6.7 Run the app in a real browser and fix what it shows
  - `npm run dev`, then check both modes with the keyboard (including the drawer: Tab stays inside it, Escape closes it, focus returns to the card), a screen reader pass, 360 px width (no horizontal scroll), reduced motion, and that the network panel shows no request at all while pasting and scanning. Take screenshots for the submission.
  - _Requirements: 19.8, 16.4, 19.4, 12.2, 17.9_

- [ ]* 6.8 Component tests
  - Testing Library: tab keyboard behavior, exorcism flips a card from red to green and lowers the meter, review confirmation, oversize file refusal, disabled scan when empty.
  - _Requirements: 17.5, 17.6, 18.6, 18.7_

- [ ]* 6.9 Self-hosted display font and polish
  - Bundle a display font with the app (no CDN), tune the haze and flicker, add a share-friendly Open Graph image served from the same origin.
  - _Requirements: 19.2_

- [ ]* 6.10 Playwright smoke test
  - Against `vite preview`: both modes load, a sample scans, an exorcism applies, and no cross-origin request happens.
  - _Requirements: 16.4, 20.4_

- [ ] 6.11 Measure and enforce the bundle budget
  - Build, gzip the first-load JavaScript, and fail the build above 250 KiB. Record Largest Contentful Paint on a simulated Fast 4G profile.
  - _Requirements: 20.3, 20.4_

## 7. Deployment

- [x] 7.1 Netlify configuration
  - `netlify.toml`: build command, publish directory, Node 22, SPA fallback, Content-Security-Policy with `connect-src 'self'`, security headers, cache headers.
  - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [ ] 7.2 First deploy and header check
  - Connect the repository to Netlify with no manual settings, confirm the deploy uses `netlify.toml`, then verify the live response headers and the SPA fallback.
  - _Requirements: 21.1, 21.3, 21.4_

## 8. Hackathon readiness

- [x] 8.1 Root README for judges
  - What it is, a 30-second tour, how to run, how Kiro was used (specs, steering, hooks, MCP, property tests), the guardrails, honest limits (Terraform parser status, what is fictional, the pending first real test run), license. Add screenshots after task 6.7.
  - _Requirements: 23.2_

- [ ] 8.2 Run the governance audit and the pre-commit audit green
  - `npm run audit:governance` and `npm run audit:precommit`; commit everything including `.kiro/`.
  - _Requirements: 23.1, 23.5_
