---
inclusion: always
---

# PhantomGuard: SecOps guardrails

These rules are non-negotiable. They define what PhantomGuard detects, how it fixes it, and how it protects the data it reads. A change that weakens a guardrail needs a written reason in the pull request and an updated requirement, not just a passing test.

Rule contracts: #[[file:packages/core-engine/src/contracts/detection-rule.ts]]
Patch contract: #[[file:packages/core-engine/src/contracts/exorcism-patch.ts]]

## The four guardrails

| ID | Rule | Detects | Severity |
| --- | --- | --- | --- |
| GR-1 | `PG-IAM-001` | Wildcard permissions | CRITICAL `*` or `*:*`; HIGH `svc:*` on Resource `*` or `NotAction`; MEDIUM `svc:*` on scoped Resources; LOW partial such as `s3:Get*` |
| GR-1 | `PG-IAM-002` | Allow with Principal `*` | CRITICAL without a Condition; MEDIUM with a Condition |
| GR-2 | `PG-NET-001` | Ingress from `0.0.0.0/0` or `::/0` | CRITICAL ports 22 or 3389 in range, or all protocols; HIGH data-store ports; MEDIUM any other port. TCP 80 and 443 alone are allowed. |
| GR-3 | `PG-STO-001` | Storage without declared encryption at rest | HIGH EBS and RDS; MEDIUM S3 |
| GR-3 | `PG-STO-002` | S3 buckets the public can reach | CRITICAL public ACL or public Allow policy; HIGH `authenticated-read`; MEDIUM when neutralized by Block Public Access, behind a Condition, or when Block Public Access is not fully enabled |
| GR-4 | `PG-CTR-001` | Container runs as root | CRITICAL privileged; HIGH no `USER`, or `root` / `0` |

### Compliance references

Every rule carries references that pin a benchmark **and its version**, because control numbers change between versions. Verify against the published benchmark when bumping a version. Every number below was checked against a public listing **except one**: the IPv6 security-group control as 5.3 in v3.0.0 (listed with 5.2) is from memory. Other versions number these controls differently, so confirm it against the CIS v3.0.0 PDF (tasks.md, task 2.10).

| Reference | Used by |
| --- | --- |
| CIS AWS Foundations v3.0.0, 1.16: no IAM policies with full `*:*` administrative privileges | `PG-IAM-001` when Action `*` meets Resource `*` |
| AWS IAM best practice: apply least-privilege permissions | `PG-IAM-001`, `PG-IAM-002` |
| CIS AWS Foundations v3.0.0, 5.2 (IPv4) and 5.3 (IPv6): no security group ingress from the internet to remote administration ports | `PG-NET-001` when the finding is CRITICAL |
| AWS Foundational Security Best Practices EC2.18: only authorized ports open to the internet | `PG-NET-001` |
| CIS AWS Foundations v3.0.0, 2.2.1: EBS encryption | `PG-STO-001` (EBS) |
| CIS AWS Foundations v3.0.0, 2.3.1: RDS encryption at rest | `PG-STO-001` (RDS) |
| CIS AWS Foundations v1.4.0, 2.1.1: S3 encryption at rest (removed in later versions) | `PG-STO-001` (S3), with the S3 User Guide note below |
| CIS AWS Foundations v3.0.0, 2.1.4: S3 buckets configured with Block public access (bucket settings) | `PG-STO-002` (the Block Public Access finding only) |
| Amazon S3 User Guide, Blocking public access | `PG-STO-002` (all findings) |
| CIS Docker Benchmark v1.7.0, 4.1: a user for the container has been created | `PG-CTR-001` |

Do not cite a control for a case it does not cover. A MEDIUM finding on public TCP 8080 does not cite the administration-port controls; a service-wide `s3:*` does not cite CIS 1.16, which is about `*:*`. GR-4 maps to the **CIS Docker Benchmark**, not the AWS Foundations benchmark.

### GR-1: wildcard permissions

- Only `Allow` statements are judged. A `Deny` is never a wildcard grant.
- One finding per statement, at the highest applicable severity, listing every offending action sorted.
- A bare `"*"` Resource (or any `NotResource`) counts as unscoped. A scoped ARN that ends in `/*` does not.
- `NotAction` with `Allow` is HIGH: it grants everything except the listed actions, including actions AWS adds later.
- A public Principal is rated by its Condition: a Condition may narrow who can really use it, so it is reviewed (MEDIUM), not ignored.

### GR-2: unrestricted ingress

- Sources narrower than `/0` are never flagged. `0.0.0.0/1` is not the internet.
- A protocol of `-1`, or a TCP/UDP range containing 22 or 3389, is CRITICAL. A missing port range is read as every port.
- Allowed without a finding: TCP 80 alone and TCP 443 alone. A range such as 80-443 is not "only web" and is rated by its ports. UDP 443 is not web.
- One finding per ingress rule, listing the sensitive ports the range covers.

### GR-3: unencrypted storage

- EBS needs `encrypted` set to boolean `true`; RDS needs `storageEncrypted` set to boolean `true`. A string `"true"` does not count.
- **S3 is different, and the wording must stay accurate.** Since 5 January 2023 Amazon S3 applies SSE-S3 to every new object by default. A bucket without a declared configuration is therefore not holding plaintext. The finding is a **missing explicit declaration** (MEDIUM), and its message says S3 already encrypts new objects by default. Never describe it as "unencrypted data".
- Accepted S3 declarations: `AES256`, `aws:kms`, `aws:kms:dsse`.

### GR-3, S3 public access (`PG-STO-002`)

- A canned ACL of `public-read` or `public-read-write` is CRITICAL and `authenticated-read` (any AWS account holder) is HIGH. When `ignorePublicAcls` is true the ACL is not effective, so the Finding drops to MEDIUM but still exists.
- Only `Allow` statements with Principal `*` or `{"AWS": "*"}` in the bucket policy count. A `Deny` that names `*` (the usual "require TLS" pattern) is never public. CRITICAL without a Condition, MEDIUM with one, and MEDIUM when `restrictPublicBuckets` is true. No patch: PhantomGuard cannot know which principal is meant.
- **Block Public Access wording must stay accurate.** Amazon S3 has enabled Block Public Access for every new bucket since April 2023, so a bucket with no declaration is not open. That Finding is a MEDIUM **missing explicit declaration** and its message says so. Never describe it as "the bucket is public".
- The patch sets all four settings to true. It requires review exactly when the bucket is public today, because turning the settings on cuts that access off. Making an ACL private always requires review.

### GR-4: root container execution

- Dockerfile: only the **final** build stage decides. The last `USER` in that stage counts. A stage that starts `FROM` an earlier stage inherits its user.
- `USER root`, `0`, `00`, and pairs such as `root:root` or `0:0` are root. A missing `USER` is root.
- A `USER` that uses a variable (`${APP_USER}`) cannot be judged: no finding, and an info Diagnostic `PG-CTR-UNRESOLVED-USER`.
- Text inside a `RUN <<EOF` heredoc is data, not instructions.
- ECS: a container with no `user`, or `root`/`0`, is HIGH. `privileged: true` is CRITICAL.

## Least-privilege remediation format

Every IAM patch follows this contract. A patch that breaks it is a bug.

1. **Never widen.** The new `Action` list contains no `*` or `?`, and every action in it is covered by something the statement already granted. A scoped `Resource` is left alone. A bare `*` Resource is replaced only by resources named in usage evidence.
2. **Explicit, sorted, unique.** `Action` becomes an array sorted by plain code-unit order with duplicates removed. Explicit actions already in the statement are kept.
3. **Preserve identity.** `Sid`, `Effect`, `Condition` and `Principal` keep their original values.
4. **Evidence order.** (a) usage evidence on the resource (`observedUsage.actions`, `observedUsage.resources`) that matches the wildcard; (b) the read-only catalog for the service; (c) no patch, only guidance. Never invent actions. A global `*` with no evidence gets guidance.
5. **Catalog is read-only.** `READ_ONLY_CATALOG` lists read actions only. Write and delete actions are never added by a catalog patch.
6. **Say where it came from.** The rationale names the source ("observed usage" or "read-only catalog").
7. **Always `reviewRequired: true`.** The new policy grants only what is listed; anything the workload needs that is missing will be denied.
8. **`NotAction` and public Principals get guidance only.** PhantomGuard cannot know the intended set.

## Patch safety rules (all rules)

- A patch must **fix its own finding and add no new one**, and applying it **twice equals once**. Operations are absolute `set` operations on `resource.attributes`, guarded by a precondition so a stale patch is rejected.
- `applyPatch` returns a new frozen resource and never mutates its input. A path that does not exist returns `{ ok: false }`.
- A patch only narrows access or enables hardening. It never disables encryption, adds a source, adds an action or enlarges a CIDR.
- `reviewRequired` is `true` for IAM permission changes, ingress removal, replacement of existing storage (EBS, RDS), and container user changes. It is `false` only for a behavior-neutral change, such as declaring SSE-S3 on a bucket.
- If no safe deterministic fix exists, attach guidance. Do not fabricate a patch to look helpful.
- Patches are previews. Nothing in the library or the Playground writes to a user's cloud account.

## Data handling

- **No exfiltration.** The engine performs no network request. The Playground makes none after load. The CSP enforces it.
- **Redaction.** A value stored under a key containing `password`, `secret`, `token` or `access_key`, and the `value` of a name/value pair whose name contains one of those words (the ECS `environment` shape), is replaced by `[REDACTED]`. Messages, previews and diffs are redacted when the report is built. `ScanReport.resources` and patch preconditions keep raw values because `applyPatch` needs them, so **every output path must call `redactReport(report)` first**: CLI JSON and SARIF, clipboard export, logs, error reports.
- **Terminal safety.** Text taken from input and put into a message passes through `printable()`, which replaces control characters, so hostile input cannot rewrite a terminal.
- **Fixtures.** Datasets and tests use the AWS example account `123456789012` and no credential-shaped strings. A deliberate fake credential in a fixture carries the marker `phantomguard:allow-secret`.
- **Secrets in the repo.** The secrets audit scans staged content for AWS keys, private keys, and GitHub, Slack and Netlify tokens. It blocks the commit. If a real credential is ever committed, rotate it first, then remove it.

## Engine safety

- Input limits: 1 MiB, JSON depth 64, 5,000 resources. Over a limit means a Diagnostic, not a crash.
- Parsers never throw. `parseConfig` also catches a parser bug and reports `PG-PARSE-INTERNAL`.
- A rule that throws becomes `PG-RULE-ERROR`; the scan continues. Rules receive a deeply frozen copy, so mutation throws.
- `__proto__`, `constructor` and `prototype` keys are plain data. They must never change a prototype.
- No `eval`, `new Function`, dynamic import of user-derived paths, or `innerHTML` with user text.

## Adding or changing a rule: checklist

1. Check the AWS syntax in the AWS documentation MCP server. Do not guess property names or defaults.
2. Id `PG-<IAM|NET|STO|CTR>-<NNN>`, category matching the id, one file in the matching `rules/<ruleset>/` folder, registered in `rules/index.ts`.
3. Verified `references` with benchmark, version, control and title. No reference for a case it does not cover.
4. `evaluate` and `remediate` are pure. Messages state facts and never include a sensitive value.
5. A patch satisfies the safety rules above, or the finding carries guidance.
6. Dataset coverage: the violation appears in `haunted-mansion`; the compliant form appears in `sanctified-sanctuary`.
7. Requirement criteria added or updated in `requirements.md`, mapped in `tasks.md`.
8. Property tests (soundness, no false positives, determinism, patch fixes and adds nothing, idempotence, never widens) with `Feature` and `Validates` tags. The `sync-rule-tests` hook prompts for them.
9. `npm run audit:precommit` passes.
