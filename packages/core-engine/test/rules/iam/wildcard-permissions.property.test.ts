import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyPatch, scan } from '../../../src/index.js';
import type { Finding, Severity } from '../../../src/index.js';
import {
  actionStatement,
  anyAction,
  globalWildcard,
  partialWildcard,
  policy,
  serviceWildcard,
  toPolicyResource,
} from '../../arbitraries/iam.js';
import type { GeneratedStatement } from '../../arbitraries/iam.js';
import { FC_PARAMS } from '../../support/fc.js';
import { mustApply, scanRule, signature, statementsOf, without } from '../../support/resources.js';

const RULE = 'PG-IAM-001';
const RANK: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

type ActionClass = 'global' | 'service' | 'partial' | 'explicit';

/** The test's own classification of an action, written from Requirement 5, not copied from the rule. */
function classify(action: string): ActionClass {
  if (action === '*' || action === '*:*') {
    return 'global';
  }
  if (!action.includes('*') && !action.includes('?')) {
    return 'explicit';
  }
  return action.endsWith(':*') && !action.slice(0, -2).includes('*') ? 'service' : 'partial';
}

/** Oracle: the severity Requirement 5 assigns to a statement, or undefined when it is not flagged. */
function expectedSeverity(statement: GeneratedStatement): Severity | undefined {
  if (statement.effect !== 'Allow') {
    return undefined;
  }
  const bareStar = statement.resources.includes('*');
  const candidates: Severity[] = statement.actions.flatMap((action): Severity[] => {
    switch (classify(action)) {
      case 'global':
        return ['CRITICAL'];
      case 'service':
        return [bareStar ? 'HIGH' : 'MEDIUM'];
      case 'partial':
        return ['LOW'];
      case 'explicit':
        return [];
    }
  });
  if (statement.notActions.length > 0) {
    candidates.push('HIGH');
  }
  return candidates.sort((a, b) => RANK[a] - RANK[b])[0];
}

function findingFor(findings: readonly Finding[], index: number): Finding | undefined {
  return findings.find((finding) => finding.locationKey === `statement:${String(index)}`);
}

describe('PG-IAM-001 wildcard permissions', () => {
  // Feature: phantom-guard, Property 2: Wildcard Allow statements are always found
  // Validates: Requirements 5.1
  it('flags every Allow statement that grants "*" as CRITICAL', () => {
    fc.assert(
      fc.property(
        fc.array(
          actionStatement(
            fc.array(anyAction, { minLength: 1, maxLength: 3 }),
            fc.constant('Allow' as const),
          ),
          {
            minLength: 1,
            maxLength: 4,
          },
        ),
        fc.array(globalWildcard, { minLength: 1, maxLength: 1 }),
        fc.nat(3),
        (statements, wildcard, position) => {
          const at = position % statements.length;
          const withWildcard = statements.map((statement, index) =>
            index === at
              ? { ...statement, actions: [...statement.actions, ...wildcard] }
              : statement,
          );
          const report = scanRule(toPolicyResource(withWildcard), RULE);
          expect(findingFor(report.findings, at)?.severity).toBe('CRITICAL');
        },
      ),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 3: Deny statements and fully scoped statements are never flagged
  // Validates: Requirements 5.6
  it('never flags Deny statements or Allow statements with explicit actions', () => {
    fc.assert(
      fc.property(fc.array(actionStatement(), { minLength: 1, maxLength: 5 }), (statements) => {
        const safe = statements.map((statement): GeneratedStatement =>
          statement.effect === 'Deny'
            ? statement
            : {
                ...statement,
                actions: statement.actions.filter((a) => classify(a) === 'explicit'),
              },
        );
        const resource = toPolicyResource(
          safe.filter((s) => s.effect === 'Deny' || s.actions.length > 0),
        );
        expect(scanRule(resource, RULE).findings).toEqual([]);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 4: One finding per statement at the highest severity
  // Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.7
  it('reports at most one finding per statement, at the severity Requirement 5 dictates', () => {
    fc.assert(
      fc.property(policy, ({ statements, resource }) => {
        const findings = scanRule(resource, RULE).findings;
        statements.forEach((statement, index) => {
          const matching = findings.filter((f) => f.locationKey === `statement:${String(index)}`);
          const expected = expectedSeverity(statement);
          expect(matching.map((f) => f.severity)).toEqual(expected === undefined ? [] : [expected]);
        });
        expect(findings.length).toBeLessThanOrEqual(statements.length);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 4: One finding per statement at the highest severity
  // Validates: Requirements 5.7
  it('lists every offending action of a statement, sorted', () => {
    fc.assert(
      fc.property(policy, ({ statements, resource }) => {
        const findings = scanRule(resource, RULE).findings;
        statements.forEach((statement, index) => {
          const finding = findingFor(findings, index);
          if (finding === undefined) {
            return;
          }
          const offending = [
            ...new Set(statement.actions.filter((a) => classify(a) !== 'explicit')),
          ].sort();
          expect(finding.evidence['offendingActions']).toEqual(offending);
        });
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 9: Scan output is deterministic and ordered
  // Validates: Requirements 9.6
  it('is deterministic', () => {
    fc.assert(
      fc.property(policy, ({ resource }) => {
        expect(scanRule(resource, RULE)).toEqual(scanRule(resource, RULE));
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 11: Patches fix the finding and nothing else
  // Validates: Requirements 11.2, 11.3
  it('removes the finding and adds none when a patch is applied', () => {
    fc.assert(
      fc.property(policy, ({ resource }) => {
        const before = scan([resource]);
        for (const finding of before.findings) {
          if (finding.patch === undefined || finding.ruleId !== RULE) {
            continue;
          }
          const patched = mustApply(resource, finding.patch);
          const after = scan([patched]);
          expect(signature(after.findings)).toEqual(
            without(signature(before.findings), `${finding.ruleId}|${finding.severity}`),
          );
          expect(after.findings.map((f) => f.ruleId + f.locationKey)).not.toContain(
            finding.ruleId + finding.locationKey,
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
      fc.property(policy, ({ resource }) => {
        const snapshot = JSON.stringify(resource);
        for (const finding of scan([resource]).findings) {
          if (finding.patch === undefined) {
            continue;
          }
          const once = mustApply(resource, finding.patch);
          expect(JSON.stringify(resource)).toBe(snapshot);
          const twice = applyPatch(once, finding.patch);
          expect(twice.ok).toBe(true);
          expect(twice.ok && twice.resource).toEqual(once);
        }
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 13: Patches never widen access
  // Validates: Requirements 10.2, 10.3
  it('never adds a wildcard, widens actions or resources, or touches other keys', () => {
    fc.assert(
      fc.property(policy, ({ resource }) => {
        const before = statementsOf(resource);
        for (const finding of scan([resource]).findings) {
          if (finding.patch === undefined || finding.ruleId !== RULE) {
            continue;
          }
          const index = Number(finding.evidence['statementIndex']);
          const original = before[index];
          const updated = statementsOf(mustApply(resource, finding.patch))[index];
          expect(original).toBeDefined();
          expect(updated).toBeDefined();
          if (original === undefined || updated === undefined) {
            continue;
          }
          const newActions = updated['Action'] as string[];
          expect(newActions.some((a) => a.includes('*') || a.includes('?'))).toBe(false);
          expect(newActions).toEqual([...newActions].sort());
          expect(new Set(newActions).size).toBe(newActions.length);

          // Every new action must be allowed by something the statement already granted.
          const granted = [original['Action']].flat() as string[];
          for (const action of newActions) {
            expect(
              granted.some((pattern) => globMatches(pattern, action)),
              `${action} is not covered by ${JSON.stringify(granted)}`,
            ).toBe(true);
          }

          // Resource: unchanged, or narrowed to a subset that has no bare "*".
          const newResources = [updated['Resource']].flat() as string[];
          const oldResources = [original['Resource']].flat() as string[];
          if (!oldResources.includes('*')) {
            expect(updated['Resource']).toEqual(original['Resource']);
          } else if (!newResources.includes('*')) {
            expect(newResources.length).toBeGreaterThan(0);
          }

          // Sid, Effect, Condition and Principal are preserved.
          for (const key of ['Sid', 'Effect', 'Condition', 'Principal']) {
            expect(updated[key]).toEqual(original[key]);
          }
        }
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 17: IAM patches come from evidence, need review, and are never invented
  // Validates: Requirements 10.4
  it('derives the new actions from usage evidence when the evidence matches the wildcard', () => {
    fc.assert(
      fc.property(
        fc.array(
          anyAction.filter((a) => a.startsWith('s3:') && !a.includes('*')),
          {
            minLength: 1,
            maxLength: 5,
          },
        ),
        fc.array(
          anyAction.filter((a) => !a.startsWith('s3:') && !a.includes('*')),
          { maxLength: 4 },
        ),
        (s3Actions, otherActions) => {
          const statement: GeneratedStatement = {
            effect: 'Allow',
            actions: ['s3:*'],
            notActions: [],
            resources: ['*'],
            sid: undefined,
            hasCondition: false,
            scalar: true,
          };
          const resource = toPolicyResource([statement], {
            actions: [...s3Actions, ...otherActions],
            resources: [],
          });
          const finding = scanRule(resource, RULE).findings[0];
          expect(finding?.patch).toBeDefined();
          if (finding?.patch === undefined) {
            return;
          }
          const actions = statementsOf(mustApply(resource, finding.patch))[0]?.['Action'];
          expect(actions).toEqual([...new Set(s3Actions)].sort());
          expect(finding.patch.rationale).toMatch(/observed|usage/i);
        },
      ),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 17: IAM patches come from evidence, need review, and are never invented
  // Validates: Requirements 10.5, 10.6
  it('marks IAM patches review-required, never patches NotAction, and always explains a missing patch', () => {
    fc.assert(
      fc.property(policy, ({ statements, resource }) => {
        for (const finding of scanRule(resource, RULE).findings) {
          const index = Number(finding.evidence['statementIndex']);
          const statement = statements[index];
          if (statement?.notActions.length) {
            expect(finding.patch).toBeUndefined();
            expect(finding.guidance).toBeTruthy();
          }
          if (finding.patch !== undefined) {
            expect(finding.patch.reviewRequired).toBe(true);
            expect(finding.guidance).toBeUndefined();
          } else {
            expect(finding.guidance).toBeTruthy();
          }
        }
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 13: Patches never widen access
  // Validates: Requirements 10.2
  it('ignores usage evidence that the wildcard does not grant', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('s3:*', 'ec2:Describe*', 'logs:Get*'),
        fc.array(
          anyAction.filter((a) => !a.includes('*')),
          { minLength: 1, maxLength: 6 },
        ),
        (wildcard, observed) => {
          const statement: GeneratedStatement = {
            effect: 'Allow',
            actions: [wildcard],
            notActions: [],
            resources: ['arn:aws:s3:::bucket/*'],
            sid: undefined,
            hasCondition: false,
            scalar: true,
          };
          const resource = toPolicyResource([statement], { actions: observed, resources: [] });
          const finding = scanRule(resource, RULE).findings[0];
          const patched =
            finding?.patch === undefined ? undefined : mustApply(resource, finding.patch);
          if (patched === undefined) {
            return;
          }
          const actions = statementsOf(patched)[0]?.['Action'] as string[];
          for (const action of actions) {
            expect(globMatches(wildcard, action)).toBe(true);
          }
        },
      ),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 4: One finding per statement at the highest severity
  // Validates: Requirements 5.2, 5.3
  it('rates a service wildcard HIGH on "*" and MEDIUM on scoped resources', () => {
    fc.assert(
      fc.property(serviceWildcard, partialWildcard, fc.boolean(), (service, partial, bare) => {
        const statement: GeneratedStatement = {
          effect: 'Allow',
          actions: [service, partial],
          notActions: [],
          resources: bare ? ['*'] : ['arn:aws:s3:::bucket/*'],
          sid: undefined,
          hasCondition: false,
          scalar: false,
        };
        const finding = scanRule(toPolicyResource([statement]), RULE).findings[0];
        expect(finding?.severity).toBe(bare ? 'HIGH' : 'MEDIUM');
      }),
      FC_PARAMS,
    );
  });
});

/** Case-insensitive IAM glob match, written independently of the engine's implementation. */
function globMatches(pattern: string, text: string): boolean {
  const source = pattern
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${source}$`).test(text.toLowerCase());
}
