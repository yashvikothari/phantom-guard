import { applyPatch, scan } from '../../src/index.js';
import type {
  ExorcismPatch,
  Finding,
  HauntedResource,
  JsonObject,
  ResourceKind,
  ScanReport,
} from '../../src/index.js';

export function makeResource(
  kind: ResourceKind,
  attributes: JsonObject,
  name = 'subject',
): HauntedResource {
  return {
    id: `${kind}.${name}`,
    kind,
    name,
    provider: kind === 'container_image' ? 'docker' : 'aws',
    origin: { mode: 'haunted-cloud', datasetId: 'property-test' },
    attributes,
  };
}

/** Scan one resource with a single rule. */
export function scanRule(resource: HauntedResource, ruleId: string): ScanReport {
  return scan([resource], { allow: [ruleId] });
}

/** Scan one resource with every built-in rule. */
export function scanAll(resource: HauntedResource): ScanReport {
  return scan([resource]);
}

/**
 * Findings as a sorted `ruleId|severity` list. Patches that remove an array
 * element shift later location keys, so patch verification compares reports by
 * rule and severity instead of by location.
 */
export function signature(findings: readonly Finding[]): string[] {
  return findings.map((finding) => `${finding.ruleId}|${finding.severity}`).sort();
}

/** `list` without one occurrence of `item`. */
export function without(list: readonly string[], item: string): string[] {
  const index = list.indexOf(item);
  return index === -1 ? [...list] : [...list.slice(0, index), ...list.slice(index + 1)];
}

/** The `document.Statement` list of a policy resource. */
export function statementsOf(resource: HauntedResource): readonly JsonObject[] {
  const document = resource.attributes['document'] as JsonObject;
  return document['Statement'] as readonly JsonObject[];
}

/** Apply a patch that must apply; throws a readable error otherwise. */
export function mustApply(resource: HauntedResource, patch: ExorcismPatch): HauntedResource {
  const result = applyPatch(resource, patch);
  if (!result.ok) {
    throw new Error(`patch ${patch.id} did not apply: ${result.error}`);
  }
  return result.resource;
}
