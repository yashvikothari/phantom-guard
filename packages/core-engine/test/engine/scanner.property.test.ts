import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ALL_RULES,
  applyPatch,
  createRuleRegistry,
  loadDataset,
  redactReport,
  scan,
  scanText,
} from '../../src/index.js';
import type { DetectionRule, JsonObject, JsonValue } from '../../src/index.js';
import { policy } from '../arbitraries/iam.js';
import { FC_PARAMS } from '../support/fc.js';
import { makeResource } from '../support/resources.js';

const SECRET = 'hunter2-Zk9qL3vX';

const sensitiveKey = fc.constantFrom(
  'password',
  'db_password',
  'secret',
  'client_secret',
  'token',
  'api_token',
  'access_key',
  'aws_access_key_id',
  'accessKey',
  'DB_PASSWORD',
);

describe('scanner', () => {
  // Feature: phantom-guard, Property 14: Secrets are redacted
  // Validates: Requirements 10.7
  it('never leaks a secret through redactReport, messages, previews or diffs', () => {
    fc.assert(
      fc.property(policy, sensitiveKey, fc.boolean(), ({ resource }, key, asPair) => {
        const document = resource.attributes['document'] as JsonObject;
        const statements = document['Statement'] as JsonObject[];
        const secretEntry: JsonObject = asPair ? { name: key, value: SECRET } : { [key]: SECRET };
        const tainted = makeResource('aws_iam_policy', {
          ...resource.attributes,
          document: {
            ...document,
            Statement: statements.map((statement, index) =>
              index === 0 ? { ...statement, Note: [secretEntry] as JsonValue } : statement,
            ),
          },
        });
        const report = scan([tainted]);

        for (const finding of report.findings) {
          const printable = JSON.stringify([
            finding.message,
            finding.guidance ?? '',
            finding.patch?.preview,
            finding.patch?.rationale,
          ]);
          expect(printable.includes(SECRET)).toBe(false);
        }
        expect(JSON.stringify(redactReport(report)).includes(SECRET)).toBe(false);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 15: A throwing rule does not break the scan
  // Validates: Requirements 4.3, 4.4
  it('turns a throwing rule into a PG-RULE-ERROR diagnostic and returns the same findings as without it', () => {
    const baseRule = ALL_RULES[0];
    if (baseRule === undefined) {
      throw new Error('no built-in rules');
    }
    fc.assert(
      fc.property(
        policy,
        fc.constantFrom<'evaluate' | 'remediate' | 'diagnose'>('evaluate', 'remediate', 'diagnose'),
        ({ resource }, where) => {
          const failing: DetectionRule = {
            ...baseRule,
            id: 'PG-IAM-099',
            evaluate: (target) => {
              if (where === 'evaluate') {
                throw new Error('boom');
              }
              return baseRule.evaluate(target);
            },
            remediate: (target, violation) => {
              if (where === 'remediate') {
                throw new Error('boom');
              }
              return baseRule.remediate(target, violation);
            },
            diagnose: () => {
              if (where === 'diagnose') {
                throw new Error('boom');
              }
              return [];
            },
          };
          const withFailing = scan([resource], { rules: [...ALL_RULES, failing] });
          const without = scan([resource]);

          // evaluate and diagnose run for every applicable resource; remediate runs only
          // when the rule produced a violation, so a Deny-only policy never reaches it.
          const failingStepRuns = where !== 'remediate' || baseRule.evaluate(resource).length > 0;
          const reported = withFailing.diagnostics.some(
            (d) => d.code === 'PG-RULE-ERROR' && d.message.includes('PG-IAM-099'),
          );
          expect(reported).toBe(failingStepRuns);
          expect(withFailing.findings.filter((f) => f.ruleId !== 'PG-IAM-099')).toEqual(
            without.findings,
          );
        },
      ),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 15: A throwing rule does not break the scan
  // Validates: Requirements 4.2, 4.3
  it('rejects duplicate and malformed rule ids, and hands rules a frozen resource', () => {
    const baseRule = ALL_RULES[0];
    if (baseRule === undefined) {
      throw new Error('no built-in rules');
    }
    expect(() => createRuleRegistry([baseRule, baseRule])).toThrow(
      /Duplicate detection rule id: PG-IAM-001/,
    );
    expect(() => createRuleRegistry([{ ...baseRule, id: 'XX-1' }])).toThrow(
      /Invalid detection rule id/,
    );

    fc.assert(
      fc.property(policy, ({ resource }) => {
        const mutating: DetectionRule = {
          ...baseRule,
          id: 'PG-IAM-098',
          evaluate: (target) => {
            (target as { attributes: unknown }).attributes = {};
            return [];
          },
        };
        const before = JSON.stringify(resource);
        const report = scan([resource], { rules: [mutating] });
        expect(report.diagnostics.some((d) => d.code === 'PG-RULE-ERROR')).toBe(true);
        expect(JSON.stringify(resource)).toBe(before);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 16: Prototype keys are inert
  // Validates: Requirements 3.5
  it('leaves Object.prototype untouched for JSON full of prototype keys', () => {
    const key = fc.constantFrom('__proto__', 'constructor', 'prototype');
    const hostile = fc
      .array(fc.tuple(key, fc.constantFrom('1', '{"polluted":true}', '[]', '"x"')), {
        minLength: 1,
        maxLength: 5,
      })
      .map((pairs) => pairs.map(([k, v]) => `"${k}":${v}`).join(','));
    const prototypeBefore = Object.getOwnPropertyNames(Object.prototype).sort();

    fc.assert(
      fc.property(hostile, hostile, (top, inner) => {
        const text = `{${top},"Statement":[{"Effect":"Allow","Action":"s3:*","Resource":"*",${inner}}]}`;
        const report = scanText(text);
        for (const finding of report.findings) {
          if (finding.patch !== undefined) {
            const resource = report.resources.find((r) => r.id === finding.resourceId);
            if (resource !== undefined) {
              applyPatch(resource, finding.patch);
            }
          }
        }
        expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
        expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(prototypeBefore);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 9: Scan output is deterministic and ordered
  // Validates: Requirements 3.2
  it('scans each resource id once and warns about every duplicate', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 1, maxLength: 12 }),
        (slots) => {
          const resources = slots.map((slot) =>
            makeResource('aws_ebs_volume', { encrypted: false, slot }, `v${String(slot)}`),
          );
          const report = scan(resources);
          const ids = report.resources.map((resource) => resource.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids).toEqual([...new Set(slots)].map((slot) => `aws_ebs_volume.v${String(slot)}`));
          const warnings = report.diagnostics.filter((d) => d.code === 'PG-RESOURCE-DUPLICATE-ID');
          expect(warnings.length).toBe(slots.length - new Set(slots).size);
          expect(report.findings.length).toBe(new Set(slots).size);
        },
      ),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 9: Scan output is deterministic and ordered
  // Validates: Requirements 4.5, 9.5
  it('honors allow and deny lists, and reports each finding once', () => {
    const ids = ALL_RULES.map((rule) => rule.id);
    fc.assert(
      fc.property(fc.subarray(ids), fc.subarray(ids), (allow, deny) => {
        const resources = loadDataset('haunted-mansion') ?? [];
        const report = scan(resources, { allow, deny });
        for (const finding of report.findings) {
          expect(allow.includes(finding.ruleId) && !deny.includes(finding.ruleId)).toBe(true);
        }
        const keys = report.findings.map((f) => `${f.ruleId}|${f.resourceId}|${f.locationKey}`);
        expect(new Set(keys).size).toBe(keys.length);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 9: Scan output is deterministic and ordered
  // Validates: Requirements 13.1, 13.3, 13.4, 13.5
  it('keeps the datasets honest: the sanctuary is clean and the mansion breaks every guardrail', () => {
    const clean = scan(loadDataset('sanctified-sanctuary') ?? []);
    expect(clean.findings).toEqual([]);
    expect(clean.summary.riskScore).toBe(0);

    const haunted = scan(loadDataset('haunted-mansion') ?? []);
    const found = new Set(haunted.findings.map((finding) => finding.ruleId));
    for (const id of ['PG-IAM-001', 'PG-NET-001', 'PG-STO-001', 'PG-CTR-001']) {
      expect(found.has(id)).toBe(true);
    }
    expect(loadDataset('haunted-mansion')).toEqual(loadDataset('haunted-mansion'));
  });
});
