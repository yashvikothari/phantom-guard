# @phantomguard/core-engine

The analysis engine behind PhantomGuard: `parse -> normalize -> evaluate -> remediate`. Pure TypeScript with **no runtime dependency, no DOM API and no Node API**, so the same code runs in the browser playground and in the CLI.

```ts
import { scanText, applyPatch, redactReport } from '@phantomguard/core-engine';

const report = scanText(policyJson); // detects the format, parses, scans
for (const finding of report.findings) {
  console.log(finding.severity, finding.ruleId, finding.message);
  if (finding.patch) {
    const resource = report.resources.find((r) => r.id === finding.resourceId);
    const fixed = resource && applyPatch(resource, finding.patch); // pure: returns a new resource
  }
}

// Before printing, logging or serializing a report, mask secrets:
const safe = redactReport(report);
```

## Layout

```text
src/
├── contracts/     HauntedResource, DetectionRule, ExorcismPatch, Finding, ScanReport (types only)
├── parsers/       format detection, IAM policy (JSON) and Dockerfile parsers, JSON syntax checker
├── rules/         rulesets: iam/, network/, storage/, container/ (+ verified compliance references)
├── remediation/   buildPatch, applyPatch, least-privilege catalog
├── scanner/       rule registry, scan(), scanText(), redactReport()
├── datasets/      fictional AWS accounts for the Inspector
└── util/          frozen copies, JSON pointer, unified diff, redaction, text helpers
test/              fast-check property tests, mirroring src/ (rules/, engine/, arbitraries/)
```

## Guarantees

- A scan is a pure function of its input. No clock, randomness, environment or I/O.
- Parsers never throw. Over-limit input (1 MiB, JSON depth 64, 5,000 resources) becomes a Diagnostic.
- A rule that throws becomes `PG-RULE-ERROR`; the scan continues. Rules receive a deeply frozen copy.
- A patch fixes its own finding, adds none, and applying it twice equals applying it once.

## Adding a rule

Follow the checklist at the end of [`.kiro/steering/secops-guardrails.md`](../../.kiro/steering/secops-guardrails.md). In short: one file in the matching `rules/<ruleset>/` folder, registered in `rules/index.ts`, verified references, a patch or guidance, dataset coverage, and a property test (the `sync-rule-tests` hook prompts for it).

## Scripts

`npm run build` compiles to `dist/`. `npm run typecheck` checks the sources and tests. `npm test` runs Vitest; set `FC_NUM_RUNS` to raise the property-test run count and `FC_SEED` to replay a failure.
