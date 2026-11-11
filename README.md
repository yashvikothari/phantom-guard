# PhantomGuard

**Finds the ghosts in your cloud configuration, then exorcises them.**

PhantomGuard is a static security analyzer for infrastructure code. It reads Terraform, IAM policies and Dockerfiles, explains each problem against the CIS benchmarks, and proposes the smallest safe fix. It is wrapped in a haunted web playground for the **Kiroween 2026 Costume Contest**: the costume is a haunted house, and underneath it is a deterministic security tool.

- **Nothing leaves your machine.** Analysis runs in your browser or in local Node. No upload, no telemetry, no third-party script.
- **Same input, same output.** A scan is a pure function: findings, order, score and patches are reproducible.
- **A fix never makes things worse.** Patches only narrow access or enable hardening, and anything that can change runtime behavior asks for review first.

## Try it

| Surface | What it does |
| --- | --- |
| **Mode 1, Inspect Haunted Cloud** | A dashboard of fictional AWS accounts. Zombie resources glow red and sanctified ones green. Open any resource for a drawer with its estimated CVSS score, why it is risky, and a side-by-side exorcism you can apply or copy. |
| **Mode 2, Scan Custom Config** | Paste or drop Terraform, an IAM policy or a Dockerfile. See the offending lines, the rule, the benchmark control, the diff of the fix and how long the scan took. |
| **CLI** | `phantomguard scan <path>` for terminals and CI, with `pretty`, `json` and `sarif` output and exit codes that gate a build. |

```bash
npm install
npm run dev                      # the playground at http://localhost:5173

npm run build
node packages/cli-toolkit/dist/cli.js scan ./infra --fail-on high
node packages/cli-toolkit/dist/cli.js scan policy.json -o sarif > results.sarif
node packages/cli-toolkit/dist/cli.js exorcise Dockerfile     # prints the fix; never edits files
```

Requires Node.js 20.19 or newer. Netlify builds with Node 22.

## What it catches

Four non-negotiable guardrails, each with a rule, a severity scale, verified compliance references and, where one is safe, a patch. Details are in [`.kiro/steering/secops-guardrails.md`](.kiro/steering/secops-guardrails.md).

| | Rule | Finds |
| --- | --- | --- |
| GR-1 | `PG-IAM-001`, `PG-IAM-002` | Wildcard permissions (`*`, `s3:*`, `s3:Get*`, `NotAction`) and Allow statements for any principal |
| GR-2 | `PG-NET-001` | Ingress from `0.0.0.0/0` or `::/0`, rated by the port: SSH and RDP are critical, data-store ports high |
| GR-3 | `PG-STO-001` | EBS and RDS without encryption at rest; S3 without a declared configuration |
| GR-3 | `PG-STO-002` | S3 buckets with a public ACL or policy, or without all four Block Public Access settings |
| GR-4 | `PG-CTR-001` | Containers that run as root or privileged (Dockerfile final stage, ECS task definitions) |

IAM fixes follow a strict least-privilege format: explicit, sorted actions drawn from observed usage or a read-only catalog, never wider than the original grant, and always flagged for review.

## Honest limits

- **Terraform support is a subset.** Ten resource types are read (IAM policies and roles, security groups and their rule resources, S3 buckets with their companion resources, EBS volumes, RDS instances, ECS task definitions). Values that depend on variables or references are kept as text and reported as unresolved. `data "aws_iam_policy_document"` blocks, modules and `dynamic` blocks are not analyzed yet, and the parser says so.
- **CVSS scores are estimates.** CVSS rates software vulnerabilities, so PhantomGuard picks a vector per rule and severity tier and applies the CVSS v3.1 equations (checked against 18 published scores). The playground says so wherever a score appears.
- **All data in the Inspector is fictional, and it is AWS and IAM data.** Terraform is scanned in Mode 2.
- **The playground has not been seen in a browser yet.** It typechecks and its logic is tested, but there was no network to install Vite, so layout, the drawer and animation are unconfirmed (task 6.7). The account id is the AWS documentation example `123456789012`.
- **Patches are previews.** The CLI prints diffs; writing fixes back to files (`exorcise --write`) is task 5.5.
- **First real test run is still pending.** The property tests were written and executed in an offline environment against a stand-in for fast-check and Vitest, and the web app was type-checked but not built there. Run `npm install && npm run audit:precommit` once (tasks 1.4 and 4.4), then delete this bullet.
- **CIS control numbers change between benchmark versions.** Every reference pins its version. GR-4 maps to the CIS _Docker_ Benchmark, not the AWS Foundations benchmark.

## How Kiro shaped this

The whole project is driven from [`.kiro/`](.kiro/):

| Kiro feature | Used for |
| --- | --- |
| **Spec** ([`requirements.md`](.kiro/specs/phantom-guard/requirements.md), [`design.md`](.kiro/specs/phantom-guard/design.md), [`tasks.md`](.kiro/specs/phantom-guard/tasks.md)) | 151 acceptance criteria in EARS syntax, an architecture with 19 correctness properties, and a task plan where every task cites the criteria it satisfies. `npm run audit:governance` fails if a task cites a missing criterion or a criterion has no task. |
| **Steering** ([`product.md`](.kiro/steering/product.md), [`tech.md`](.kiro/steering/tech.md), [`secops-guardrails.md`](.kiro/steering/secops-guardrails.md)) | The costume rules (with measured contrast ratios), the engineering standards, and the security guardrails that every change must respect. |
| **Hooks** ([`.kiro/hooks/`](.kiro/hooks)) | `sync-rule-tests` asks the agent to keep a fast-check property test next to every rule. `pre-commit-audit` blocks `git commit` until the audit passes. |
| **MCP** ([`.kiro/settings/mcp.json`](.kiro/settings/mcp.json)) | A scoped filesystem server and the AWS documentation server, so IAM and Terraform syntax is looked up, not guessed. |
| **Property-based testing** | 57 property tests over rules, patches, parsers and the scanner, each tagged with the design property and the requirement criteria it validates. |

## Repository layout

```text
.kiro/                    specs, steering, hooks, MCP settings
packages/core-engine      pure TypeScript analysis library (no DOM, no Node API, no dependency)
packages/cli-toolkit      the `phantomguard` command
packages/web-playground   Vite + React + Tailwind v4 single-page app
scripts/                  governance and secrets audits
netlify.toml              zero-configuration deploy
```

## Deploy

Connect the repository to Netlify and accept the defaults: everything is in [`netlify.toml`](netlify.toml). The site is static, needs no environment variable, and sends a Content-Security-Policy that forbids every outbound origin.

## License

[MIT](LICENSE)

## Exploring Phantom-Guard
NO CREDENTIALS NEEDED. No login, no API keys, no environment variables.
The app runs entirely in the browser; nothing you paste is uploaded.

LIVE APP:  https://phantom-guard-yashvi.netlify.app/
CODE:      https://github.com/yashvikothari/phantom-guard

QUICK TEST (about 3 minutes)

Mode 1, "Inspect Haunted Cloud" (opens by default)
1. The dashboard summarizes a fictional AWS account (the Haunted Mansion).
2. Click the IAM role "phantom-admin". A drawer opens with its estimated
   CVSS score, a plain-language risk explanation, and a side-by-side diff:
   vulnerable on the left, hardened on the right.
3. Click "Perform exorcism", then "Confirm exorcism". The card turns green,
   the poltergeist count drops, and "Exorcisms done" goes to 1.
   Use "Reset the account" to start over.

Mode 2, "Scan Custom Config"
4. Click the "Dockerfile" sample, then "Scan" (or Ctrl/Cmd+Enter).
   Expected: 1 HIGH finding, PG-CTR-001 (container runs as root), at line 8,
   with a Vulnerable/Hardened diff and a "Copy hardened version" button.
5. Click the "Terraform" sample, then "Scan".
   Expected: 6 findings (2 critical, 2 high, 2 medium), each with its
   source line: public S3 ACL, SSH open to 0.0.0.0/0, unencrypted EBS
   volume, wildcard S3 permissions, and two S3 settings.
6. Paste your own Terraform, Dockerfile or IAM JSON policy, or drop a
   file (limit 1 MiB). The scan time is shown on the page.

THINGS TO KNOW
- The Inspector data is fictional (AWS example account 123456789012).
- CVSS scores are estimates computed with the CVSS v3.1 equations from a
  vector PhantomGuard assigns per rule and severity. They are not NVD ratings.
- Terraform support covers 10 resource types. Values that depend on variables
  or references are reported as unresolved, not guessed.
- Mode 1 applies fixes in memory. Mode 2 only shows and copies them.
  Nothing writes to any cloud account.

KIRO FILES: the .kiro/ folder has the spec (requirements, design, tasks),
steering files, and the sync-rule-tests hook.

RUN LOCALLY (Node 20.19 or newer)
  npm install
  npm run dev          # playground at http://localhost:5173
  npm run build
  node packages/cli-toolkit/dist/cli.js scan <file>

