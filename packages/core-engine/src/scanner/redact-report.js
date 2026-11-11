import { redactSecrets } from '../util/redact.js';
function redactPatch(patch) {
  return {
    ...patch,
    precondition: patch.precondition.exists
      ? { ...patch.precondition, equals: redactSecrets(patch.precondition.equals) }
      : patch.precondition,
    operations: patch.operations.map((operation) => ({
      ...operation,
      value: redactSecrets(operation.value),
    })),
  };
}
function redactFinding(finding) {
  const { patch, ...rest } = finding;
  return {
    ...rest,
    evidence: redactSecrets(finding.evidence),
    ...(patch === undefined ? {} : { patch: redactPatch(patch) }),
  };
}
/**
 * A copy of the report that is safe to print, log, upload or serialize.
 *
 * The engine keeps raw attribute values inside `ScanReport.resources` and inside
 * a patch's precondition because `applyPatch` compares against them. Messages,
 * previews and diffs are already redacted when the report is built. Every output
 * path (CLI JSON and SARIF, clipboard export, logs) MUST call this function first,
 * so that a value stored under a key containing `password`, `secret`, `token` or
 * `access_key` is replaced by `[REDACTED]` everywhere (Requirement 10.7).
 *
 * Do not pass the result to `applyPatch`: its values are masked.
 */
export function redactReport(report) {
  return {
    ...report,
    resources: report.resources.map((resource) => ({
      ...resource,
      attributes: redactSecrets(resource.attributes),
    })),
    findings: report.findings.map(redactFinding),
  };
}
