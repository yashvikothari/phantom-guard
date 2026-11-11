import type { ComplianceReference } from './detection-rule.js';
import type { ExorcismPatch } from './exorcism-patch.js';
import type { ConfigFormat, HauntedResource } from './haunted-resource.js';
import type { JsonObject } from './json.js';
import type { Severity } from './severity.js';

/** One rule violation on one resource. The Playground calls it a "haunting". */
export interface Finding {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly resourceId: string;
  readonly resourceName: string;
  readonly message: string;
  readonly locationKey: string;
  /** 1-based source line, when known. */
  readonly line?: number;
  readonly references: readonly ComplianceReference[];
  readonly evidence: JsonObject;
  /** Present when a safe deterministic fix exists. */
  readonly patch?: ExorcismPatch;
  /** Present when no patch exists and a human must act. */
  readonly guidance?: string;
}

/** A non-Finding message from parsing or scanning. */
export interface Diagnostic {
  /** Stable code, for example `PG-PARSE-SYNTAX`. */
  readonly code: string;
  readonly level: 'error' | 'warning' | 'info';
  readonly message: string;
  /** 1-based. */
  readonly line?: number;
  /** 1-based. */
  readonly column?: number;
}

export interface ScanSummary {
  readonly total: number;
  readonly bySeverity: Readonly<Record<Severity, number>>;
  /** 0 to 100: the sum of per-Finding weights, capped. The Playground labels it "Haunting level". */
  readonly riskScore: number;
}

export interface ScanReport {
  /** The format the input was parsed as. Absent for dataset scans. */
  readonly format?: ConfigFormat;
  readonly resources: readonly HauntedResource[];
  readonly findings: readonly Finding[];
  readonly diagnostics: readonly Diagnostic[];
  readonly summary: ScanSummary;
}
