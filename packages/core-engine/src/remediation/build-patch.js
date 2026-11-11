import { getAtPointer } from '../util/json-pointer.js';
import { redactSecrets } from '../util/redact.js';
import { unifiedDiff } from '../util/unified-diff.js';
/**
 * Assemble an ExorcismPatch: derive the stale-patch precondition from the
 * resource, redact secrets from the preview, and compute the unified diff.
 */
export function buildPatch(input) {
  const anchored = getAtPointer(input.resource.attributes, input.anchor);
  const before = redactLines(input.before);
  const after = redactLines(input.after);
  return {
    id: `${input.ruleId}:${input.resource.id}:${input.locationKey}`,
    ruleId: input.ruleId,
    resourceId: input.resource.id,
    title: input.title,
    rationale: input.rationale,
    reviewRequired: input.reviewRequired,
    precondition: anchored.ok
      ? { path: input.anchor, exists: true, equals: anchored.value }
      : { path: input.anchor, exists: false },
    operations: input.operations,
    preview: {
      before,
      after,
      unifiedDiff: unifiedDiff(before, after, {
        beforeLabel: `${input.resource.name} (before)`,
        afterLabel: `${input.resource.name} (after)`,
      }),
    },
  };
}
/** Render a JSON value as stable, human-readable text (2-space indent) with secrets redacted. */
export function renderJson(value) {
  return JSON.stringify(redactSecrets(value), null, 2);
}
/**
 * Safety net for preview text. Structured values are already redacted by
 * `renderJson`; this masks `NAME=value` and `"name": value` lines whose name
 * contains a sensitive word (for example `ENV DB_PASSWORD=...`).
 *
 * The expression is anchored with `^` and applied one line at a time, and every
 * quantifier is over a disjoint character class, so matching is linear.
 */
const SENSITIVE_LINE =
  /^(\s*(?:ENV\s+|ARG\s+)?"?[\w.-]*(?:password|secret|token|access[_-]?key)[\w.-]*"?\s*[:=]\s*)\S.*$/i;
const MAX_REDACT_LINE = 4096;
function redactLines(text) {
  return text
    .split('\n')
    .map((line) => {
      if (line.length > MAX_REDACT_LINE) {
        return line.slice(0, MAX_REDACT_LINE);
      }
      return line.replace(SENSITIVE_LINE, '$1[REDACTED]');
    })
    .join('\n');
}
