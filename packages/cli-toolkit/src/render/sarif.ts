import { ALL_RULES } from '@phantomguard/core-engine';
import type { DetectionRule, Diagnostic, Finding, Severity } from '@phantomguard/core-engine';
import type { InputError, ScanResult } from '../types.js';

type SarifLevel = 'error' | 'warning' | 'note';

const LEVEL: Readonly<Record<Severity, SarifLevel>> = {
  CRITICAL: 'error',
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'note',
  INFO: 'note',
};

/** GitHub code scanning reads `security-severity` as a CVSS-like score: >=9 critical, 7-8.9 high, 4-6.9 medium, <4 low. */
const SECURITY_SEVERITY: Readonly<Record<Severity, string>> = {
  CRITICAL: '9.5',
  HIGH: '8.0',
  MEDIUM: '5.5',
  LOW: '3.0',
  INFO: '0.0',
};

const DIAGNOSTIC_LEVEL: Readonly<Record<Diagnostic['level'], SarifLevel>> = {
  error: 'error',
  warning: 'warning',
  info: 'note',
};

/** A relative or absolute path as a URI reference. Each segment is percent-encoded. */
function toUri(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/** `IAM policy grants wildcard permissions` becomes `IamPolicyGrantsWildcardPermissions`. */
function pascalCase(text: string): string {
  return text
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function ruleDescriptor(rule: DetectionRule): Record<string, unknown> {
  return {
    id: rule.id,
    name: pascalCase(rule.title),
    shortDescription: { text: rule.title },
    fullDescription: { text: rule.description },
    defaultConfiguration: { level: LEVEL[rule.defaultSeverity] },
    properties: {
      tags: ['security', rule.category.toLowerCase()],
      'security-severity': SECURITY_SEVERITY[rule.defaultSeverity],
      references: rule.references.map(
        (reference) =>
          `${reference.benchmark} ${reference.version} ${reference.control}: ${reference.title}`,
      ),
    },
  };
}

function location(
  path: string,
  line: number | undefined,
  column?: number,
): Record<string, unknown> {
  return {
    physicalLocation: {
      artifactLocation: { uri: toUri(path) },
      ...(line === undefined
        ? {}
        : {
            region: { startLine: line, ...(column === undefined ? {} : { startColumn: column }) },
          }),
    },
  };
}

function resultFor(path: string, finding: Finding, ruleIndex: number): Record<string, unknown> {
  return {
    ruleId: finding.ruleId,
    ruleIndex,
    level: LEVEL[finding.severity],
    message: { text: finding.message },
    locations: [location(path, finding.line)],
    partialFingerprints: {
      'phantomguard/v1': `${finding.ruleId}:${finding.resourceId}:${finding.locationKey}`,
    },
    properties: {
      severity: finding.severity,
      resource: finding.resourceName,
      ...(finding.patch === undefined
        ? {}
        : { fixTitle: finding.patch.title, fixReviewRequired: finding.patch.reviewRequired }),
    },
  };
}

function notification(
  level: SarifLevel,
  code: string,
  message: string,
  path: string,
  line?: number,
  column?: number,
): Record<string, unknown> {
  return {
    level,
    message: { text: message },
    descriptor: { id: code },
    locations: [location(path, line, column)],
  };
}

/**
 * SARIF 2.1.0 log: one reportingDescriptor per built-in DetectionRule, one result per
 * Finding with a physical location, and parse problems as tool notifications.
 * Finding text is redacted when the report is built; evidence is not emitted at all.
 */
export function renderSarif(
  results: readonly ScanResult[],
  errors: readonly InputError[],
  version: string,
): string {
  const rules: readonly DetectionRule[] = ALL_RULES;
  const indexOf = new Map(rules.map((rule, index) => [rule.id, index] as const));

  const sarifResults = results.flatMap(({ path, report }) =>
    report.findings.map((finding) => resultFor(path, finding, indexOf.get(finding.ruleId) ?? -1)),
  );

  const notifications = [
    ...results.flatMap(({ path, report }) =>
      report.diagnostics.map((diagnostic) =>
        notification(
          DIAGNOSTIC_LEVEL[diagnostic.level],
          diagnostic.code,
          diagnostic.message,
          path,
          diagnostic.line,
          diagnostic.column,
        ),
      ),
    ),
    ...errors.map((error) =>
      notification('error', 'PG-INPUT-UNREADABLE', error.message, error.path),
    ),
  ];

  const failed =
    errors.length > 0 ||
    results.some(({ report }) =>
      report.diagnostics.some((diagnostic) => diagnostic.level === 'error'),
    );

  const log = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'PhantomGuard',
            version,
            rules: rules.map(ruleDescriptor),
          },
        },
        invocations: [{ executionSuccessful: !failed, toolExecutionNotifications: notifications }],
        results: sarifResults,
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
