import type { ExorcismPatch } from './exorcism-patch.js';
import type { HauntedResource, ResourceKind } from './haunted-resource.js';
import type { JsonObject } from './json.js';
import type { Diagnostic } from './scan.js';
import type { Severity } from './severity.js';

/** A pointer to a control in a published benchmark. Versions matter: numbers change. */
export interface ComplianceReference {
  /** For example `CIS AWS Foundations Benchmark`. */
  readonly benchmark: string;
  /** For example `v3.0.0`. */
  readonly version: string;
  /** For example `1.16`. */
  readonly control: string;
  readonly title: string;
}

export type RuleCategory = 'IAM' | 'NET' | 'STO' | 'CTR';

export interface RuleViolation {
  readonly severity: Severity;
  readonly message: string;
  /** Stable key within one resource, used for deduplication, for example `statement:2`. */
  readonly locationKey: string;
  /** Machine-readable facts that the patch builder and the UI can use. */
  readonly evidence: JsonObject;
  /** 1-based source line, when the rule can pin one down. */
  readonly line?: number;
  /** Overrides the rule-level references when only some apply to this resource kind. */
  readonly references?: readonly ComplianceReference[];
}

export type Remediation =
  | { readonly kind: 'patch'; readonly patch: ExorcismPatch }
  | { readonly kind: 'guidance'; readonly guidance: string };

/**
 * A detection rule: metadata plus two pure functions. Neither function may
 * mutate its input, perform I/O, or read clocks or randomness. The scanner
 * passes a deeply frozen copy of the resource, so a mutation throws.
 */
export interface DetectionRule {
  /** `PG-<CATEGORY>-<NNN>`, unique within a registry. */
  readonly id: string;
  readonly category: RuleCategory;
  readonly title: string;
  /** Technical, factual description. */
  readonly description: string;
  /** Spooky name. Used by the Playground only, never by machine-readable output. */
  readonly ward: string;
  /** The highest severity this rule can emit. */
  readonly defaultSeverity: Severity;
  readonly appliesTo: readonly ResourceKind[];
  readonly references: readonly ComplianceReference[];
  evaluate(resource: HauntedResource): readonly RuleViolation[];
  /** A patch when a safe deterministic fix exists, otherwise guidance. */
  remediate(resource: HauntedResource, violation: RuleViolation): Remediation;
  /**
   * Optional. Informational messages that are not Findings, for example "the
   * user is a build variable, so it cannot be judged". Same purity rules as `evaluate`.
   */
  diagnose?(resource: HauntedResource): readonly Diagnostic[];
}
