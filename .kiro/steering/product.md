---
inclusion: always
---

# PhantomGuard: product steering

## Vision

PhantomGuard finds dangerous cloud configuration before it ships and proposes the smallest safe fix. It reads Terraform, Dockerfiles and IAM policies, explains each problem against the CIS benchmarks, and offers an _exorcism_: a previewable patch that removes the problem without widening anything.

It is entered in the Kiroween 2026 Costume Contest. The costume is a haunted house. The wearer is a serious, deterministic security tool. When the two conflict, the tool wins.

Three promises hold in every surface:

1. **Nothing leaves your machine.** Analysis runs in the browser or in local Node. No upload, no telemetry, no third-party script.
2. **Same input, same output.** A scan is a pure function. Findings, order, scores and patches are reproducible.
3. **A fix never makes things worse.** Patches only narrow access and enable hardening. Anything that can change runtime behavior says so and asks first.

## Users and jobs

| User | Job | Surface |
| --- | --- | --- |
| Judge or first-time visitor | Understand the product in 30 seconds | Mode 1, Inspect Haunted Cloud |
| Developer with a config in hand | Paste it, see what is wrong, copy the fix | Mode 2, Scan Custom Config |
| Pipeline owner | Fail a build on bad configuration | CLI (`phantomguard scan`) |

## Surfaces

- **Mode 1, Inspect Haunted Cloud.** A dashboard summarizes the account; clicking any resource opens a drawer with its estimated CVSS score, why it is risky, and the exorcism. Pre-loaded fictional AWS accounts (`haunted-mansion`, `sanctified-sanctuary`). Resource cards glow red or green. One click performs an exorcism and the card turns green.
- **Mode 2, Scan Custom Config.** Paste or load Terraform, Dockerfile or IAM policy text. Findings show the offending lines and the diff of the fix.
- **CLI.** `scan` and `exorcise`, with `pretty`, `json` and `sarif` output and meaningful exit codes.

## Costume Contest UX guidelines

### Color is meaning

| Meaning | Token | Value | Use |
| --- | --- | --- | --- |
| Vulnerability | `neon-red` | `#ff2d55` | Findings, CRITICAL and HIGH, haunted resources, Haunting level above 0 |
| Safe | `neon-green` | `#39ff88` | Clean resources, applied patches, Haunting level 0, "no findings" |
| Medium | `amber-300` | Tailwind | MEDIUM findings |
| Low | `sky-300` | Tailwind | LOW findings |
| Info | `slate-400` | Tailwind | INFO, secondary text |
| Page | `bg-slate-950` | Tailwind | Page background. Required. |
| Panel | `glass-panel`: slate-900 at 62% with a white 10% hairline and a 12 px blur | `index.css` | Cards, dashboard tiles, the drawer, result lists. Plain `bg-slate-900` with `border-slate-800` remains valid. |
| Body text | `text-slate-200` | Tailwind | Default text on dark surfaces |

Red always means "this is a problem". Green always means "this is safe now". Never use green for a warning or red for decoration. A control that applies a patch is green; a control that discards or resets is neutral slate.

### Contrast rules (measured, WCAG 2.x)

Ratios were computed from the token values above. Re-measure if a token changes.

| Foreground | on `slate-950` | on `slate-900` | on `slate-800` | Verdict |
| --- | --- | --- | --- | --- |
| `neon-red` | 5.53 | 4.90 | 4.01 | Text on 950 and 900 only. On 800 use it for large text, icons and borders (3:1), never body text. |
| `neon-green` | 15.21 | 13.46 | 11.03 | Passes everywhere. |
| `amber-300` | 13.99 | 12.38 | 10.15 | Passes. |
| `sky-300` | 12.10 | 10.71 | 8.77 | Passes. |
| `slate-200` | 16.36 | 14.48 | 11.87 | Default body text. |
| `slate-400` | 7.87 | 6.96 | 5.71 | Secondary text. |
| `slate-500` | 4.24 | 3.75 | 3.07 | **Forbidden for text on dark surfaces.** |

#### Glass panels (measured)

`glass-panel` is slate-900 at 62% over the page. The brightest backdrop a panel can sit on is the page plus the violet haze (14%) plus the drifting fog (7%). Contrast was computed with the WCAG formula on that worst case: `slate-200` 13.73, `slate-300` 11.40, `slate-400` 6.60, `neon-green` 12.76, `amber-300` 11.74, `sky-300` 10.15, `violet-300` 9.17, and `neon-red` 4.64 (still above 4.5). Red-tinted diff rows keep `slate-200` text at 12.69. If the haze or fog gets brighter, or the panel more transparent, re-measure.

Tinted surfaces: `neon-red` text on `neon-red/10` over `slate-900` measures 4.55 (barely passes) and 4.33 at `/15` (fails). So on any red-tinted row, keep code and prose in `text-slate-200` (13.5) and put the color in the border, the icon and the `-` or `+` sigil.

### Look and feel

- Glow is a `box-shadow` or `text-shadow` using the token color, subtle at rest and stronger on hover and focus. Flicker, slow pulse and drifting fog are allowed on the header, the Haunting level meter and haunted cards only.
- Every animation sits behind `motion-safe:`. Under `prefers-reduced-motion: reduce` all of them stop and the static glow remains.
- Typography is system fonts only: `font-mono` for code, Resource ids and diffs; a system sans for prose. A self-hosted display font is allowed later if it ships in the bundle (no CDN).
- Layout works at 360 px width without horizontal page scroll.

### Spooky lexicon (interface copy only)

The costume lives in the Playground. CLI output, JSON, SARIF, logs, error codes and API names use the technical term.

| Playground copy | Technical term |
| --- | --- |
| poltergeist | Finding |
| zombie resource | resource with at least one Finding |
| exorcism, exorcise | apply an ExorcismPatch |
| ward | DetectionRule (each rule has a `ward` name) |
| Haunting level | `summary.riskScore` (Risk_Score, 0 to 100) |
| CVSS ~7.5 | estimated CVSS v3.1 base score; always labeled an estimate |
| sanctified | resource with no Findings |
| seance (the scan action) | run a scan |

Keep copy short and a little dry. Never let a pun hide a fact: a Finding card must still state the rule id, the severity and the problem in plain words.

### Accessibility is part of the costume

- Severity is never color alone: color plus an icon plus a text label (`CRITICAL`, `HIGH`, ...).
- Full keyboard operation, visible focus rings, ARIA roles for the tab list, result lists and live scan results (`aria-live="polite"`).
- Reduced motion respected. No content appears only on hover.

## Frictionless Netlify deployment rules

Goal: connect the repository to Netlify, accept the defaults, get a working site. Zero manual settings.

1. **`netlify.toml` is the only configuration.** Build command `npm run build:web`, publish directory `packages/web-playground/dist`, Node version 22. Do not set these in the Netlify UI.
2. **Static output only.** No Netlify Functions, Edge Functions, Forms, Identity or Large Media. No server runtime.
3. **No environment variables.** The build and the app need none. If a change seems to need one, the design is wrong.
4. **No outbound requests after load.** The Content-Security-Policy in `netlify.toml` is `default-src 'self'` with `connect-src 'self'`. No CDN fonts, analytics, tag managers or remote images. Self-host anything the page needs.
5. **SPA fallback** is the `/* -> /index.html` 200 rule. Hashed files under `/assets/` are cached immutably; `index.html` always revalidates.
6. **Security headers** (CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS, COOP) stay in `netlify.toml`. Loosening one needs a written reason in the pull request.
7. **Deploy previews are the review surface.** Every pull request must have a green deploy preview before merge.
8. **Lockfile.** Commit `package-lock.json` so Netlify builds the dependency versions that were tested.

Pre-release check: `npm run build:web` succeeds on a clean checkout, `npm run audit:governance` passes, the preview loads with the browser network panel showing only same-origin requests.

## Out of scope

Live AWS account access, credential handling, user accounts, saved scans on a server, and any feature that needs a backend.
