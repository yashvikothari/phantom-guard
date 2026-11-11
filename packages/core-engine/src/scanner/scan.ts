import type { DetectionRule } from '../contracts/detection-rule.js';
import type { ConfigFormat, HauntedResource } from '../contracts/haunted-resource.js';
import type { Diagnostic, Finding, ScanReport } from '../contracts/scan.js';
import { SEVERITY_WEIGHT } from '../contracts/severity.js';
import type { Severity } from '../contracts/severity.js';
import { ALL_RULES } from '../rules/index.js';
import { cloneFrozen } from '../util/clone.js';
import { severityRank } from '../util/severity.js';
import { printable } from '../util/text.js';
import { createRuleRegistry } from './registry.js';

/** Resources beyond this count are not scanned (Requirement 2.5). */
export const MAX_RESOURCES = 5000;

export interface ScanOptions {
  /** Rules to run. Defaults to every built-in rule. */
  readonly rules?: readonly DetectionRule[];
  /** Run only these rule ids. */
  readonly allow?: readonly string[];
  /** Never run these rule ids. */
  readonly deny?: readonly string[];
  /** Recorded in the report when the resources came from parsing text. */
  readonly format?: ConfigFormat;
  /** Diagnostics produced earlier (parsing); they are placed first in the report. */
  readonly diagnostics?: readonly Diagnostic[];
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function compareFindings(a: Finding, b: Finding): number {
  return (
    severityRank(a.severity) - severityRank(b.severity) ||
    compareText(a.ruleId, b.ruleId) ||
    compareText(a.resourceId, b.resourceId) ||
    compareText(a.locationKey, b.locationKey)
  );
}

/**
 * Where a finding points when its rule cannot name a finer location. A Terraform resource is
 * one block, so the block's first line is a useful anchor; other sources have no such block.
 */
function blockLine(resource: HauntedResource): number | undefined {
  const { origin } = resource;
  return origin.mode === 'custom-config' && origin.format === 'terraform'
    ? origin.startLine
    : undefined;
}

function describeError(error: unknown): string {
  return printable(error instanceof Error ? error.message : String(error), 160);
}

/**
 * Scan resources with the enabled rules and assemble a ScanReport.
 *
 * Pure: the report depends only on the arguments. Rules receive a deeply frozen
 * copy of each resource, and a rule that throws becomes a `PG-RULE-ERROR`
 * Diagnostic instead of aborting the scan.
 */
export function scan(resources: readonly HauntedResource[], options: ScanOptions = {}): ScanReport {
  const registry = createRuleRegistry(options.rules ?? ALL_RULES);
  const allow = options.allow;
  const deny = options.deny ?? [];
  const enabled = registry.rules.filter(
    (rule) => (allow === undefined || allow.includes(rule.id)) && !deny.includes(rule.id),
  );

  const diagnostics: Diagnostic[] = [...(options.diagnostics ?? [])];
  let candidates = resources;
  if (resources.length > MAX_RESOURCES) {
    candidates = resources.slice(0, MAX_RESOURCES);
    diagnostics.push({
      code: 'PG-LIMIT-RESOURCES',
      level: 'warning',
      message: `Scanned the first ${String(MAX_RESOURCES)} of ${String(resources.length)} resources.`,
    });
  }

  const scanned: HauntedResource[] = [];
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const seenIds = new Set<string>();

  for (const original of candidates) {
    // Patches address a resource by id, so a duplicate id would make them ambiguous (Requirement 3.2).
    if (seenIds.has(original.id)) {
      diagnostics.push({
        code: 'PG-RESOURCE-DUPLICATE-ID',
        level: 'warning',
        message: `Skipped a resource with the duplicate id "${printable(original.id, 80)}". Ids must be unique within one scan.`,
      });
      continue;
    }
    seenIds.add(original.id);

    const resource = cloneFrozen(original);
    scanned.push(resource);

    for (const rule of enabled) {
      if (!rule.appliesTo.includes(resource.kind)) {
        continue;
      }
      const fail = (step: string, error: unknown): void => {
        diagnostics.push({
          code: 'PG-RULE-ERROR',
          level: 'error',
          message: `Rule ${rule.id} failed during ${step} on ${resource.id}: ${describeError(error)}`,
        });
      };

      let violations: ReturnType<DetectionRule['evaluate']> = [];
      try {
        violations = rule.evaluate(resource);
      } catch (error) {
        fail('evaluate', error);
      }

      for (const violation of violations) {
        const key = `${rule.id}\u0000${resource.id}\u0000${violation.locationKey}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        let remediation: ReturnType<DetectionRule['remediate']> | undefined;
        try {
          remediation = rule.remediate(resource, violation);
        } catch (error) {
          fail('remediate', error);
        }

        const line = violation.line ?? blockLine(resource);
        findings.push({
          ruleId: rule.id,
          severity: violation.severity,
          resourceId: resource.id,
          resourceName: resource.name,
          message: violation.message,
          locationKey: violation.locationKey,
          ...(line === undefined ? {} : { line }),
          references: violation.references ?? rule.references,
          evidence: violation.evidence,
          ...(remediation?.kind === 'patch' ? { patch: remediation.patch } : {}),
          ...(remediation?.kind === 'guidance' ? { guidance: remediation.guidance } : {}),
        });
      }

      if (rule.diagnose !== undefined) {
        try {
          diagnostics.push(...rule.diagnose(resource));
        } catch (error) {
          fail('diagnose', error);
        }
      }
    }
  }

  findings.sort(compareFindings);

  const bySeverity: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  let weight = 0;
  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    weight += SEVERITY_WEIGHT[finding.severity];
  }

  return {
    ...(options.format === undefined ? {} : { format: options.format }),
    resources: scanned,
    findings,
    diagnostics,
    summary: { total: findings.length, bySeverity, riskScore: Math.min(100, weight) },
  };
}
