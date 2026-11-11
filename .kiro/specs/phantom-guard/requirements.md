# Requirements Document

## Introduction

PhantomGuard is a static security analyzer for cloud infrastructure code, dressed up as a haunted house for the Kiroween 2026 Costume Contest. It finds dangerous configuration in Terraform, Dockerfiles and IAM policies, explains each finding against the CIS benchmarks, and proposes a least-privilege fix called an _exorcism_.

The product has three deliverables that share one analysis engine:

- **Core Engine** (`@phantomguard/core-engine`): a pure, environment-agnostic TypeScript library that parses input, evaluates detection rules and generates patches.
- **CLI** (`@phantomguard/cli-toolkit`): a local command-line wrapper around the engine for developers and CI.
- **Playground** (`@phantomguard/web-playground`): a client-side web app with two modes, the **Haunted Cloud Inspector** (Mode 1, pre-loaded mock AWS datasets) and the **Custom Config Scanner** (Mode 2, user-supplied Terraform, Dockerfile and IAM policy text).

Design constraints that apply to every requirement below:

- Analysis runs entirely on the user's machine. No configuration text is ever sent to a server.
- A scan is a pure function of its input. Equal input produces byte-identical output.
- The theme is serious security work wearing a costume. Spooky wording appears in the Playground only. Machine-readable output uses technical terms.

### How to read the acceptance criteria

Acceptance criteria use EARS (Easy Approach to Requirements Syntax). Each criterion starts with one of these keywords:

| Pattern            | Form                                          |
| ------------------ | --------------------------------------------- |
| Ubiquitous         | THE <system> SHALL <response>                 |
| Event-driven       | WHEN <trigger>, THE <system> SHALL <response> |
| State-driven       | WHILE <state>, THE <system> SHALL <response>  |
| Unwanted behaviour | IF <condition>, THEN THE <system> SHALL <response> |
| Optional feature   | WHERE <feature is present>, THE <system> SHALL <response> |

Criteria are identified as `<requirement>.<criterion>`, for example `5.2`. Tasks in `tasks.md` and property tests cite these identifiers. `npm run audit:governance` fails when a task cites an identifier that does not exist or a criterion has no task.

## Glossary

- **PhantomGuard**: the whole product: Core Engine, CLI and Playground.
- **Core_Engine**: the `@phantomguard/core-engine` library.
- **Parser**: a Core_Engine component that turns configuration text of one format into HauntedResources and Diagnostics.
- **CLI**: the `phantomguard` command from `@phantomguard/cli-toolkit`.
- **Playground**: the `@phantomguard/web-playground` application.
- **Inspector**: Mode 1 of the Playground, the Haunted Cloud Inspector.
- **Config_Scanner**: Mode 2 of the Playground, the Custom Config Scanner.
- **Repository**: the PhantomGuard Git repository, including `.kiro/`, hooks and build configuration.
- **HauntedResource**: the normalized representation of one infrastructure resource, whatever its source format.
- **Dataset**: a pre-loaded, fictional set of HauntedResources that models an AWS account.
- **DetectionRule**: a pure function plus metadata that finds one class of misconfiguration on HauntedResources.
- **Finding**: one rule violation on one resource. The Playground calls it a _haunting_.
- **ExorcismPatch**: a machine-applicable, previewable fix for a Finding. The Playground calls applying it an _exorcism_.
- **Diagnostic**: a non-Finding message from parsing or scanning, with a stable code such as `PG-PARSE-SYNTAX`.
- **ScanReport**: the complete result of one scan: resources, Findings, Diagnostics and summary.
- **Severity**: one of CRITICAL, HIGH, MEDIUM, LOW, INFO.
- **Risk_Score**: an integer from 0 to 100 that summarizes the Findings in a ScanReport (`summary.riskScore`). It is the sum of per-Finding weights (CRITICAL 40, HIGH 20, MEDIUM 8, LOW 2, INFO 0), capped at 100.
- **Haunting_Level**: the Playground's name for the Risk_Score. Interface copy only; machine-readable output uses `riskScore`.
- **Guardrail**: one of the four non-negotiable security rules in `.kiro/steering/secops-guardrails.md`: GR-1 wildcard permissions, GR-2 unrestricted ingress, GR-3 unencrypted storage, GR-4 root container execution.
- **Least_Privilege_Format**: the output contract for IAM remediation defined in Requirement 10.

## Requirements

## Part A: Static analysis engine

### Requirement 1: Input ingestion and format detection

**User Story:** As a developer, I want PhantomGuard to accept Terraform, Dockerfile and IAM policy text and work out the format itself, so that I can scan a file without declaring its type.

#### Acceptance Criteria

1. WHEN the Core_Engine receives configuration text without a declared format, THE Core_Engine SHALL detect the format as `terraform`, `dockerfile` or `iam-policy` from the content alone and report the detected format in the ScanReport.
2. WHEN the caller declares a format, THE Core_Engine SHALL use that format and skip detection.
3. IF the content matches no supported format, THEN THE Core_Engine SHALL return a ScanReport with zero Findings and one error Diagnostic with code `PG-PARSE-UNKNOWN-FORMAT`.
4. IF a declared or detected format has no registered Parser, THEN THE Core_Engine SHALL return one error Diagnostic with code `PG-PARSE-UNSUPPORTED` that names the format, and SHALL NOT throw.
5. IF the input exceeds 1,048,576 bytes of UTF-8 text, THEN THE Core_Engine SHALL reject it before parsing with an error Diagnostic with code `PG-LIMIT-INPUT-SIZE`.
6. THE Core_Engine SHALL use only APIs available in both current browsers and Node.js LTS, with no DOM-only and no Node-only API.

### Requirement 2: Tolerant parsing and diagnostics

**User Story:** As a developer pasting half-written infrastructure code, I want the scanner to report what it can and tell me where it got lost, so that a typo does not hide real vulnerabilities.

#### Acceptance Criteria

1. WHEN a Parser encounters a syntax error, THE Parser SHALL record a Diagnostic with code `PG-PARSE-SYNTAX` and 1-based line and column, and SHALL continue parsing the rest of the input.
2. THE Parser SHALL NOT throw for any string input, including the empty string, whitespace-only text and text containing control characters.
3. WHEN a Parser meets a construct it cannot evaluate, such as a Terraform interpolation or an unresolved reference, THE Parser SHALL keep the enclosing resource and mark that attribute value as opaque instead of dropping the resource.
4. WHEN the same text is parsed twice, THE Parser SHALL return deeply equal results.
5. IF parsing yields more than 5,000 resources, THEN THE Core_Engine SHALL scan only the first 5,000 and add a warning Diagnostic with code `PG-LIMIT-RESOURCES`.
6. WHEN Terraform text declares an `aws_iam_policy`, `aws_iam_role_policy`, `aws_iam_role`, `aws_security_group`, `aws_security_group_rule`, `aws_vpc_security_group_ingress_rule`, `aws_s3_bucket`, `aws_ebs_volume`, `aws_db_instance` or `aws_ecs_task_definition` resource, THE Parser SHALL produce one HauntedResource per block, using the attribute paths of Requirement 3.3, and SHALL merge the ACL, policy, Block Public Access and encryption companion resources of an S3 bucket into that bucket.
7. WHEN a security-relevant Terraform value is a reference, a variable or an unsupported function, THE Parser SHALL keep the resource, store the value as its source text, and add an info Diagnostic with code `PG-PARSE-OPAQUE` that names the setting; and WHEN the protocol or port range of an ingress rule cannot be resolved, THE Parser SHALL NOT judge that rule.
8. WHEN Terraform text contains no resource of a supported type, THE Parser SHALL add an info Diagnostic with code `PG-PARSE-NO-RESOURCES`, so that an empty result is never mistaken for a clean one.
9. WHEN a Finding has no finer location and its resource was parsed from Terraform, THE Core_Engine SHALL give the Finding the first line of the resource block.

### Requirement 3: Normalized resource model

**User Story:** As a rule author, I want every input format and every dataset to produce the same resource shape, so that one rule works everywhere.

#### Acceptance Criteria

1. THE Core_Engine SHALL represent every parsed or dataset resource as a HauntedResource that has an id, a kind, a name, a provider, an origin and JSON-serializable attributes.
2. THE Core_Engine SHALL assign each HauntedResource an id that is unique within one scan and identical across repeated scans of identical input, and IF a scan receives two resources with the same id, THEN THE Core_Engine SHALL scan the first, skip the others and add a warning Diagnostic with code `PG-RESOURCE-DUPLICATE-ID`.
3. WHEN two sources describe the same security-relevant fact, such as a security group from Terraform and from a Dataset, THE Core_Engine SHALL expose that fact at the same attribute path, so that one DetectionRule evaluates both.
4. THE Core_Engine SHALL record, in the origin of every parsed HauntedResource, the source format and the 1-based start and end line.
5. THE Core_Engine SHALL treat attribute keys named `__proto__`, `constructor` and `prototype` as plain data and SHALL NOT let them modify any object prototype.

### Requirement 4: Detection rule contract and registry

**User Story:** As a rule author, I want a small, strict contract for rules, so that I can add a rule without touching the scanner and trust that a broken rule cannot break a scan.

#### Acceptance Criteria

1. THE Core_Engine SHALL define each DetectionRule with a unique id of the form `PG-<CATEGORY>-<NNN>`, a title, a Severity, the resource kinds it applies to, at least one compliance reference and a pure `evaluate` function.
2. IF two DetectionRules are registered with the same id, THEN THE Core_Engine SHALL throw an error naming the id at registration time.
3. WHEN the Core_Engine passes a HauntedResource to a DetectionRule, THE Core_Engine SHALL pass a deeply frozen copy, so that a rule cannot mutate scan input.
4. IF a DetectionRule throws while evaluating, THEN THE Core_Engine SHALL record a Diagnostic with code `PG-RULE-ERROR` that names the rule, continue with the remaining rules and still return a ScanReport.
5. WHERE the caller supplies a rule allow-list or deny-list, THE Core_Engine SHALL run only the rules that the list permits.
6. THE Core_Engine SHALL evaluate a DetectionRule only against resources whose kind appears in the rule's applicable kinds.

### Requirement 5: Guardrail GR-1, wildcard permissions

**User Story:** As a cloud security engineer, I want wildcard IAM permissions flagged by severity, so that I fix the most dangerous grants first.

#### Acceptance Criteria

1. WHEN an IAM policy statement has Effect `Allow` and an Action of `*` or `*:*`, THE Core_Engine SHALL report a CRITICAL Finding with rule id `PG-IAM-001`.
2. WHEN an Allow statement has a service-wide Action of the form `<service>:*` and a Resource that contains `*` as a whole value, THE Core_Engine SHALL report a HIGH Finding with rule id `PG-IAM-001`.
3. WHEN an Allow statement has a service-wide Action of the form `<service>:*` and only scoped Resources, THE Core_Engine SHALL report a MEDIUM Finding with rule id `PG-IAM-001`.
4. WHEN an Allow statement uses `NotAction`, THE Core_Engine SHALL report a HIGH Finding with rule id `PG-IAM-001`, because the statement grants everything except the listed actions.
5. WHEN an Allow statement contains a partial wildcard such as `s3:Get*` and no stronger wildcard, THE Core_Engine SHALL report a LOW Finding with rule id `PG-IAM-001`.
6. WHEN a statement has Effect `Deny`, THE Core_Engine SHALL NOT report a wildcard Finding for it.
7. THE Core_Engine SHALL report at most one `PG-IAM-001` Finding per statement, at the highest applicable Severity, and SHALL list every offending action in that Finding.
8. WHEN an Allow statement has a Principal of `*` or `{"AWS": "*"}` and no Condition, THE Core_Engine SHALL report a CRITICAL Finding with rule id `PG-IAM-002`.
9. WHEN an Allow statement has a Principal of `*` or `{"AWS": "*"}` and a Condition, THE Core_Engine SHALL report a MEDIUM Finding with rule id `PG-IAM-002` that asks for review of the Condition.

### Requirement 6: Guardrail GR-2, unrestricted network ingress

**User Story:** As a cloud security engineer, I want security group rules that open the world to my infrastructure flagged by how dangerous the exposed port is, so that I close SSH and database exposure first.

#### Acceptance Criteria

1. WHEN a security group ingress rule has source `0.0.0.0/0` or `::/0` and its port range includes 22 or 3389, or its protocol is `-1` (all), THE Core_Engine SHALL report a CRITICAL Finding with rule id `PG-NET-001`.
2. WHEN such an open rule exposes a data-store port from the list 1433, 1521, 2049, 3306, 5432, 5984, 6379, 9042, 9200, 11211 or 27017 and no CRITICAL condition applies, THE Core_Engine SHALL report a HIGH Finding with rule id `PG-NET-001`.
3. WHEN such an open rule exposes any other port, except TCP 80 and TCP 443 alone, THE Core_Engine SHALL report a MEDIUM Finding with rule id `PG-NET-001`.
4. WHEN an open ingress rule exposes exactly TCP 80 or exactly TCP 443 (a single port, not a range that includes them), THE Core_Engine SHALL NOT report a Finding for it.
5. WHEN an ingress source is narrower than a `/0` prefix, THE Core_Engine SHALL NOT report a Finding for that source.
6. WHEN one rule's port range matches several categories, THE Core_Engine SHALL report one Finding at the highest applicable Severity and list every matched port or range.

### Requirement 7: Guardrail GR-3, storage encryption and public access

**User Story:** As a cloud security engineer, I want storage that does not declare encryption at rest, and S3 buckets that the public can reach, flagged, so that data at rest is protected and not exposed by default.

#### Acceptance Criteria

1. WHEN an EBS volume does not have `encrypted` set to `true`, THE Core_Engine SHALL report a HIGH Finding with rule id `PG-STO-001`.
2. WHEN an RDS instance does not have `storageEncrypted` set to `true`, THE Core_Engine SHALL report a HIGH Finding with rule id `PG-STO-001`.
3. WHEN an S3 bucket declares no server-side encryption configuration, THE Core_Engine SHALL report a MEDIUM Finding with rule id `PG-STO-001`.
4. WHEN an S3 bucket declares server-side encryption with `AES256`, `aws:kms` or `aws:kms:dsse`, THE Core_Engine SHALL NOT report a Finding for it.
5. THE Core_Engine SHALL describe the S3 Finding as a missing explicit declaration and SHALL state that Amazon S3 already applies SSE-S3 to new objects by default.
6. WHEN an S3 bucket has the canned ACL `public-read` or `public-read-write`, THE Core_Engine SHALL report a CRITICAL Finding with rule id `PG-STO-002`, and WHEN the ACL is `authenticated-read`, THE Core_Engine SHALL report a HIGH Finding; and WHERE `ignorePublicAcls` is `true`, THE Core_Engine SHALL lower either Finding to MEDIUM, because the ACL is not effective.
7. WHEN the policy of an S3 bucket has an Allow statement whose Principal is `*` or `{"AWS": "*"}`, THE Core_Engine SHALL report a CRITICAL Finding with rule id `PG-STO-002` when the statement has no Condition and a MEDIUM Finding when it has one, and WHERE `restrictPublicBuckets` is `true`, THE Core_Engine SHALL report MEDIUM, because the policy is not effective.
8. WHEN a bucket policy statement has Effect `Deny` or names a specific principal, THE Core_Engine SHALL NOT report it as public.
9. WHEN an S3 bucket does not have all four of `blockPublicAcls`, `blockPublicPolicy`, `ignorePublicAcls` and `restrictPublicBuckets` set to `true`, THE Core_Engine SHALL report a MEDIUM Finding with rule id `PG-STO-002` and a patch that sets all four to `true`, and the patch SHALL require review exactly when the bucket has a public ACL or a public Allow statement today.
10. WHEN the Finding of criterion 9 is about a bucket that declares no Block Public Access configuration, THE Core_Engine SHALL describe it as a missing explicit declaration and SHALL state that Amazon S3 has enabled Block Public Access for new buckets since April 2023.

### Requirement 8: Guardrail GR-4, root container execution

**User Story:** As a platform engineer, I want containers that run as root flagged, so that a compromised process does not start with full privileges inside the container.

#### Acceptance Criteria

1. WHEN the final build stage of a Dockerfile has no `USER` instruction, THE Core_Engine SHALL report a HIGH Finding with rule id `PG-CTR-001`.
2. WHEN the last `USER` instruction in the final build stage of a Dockerfile names `root`, `0`, or a `root:` or `0:` user and group pair, THE Core_Engine SHALL report a HIGH Finding with rule id `PG-CTR-001`.
3. WHEN a container definition in an ECS task definition has no `user`, or a `user` of `root` or `0`, THE Core_Engine SHALL report a HIGH Finding with rule id `PG-CTR-001`.
4. WHEN a container definition is `privileged`, THE Core_Engine SHALL report a CRITICAL Finding with rule id `PG-CTR-001`.
5. WHEN a Dockerfile defines several build stages, THE Core_Engine SHALL evaluate only the final stage, because only the final stage determines the runtime user.
6. IF the user value is an unresolved build argument or variable reference, THEN THE Core_Engine SHALL NOT report a Finding and SHALL add an info Diagnostic with code `PG-CTR-UNRESOLVED-USER`.

### Requirement 9: Findings and the scan report

**User Story:** As a user, I want findings that are complete, ordered and reproducible, so that I can diff two scans and trust the numbers.

#### Acceptance Criteria

1. THE Core_Engine SHALL give every Finding a rule id, a Severity, a resource id, a message, a location, at least one compliance reference and, when one exists, an ExorcismPatch.
2. THE Core_Engine SHALL order Findings by Severity descending, then rule id, then resource id, then location, so that equal input yields a byte-identical ScanReport.
3. THE Core_Engine SHALL compute the Risk_Score as the sum of per-Finding weights (CRITICAL 40, HIGH 20, MEDIUM 8, LOW 2, INFO 0), capped at 100.
4. THE Core_Engine SHALL include in every ScanReport a per-Severity count whose sum equals the number of Findings.
5. WHEN two evaluations yield a Finding with the same rule id, resource id and location, THE Core_Engine SHALL keep only one.
6. THE Core_Engine SHALL NOT read the system clock, random sources or the environment while scanning, so that a ScanReport is a pure function of its input.

### Requirement 10: Exorcism patches and the Least_Privilege_Format

**User Story:** As a developer, I want each finding to come with a precise, reviewable fix that never makes things worse, so that I can apply it without fear.

#### Acceptance Criteria

1. WHEN a Finding has a deterministic remediation, THE Core_Engine SHALL attach an ExorcismPatch with an id, the rule id, the resource id, a title, a rationale, an ordered list of operations, a before and after preview and a unified diff.
2. THE Core_Engine SHALL NOT produce a patch that adds a wildcard, widens an action set, resource set or CIDR range, or disables encryption or any other hardening.
3. WHEN a patch replaces a wildcard IAM action, THE Core_Engine SHALL write an explicit, alphabetically sorted, de-duplicated action list and SHALL preserve `Sid`, `Effect`, `Condition` and `Principal` unchanged.
4. WHEN a resource carries observed-usage evidence, THE Core_Engine SHALL derive a least-privilege patch from that evidence. WHEN no evidence exists and the service has a catalog entry, THE Core_Engine SHALL derive it from the read-only catalog. IF neither exists, THEN THE Core_Engine SHALL omit the patch and attach manual guidance to the Finding.
5. THE Core_Engine SHALL mark `reviewRequired` as `true` on every patch that can change runtime behavior: IAM permission changes, ingress removal, replacement of existing storage and changes to a container user.
6. IF a Finding has no safe deterministic remediation, THEN THE Core_Engine SHALL attach a guidance text that describes the manual fix, and SHALL NOT invent a patch.
7. THE Core_Engine SHALL replace the value of any attribute whose name contains `password`, `secret`, `token` or `access_key` with `[REDACTED]` in every message, preview and diff.

### Requirement 11: Patch verification and idempotence

**User Story:** As a maintainer, I want proof that a patch fixes what it claims to fix, so that "exorcised" means clean.

#### Acceptance Criteria

1. WHEN a patch is applied to the resource it targets, THE Core_Engine SHALL return a new resource and SHALL NOT mutate the original.
2. WHEN the patched resource is scanned again, THE Core_Engine SHALL report no Finding with the patch's rule id on that resource.
3. WHEN the patched resource is scanned again, THE Core_Engine SHALL report no Finding that the original did not have.
4. WHEN a patch is applied twice in a row, THE Core_Engine SHALL return the same resource as after the first application.
5. IF a patch operation refers to a path that does not exist, THEN THE Core_Engine SHALL return a typed error result and leave the input unchanged.

### Requirement 12: Safety and resource limits

**User Story:** As a user who pastes sensitive infrastructure code, I want a guarantee that the scanner is safe to run on hostile input, so that analysis cannot leak or hang.

#### Acceptance Criteria

1. THE Core_Engine SHALL NOT perform network requests, write files, call `eval` or `new Function`, or dynamically import code derived from user input.
2. THE Playground SHALL NOT transmit pasted or uploaded configuration text to any server or third-party origin.
3. THE Core_Engine SHALL apply only linear-time regular expressions to user text and SHALL bound every loop by the size of the input.
4. IF a Playground scan runs longer than 5 seconds, THEN THE Playground SHALL terminate the scan worker and show a timeout message.
5. WHEN the Core_Engine reads untrusted JSON, THE Core_Engine SHALL parse it with `JSON.parse` only and SHALL reject nesting deeper than 64 levels with an error Diagnostic.

### Requirement 13: Mock AWS datasets

**User Story:** As a judge or first-time visitor, I want realistic pre-loaded accounts to explore, so that I see PhantomGuard work without writing any code.

#### Acceptance Criteria

1. THE Core_Engine SHALL ship at least two Datasets: `haunted-mansion`, with at least one violation of each Guardrail, and `sanctified-sanctuary`, with none.
2. THE Datasets SHALL contain only fictional data: the example account id `123456789012` and no real or realistic credentials.
3. WHEN a Dataset is loaded more than once, THE Core_Engine SHALL return deeply equal, deeply frozen resources.
4. WHEN `sanctified-sanctuary` is scanned, THE Core_Engine SHALL report zero Findings and a Risk_Score of 0.
5. WHEN `haunted-mansion` is scanned, THE Core_Engine SHALL report at least one Finding for each of `PG-IAM-001`, `PG-NET-001`, `PG-STO-001` and `PG-CTR-001`.

## Part B: Command-line toolkit

### Requirement 14: CLI scan command

**User Story:** As a developer or CI owner, I want to scan files and directories from a terminal and gate a build on the result, so that bad configuration never merges.

#### Acceptance Criteria

1. WHEN the user runs `phantomguard scan <path>...`, THE CLI SHALL scan each file given and every supported file under each directory given.
2. WHEN a path argument is `-`, THE CLI SHALL read the configuration text from standard input.
3. WHERE `--format <format>` is given, THE CLI SHALL use that format instead of detection.
4. WHEN the scan ends, THE CLI SHALL exit with code 0 if no Finding reaches the `--fail-on` Severity (default HIGH), code 1 if at least one does, and code 2 on a usage error, an unreadable input, or an input that produced an error Diagnostic, with code 2 taking precedence over code 1.
5. WHERE `--output json` is given, THE CLI SHALL write exactly one JSON document that matches the ScanReport contract to standard output and nothing else.
6. WHERE `--output sarif` is given, THE CLI SHALL write a valid SARIF 2.1.0 log with one rule per DetectionRule and one result per Finding, including physical locations.
7. WHILE standard output is not a terminal or the `NO_COLOR` environment variable is set, THE CLI SHALL NOT write ANSI escape sequences.
8. IF a file cannot be read or exceeds the input size limit, THEN THE CLI SHALL report that file on standard error, continue with the other files and finish with exit code 2.

### Requirement 15: CLI exorcise command

**User Story:** As a developer, I want to preview and apply safe fixes from the terminal, so that remediation is a one-line step.

#### Acceptance Criteria

1. WHEN the user runs `phantomguard exorcise <file>`, THE CLI SHALL print the unified diff of every available patch and SHALL NOT modify any file.
2. WHERE `--write` is given, THE CLI SHALL apply only patches whose `reviewRequired` is `false`, unless `--include-review` is also given.
3. WHEN the CLI writes a file, THE CLI SHALL write to a temporary file in the same directory and rename it over the original, so that an interruption never leaves a half-written file.
4. WHEN the CLI has written a file, THE CLI SHALL scan the result again and exit with code 1 if a targeted Finding remains.

## Part C: Web playground

### Requirement 16: Dual-mode shell

**User Story:** As a visitor, I want to switch between exploring a haunted account and scanning my own code, so that I can try the product both ways.

#### Acceptance Criteria

1. THE Playground SHALL present the Inspector and the Config_Scanner as an accessible tab list and SHALL select the Inspector on first load.
2. WHEN the user switches mode, THE Playground SHALL keep each mode's state, meaning selected Dataset, entered text and results, for the rest of the browser session.
3. WHEN the URL fragment is `#inspector` or `#scanner`, THE Playground SHALL open that mode.
4. WHEN the first page load has finished, THE Playground SHALL make no further network request.

### Requirement 17: Mode 1, Haunted Cloud Inspector

**User Story:** As a visitor, I want to wander through a haunted AWS account, see what is wrong and exorcise it with one click, so that I understand the product in thirty seconds.

#### Acceptance Criteria

1. WHEN the Inspector opens, THE Inspector SHALL list every pre-loaded Dataset and scan the selected one without further user action.
2. THE Inspector SHALL render each HauntedResource as a card that shows a deterministic spooky alias, the resource kind, the count of Findings and the highest Severity.
3. THE Inspector SHALL render a resource that has Findings with a glowing neon-red treatment and a resource without Findings with a glowing neon-green treatment.
4. WHEN the user selects a resource, THE Inspector SHALL show its Findings, their compliance references and the diff of each available ExorcismPatch.
5. WHEN the user performs an exorcism, THE Inspector SHALL apply the patch in memory, scan again, update the card, the counts and the Haunting_Level (the Risk_Score), and mark the patch as applied in neon green.
6. WHEN a patch has `reviewRequired` set to `true`, THE Inspector SHALL label it "Review required" and SHALL ask for explicit confirmation before applying it.
7. WHEN the user chooses Reset, THE Inspector SHALL restore the Dataset to its original state and discard all applied patches.
8. THE Inspector SHALL show the Haunting_Level as a meter that is neon red above 0 and neon green at 0, together with the numeric value.
9. WHEN the user selects a resource card, THE Inspector SHALL open a modal drawer that shows the resource's highest estimated CVSS score, each Finding with a plain-language explanation of its risk, and the ExorcismPatch for each Finding; and WHEN the user presses Escape or the Close action, THE Inspector SHALL close the drawer and return focus to the card.
10. THE Inspector SHALL show a dashboard with the number of zombie resources out of all resources, the number of poltergeists, the highest estimated CVSS score, the number of exorcisms performed, and the count of Findings for each Severity.
11. THE Playground SHALL compute every CVSS score with the CVSS v3.1 base equations from a vector that PhantomGuard assigns to each rule and Severity, SHALL show the vector, and SHALL label the score as an estimate and not as an NVD rating.

### Requirement 18: Mode 2, Custom Config Scanner

**User Story:** As a developer, I want to paste my own Terraform, Dockerfile or IAM policy and get findings and fixes immediately, so that I can use PhantomGuard on real work.

#### Acceptance Criteria

1. THE Config_Scanner SHALL provide a text area, a file picker with drag-and-drop for Terraform, Dockerfile and JSON files, a format selector (Auto, Terraform, Dockerfile, IAM policy) and one sample input per supported format, including Terraform.
2. WHEN the user starts a scan from the button or with Ctrl+Enter or Cmd+Enter, THE Config_Scanner SHALL show Findings ordered by Severity within 1 second for input up to 100 KiB.
3. WHEN a Finding has a location, THE Config_Scanner SHALL show the source lines around it with line numbers and mark the offending lines.
4. WHEN a Diagnostic exists, THE Config_Scanner SHALL show its message with line and column.
5. WHEN a Finding has an ExorcismPatch, THE Config_Scanner SHALL show the diff and a Copy action that places the unified diff on the clipboard.
6. WHILE the text area is empty, THE Config_Scanner SHALL disable the scan action and show guidance instead of an empty result list.
7. IF a dropped or selected file exceeds 1,048,576 bytes, THEN THE Config_Scanner SHALL refuse it with the `PG-LIMIT-INPUT-SIZE` message without reading it into the text area.
8. WHEN a Finding has an ExorcismPatch, THE Playground SHALL show the vulnerable configuration and the hardened configuration side by side, aligned line by line, with removed lines marked in neon red and added lines in neon green, and SHALL offer one-click actions that copy the hardened text and the unified diff and that report whether the copy succeeded.
9. WHEN a scan finishes, THE Config_Scanner SHALL show how long it took, measured from the request to the report.
10. WHEN a scan parses no resource and reports no error Diagnostic, THE Config_Scanner SHALL say that there was nothing to judge and SHALL NOT say that the configuration is sanctified.

### Requirement 19: Costume Contest visual design

**User Story:** As a contest judge, I want an interface that is unmistakably a costume yet still readable and accessible, so that the theme adds to the product instead of hiding it.

#### Acceptance Criteria

1. THE Playground SHALL use the Tailwind class `bg-slate-950` as its page background.
2. THE Playground SHALL signal vulnerabilities (Findings, CRITICAL and HIGH Severity, haunted resources) with a glowing neon-red palette and safe states (clean resources, applied patches, Haunting_Level 0) with a glowing neon-green palette.
3. THE Playground SHALL use spooky wording (poltergeist for a Finding, zombie resource for a resource with a Finding, exorcism, ward) in interface copy, and THE CLI and all JSON and SARIF output SHALL use the technical terms Finding and patch.
4. WHILE the operating system preference `prefers-reduced-motion: reduce` is active, THE Playground SHALL disable flicker, pulse and fog animations.
5. THE Playground SHALL keep a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text and interface components against their background, neon colors included.
6. THE Playground SHALL pair every Severity color with a text label and an icon, so that color is never the only signal.
7. THE Playground SHALL be fully operable with the keyboard, show visible focus indicators and expose ARIA roles and labels for tabs, lists and live scan results.
8. THE Playground SHALL be usable at a viewport width of 360 px without horizontal page scrolling.
9. THE Playground SHALL draw its panels as translucent glass over the page background, and THE Playground SHALL keep the contrast of criterion 5 on the brightest background a panel can sit on.

### Requirement 20: Performance

**User Story:** As a user, I want the app to stay responsive and load quickly, so that scanning feels instant.

#### Acceptance Criteria

1. THE Playground SHALL run scans in a Web Worker, so that a scan never blocks the main thread for more than 50 milliseconds.
2. WHEN the Core_Engine scans a 2,000-resource input on Node.js LTS on a 2-vCPU runner, THE Core_Engine SHALL finish within 1,000 milliseconds.
3. THE Playground SHALL keep the JavaScript needed for first load at or below 250 KiB gzipped.
4. WHEN the Playground is served from the Netlify CDN, THE Playground SHALL reach a Largest Contentful Paint of 2.5 seconds or less on a simulated Fast 4G mobile profile.

### Requirement 21: Zero-friction Netlify deployment

**User Story:** As the maintainer, I want to deploy by connecting the repository, so that the live demo is always one push away.

#### Acceptance Criteria

1. THE Repository SHALL deploy to Netlify with no manual setting, taking build command, publish directory and Node version from `netlify.toml`.
2. THE Playground build SHALL produce static files only, with no Netlify Functions, Edge Functions or runtime environment variables.
3. THE deployed site SHALL send a Content-Security-Policy of `default-src 'self'` with `connect-src 'self'`, plus the other security headers defined in `netlify.toml`.
4. WHEN a client requests an unknown path, THE deployed site SHALL return `index.html` with status 200.
5. WHEN `npm run build:web` runs on a clean checkout with Node.js 22 after dependencies are installed, THE build SHALL succeed and write the site to `packages/web-playground/dist`.

## Part D: Quality and governance

### Requirement 22: Property-based verification

**User Story:** As a maintainer, I want every rule and parser backed by properties that hold for all inputs, so that correctness does not depend on the examples I thought of.

#### Acceptance Criteria

1. THE Repository SHALL verify each DetectionRule with fast-check properties for soundness, absence of false positives, determinism, patch verification and patch idempotence.
2. THE Repository SHALL verify every Parser with a property that, for any generated string, parsing does not throw and returns a deterministic result.
3. WHEN a property fails, THE test run SHALL print the fast-check seed and the shrunk counterexample.
4. THE Repository SHALL run each property at least 200 times by default and allow the count to be raised through the `FC_NUM_RUNS` environment variable.
5. THE Repository SHALL tag each property test with the requirement criteria it validates in a `Validates: Requirements X.Y` comment.

### Requirement 23: Repository governance

**User Story:** As a contest entrant, I want the governance files in place and checked automatically, so that the submission always meets the contest rules.

#### Acceptance Criteria

1. THE Repository SHALL keep `.kiro/` and all of its subfolders tracked in version control and not matched by any ignore rule.
2. THE Repository SHALL contain an MIT `LICENSE` file at its root that GitHub can detect.
3. WHEN a file under `packages/core-engine/src/rules/` is saved, THE `sync-rule-tests` hook SHALL instruct the agent to create or update the matching property test.
4. WHEN an agent runs `git commit`, THE `pre-commit-audit` hook SHALL run the audit and block the commit when the audit fails.
5. IF a task cites a criterion that does not exist, or a criterion is cited by no task, THEN THE governance audit SHALL fail.
6. THE Repository SHALL configure a local Filesystem MCP server and an AWS Documentation MCP server in `.kiro/settings/mcp.json`.
