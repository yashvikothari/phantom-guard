import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scan } from '../../../src/index.js';
import type { JsonObject, JsonValue } from '../../../src/index.js';
import { makeResource, scanRule } from '../../support/resources.js';
import { FC_PARAMS } from '../../support/fc.js';

const RULE = 'PG-IAM-002';

type PrincipalKind = 'star' | 'aws-star' | 'aws-list-with-star' | 'account' | 'service' | 'none';

const principalKind = fc.constantFrom<PrincipalKind>(
  'star',
  'aws-star',
  'aws-list-with-star',
  'account',
  'service',
  'none',
);

function principalJson(kind: PrincipalKind): JsonValue | undefined {
  switch (kind) {
    case 'star':
      return '*';
    case 'aws-star':
      return { AWS: '*' };
    case 'aws-list-with-star':
      return { AWS: ['arn:aws:iam::123456789012:root', '*'] };
    case 'account':
      return { AWS: 'arn:aws:iam::123456789012:root' };
    case 'service':
      return { Service: 'lambda.amazonaws.com' };
    case 'none':
      return undefined;
  }
}

const isPublic = (kind: PrincipalKind): boolean =>
  kind === 'star' || kind === 'aws-star' || kind === 'aws-list-with-star';

interface Generated {
  readonly effect: 'Allow' | 'Deny';
  readonly kind: PrincipalKind;
  readonly condition: boolean;
  readonly where: 'document' | 'trustPolicy';
}

const generated = fc.record({
  effect: fc.constantFrom<'Allow' | 'Deny'>('Allow', 'Deny'),
  kind: principalKind,
  condition: fc.boolean(),
  where: fc.constantFrom<'document' | 'trustPolicy'>('document', 'trustPolicy'),
});

function statement({ effect, kind, condition }: Generated): JsonObject {
  const principal = principalJson(kind);
  return {
    Effect: effect,
    ...(principal === undefined ? {} : { Principal: principal }),
    Action: 'sts:AssumeRole',
    ...(condition ? { Condition: { StringEquals: { 'aws:PrincipalOrgID': 'o-example' } } } : {}),
  };
}

function roleOf(items: readonly Generated[]) {
  const documentFor = (where: Generated['where']): JsonObject => ({
    Version: '2012-10-17',
    Statement: items.filter((item) => item.where === where).map(statement),
  });
  return makeResource('aws_iam_role', {
    document: documentFor('document'),
    trustPolicy: documentFor('trustPolicy'),
  });
}

describe('PG-IAM-002 public principal', () => {
  // Feature: phantom-guard, Property 18: Public principals are rated by their Condition
  // Validates: Requirements 5.8, 5.9
  it('flags exactly the Allow statements with a wildcard Principal, CRITICAL without a Condition and MEDIUM with one', () => {
    fc.assert(
      fc.property(fc.array(generated, { minLength: 1, maxLength: 6 }), (items) => {
        const findings = scanRule(roleOf(items), RULE).findings;
        const expected = items
          .filter((item) => item.effect === 'Allow' && isPublic(item.kind))
          .map((item) => (item.condition ? 'MEDIUM' : 'CRITICAL'))
          .sort();
        expect(findings.map((finding) => finding.severity).sort()).toEqual(expected);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 18: Public principals are rated by their Condition
  // Validates: Requirements 5.8, 5.9
  it('never flags Deny statements, named principals or statements without a Principal', () => {
    fc.assert(
      fc.property(fc.array(generated, { minLength: 1, maxLength: 6 }), (items) => {
        const harmless = items.map((item): Generated =>
          item.effect === 'Allow' && isPublic(item.kind) ? { ...item, kind: 'account' } : item,
        );
        expect(scanRule(roleOf(harmless), RULE).findings).toEqual([]);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 18: Public principals are rated by their Condition
  // Validates: Requirements 10.6
  it('never invents a patch: the Finding carries guidance', () => {
    fc.assert(
      fc.property(fc.array(generated, { minLength: 1, maxLength: 6 }), (items) => {
        for (const finding of scanRule(roleOf(items), RULE).findings) {
          expect(finding.patch).toBeUndefined();
          expect(finding.guidance).toBeTruthy();
        }
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 9: Scan output is deterministic and ordered
  // Validates: Requirements 9.2, 9.6
  it('is deterministic and ordered by severity', () => {
    fc.assert(
      fc.property(fc.array(generated, { minLength: 1, maxLength: 6 }), (items) => {
        const resource = roleOf(items);
        const first = scan([resource], { allow: [RULE] });
        expect(scan([resource], { allow: [RULE] })).toEqual(first);
        const order = first.findings.map((finding) => finding.severity === 'CRITICAL');
        expect(order).toEqual([...order].sort((a, b) => Number(b) - Number(a)));
      }),
      FC_PARAMS,
    );
  });
});
