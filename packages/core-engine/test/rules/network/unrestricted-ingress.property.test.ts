import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyPatch, scan } from '../../../src/index.js';
import type { JsonObject } from '../../../src/index.js';
import {
  expectedSeverity,
  ingress,
  isOpen,
  securityGroup,
  toSecurityGroup,
} from '../../arbitraries/network.js';
import { FC_PARAMS } from '../../support/fc.js';
import { mustApply, scanRule, signature, without } from '../../support/resources.js';

const RULE = 'PG-NET-001';

describe('PG-NET-001 unrestricted ingress', () => {
  // Feature: phantom-guard, Property 5: Public non-web ingress is always found
  // Validates: Requirements 6.1, 6.2, 6.3, 6.6
  it('reports one finding per open rule at the severity of the exposed ports', () => {
    fc.assert(
      fc.property(securityGroup, ({ rules, resource }) => {
        const findings = scanRule(resource, RULE).findings;
        rules.forEach((rule, index) => {
          const matching = findings.filter((f) => f.locationKey === `ingress:${String(index)}`);
          const expected = expectedSeverity(rule);
          expect(matching.map((f) => f.severity)).toEqual(expected === undefined ? [] : [expected]);
        });
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 6: Narrow sources and public web ports are never flagged
  // Validates: Requirements 6.4, 6.5
  it('never flags narrow sources, private sources or exactly TCP 80 / 443', () => {
    fc.assert(
      fc.property(fc.array(ingress, { minLength: 1, maxLength: 6 }), (rules) => {
        const harmless = rules.map((rule) =>
          isOpen(rule.source) && expectedSeverity(rule) !== undefined
            ? { ...rule, source: 'private' as const }
            : rule,
        );
        expect(scanRule(toSecurityGroup(harmless), RULE).findings).toEqual([]);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 5: Public non-web ingress is always found
  // Validates: Requirements 6.6
  it('lists every sensitive port a range covers, in ascending order', () => {
    fc.assert(
      fc.property(securityGroup, ({ rules, resource }) => {
        const findings = scanRule(resource, RULE).findings;
        rules.forEach((rule, index) => {
          const finding = findings.find((f) => f.locationKey === `ingress:${String(index)}`);
          const sensitive = finding?.evidence['sensitivePorts'] as number[] | undefined;
          if (sensitive === undefined) {
            return;
          }
          expect(sensitive).toEqual([...sensitive].sort((a, b) => a - b));
          for (const p of sensitive) {
            expect(rule.fromPort <= p && p <= rule.toPort).toBe(true);
          }
        });
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 9: Scan output is deterministic and ordered
  // Validates: Requirements 9.2, 9.6
  it('is deterministic', () => {
    fc.assert(
      fc.property(securityGroup, ({ resource }) => {
        expect(scanRule(resource, RULE)).toEqual(scanRule(resource, RULE));
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 11: Patches fix the finding and nothing else
  // Validates: Requirements 11.2, 11.3
  it('removes the finding and adds none when a patch is applied', () => {
    fc.assert(
      fc.property(securityGroup, ({ resource }) => {
        const before = scan([resource]);
        for (const finding of before.findings) {
          if (finding.patch === undefined || finding.ruleId !== RULE) {
            continue;
          }
          const after = scan([mustApply(resource, finding.patch)]);
          expect(signature(after.findings)).toEqual(
            without(signature(before.findings), `${finding.ruleId}|${finding.severity}`),
          );
        }
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 12: Patch application is pure and idempotent
  // Validates: Requirements 11.1, 11.4
  it('applies patches without mutation and idempotently', () => {
    fc.assert(
      fc.property(securityGroup, ({ resource }) => {
        const snapshot = JSON.stringify(resource);
        for (const finding of scan([resource]).findings) {
          if (finding.patch === undefined) {
            continue;
          }
          const once = mustApply(resource, finding.patch);
          expect(JSON.stringify(resource)).toBe(snapshot);
          const twice = applyPatch(once, finding.patch);
          expect(twice.ok && twice.resource).toEqual(once);
        }
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 13: Patches never widen access
  // Validates: Requirements 10.2, 10.5
  it('removes exactly the public source (or the whole rule when nothing else remains), touches no other rule, and is review-required', () => {
    fc.assert(
      fc.property(securityGroup, ({ resource }) => {
        const before = resource.attributes['ingress'] as JsonObject[];
        for (const finding of scanRule(resource, RULE).findings) {
          expect(finding.patch?.reviewRequired).toBe(true);
          if (finding.patch === undefined) {
            continue;
          }
          const index = Number(finding.evidence['ruleIndex']);
          const target = before[index];
          expect(target).toBeDefined();
          if (target === undefined) {
            continue;
          }
          const after = mustApply(resource, finding.patch).attributes['ingress'] as JsonObject[];

          // Expected result, computed from the input alone.
          const v4 = ((target['cidrBlocks'] as string[] | undefined) ?? []).filter(
            (c) => c !== '0.0.0.0/0',
          );
          const v6 = ((target['ipv6CidrBlocks'] as string[] | undefined) ?? []).filter(
            (c) => c !== '::/0',
          );
          const otherSources =
            v4.length + v6.length > 0 ||
            ((target['securityGroups'] as string[] | undefined) ?? []).length > 0;

          const expected: JsonObject[] = otherSources
            ? before.map((rule, position) =>
                position === index ? { ...rule, cidrBlocks: v4, ipv6CidrBlocks: v6 } : rule,
              )
            : before.filter((_rule, position) => position !== index);
          expect(after).toEqual(expected);
        }
      }),
      FC_PARAMS,
    );
  });
});
