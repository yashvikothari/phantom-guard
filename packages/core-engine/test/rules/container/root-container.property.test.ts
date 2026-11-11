import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyPatch, scan, scanText } from '../../../src/index.js';
import type { JsonObject } from '../../../src/index.js';
import {
  dockerfile,
  imageOf,
  isRoot,
  renderDockerfile,
  taskDefinition,
} from '../../arbitraries/container.js';
import { FC_PARAMS } from '../../support/fc.js';
import { mustApply, scanRule, signature, without } from '../../support/resources.js';

const RULE = 'PG-CTR-001';

describe('PG-CTR-001 root container: Dockerfile', () => {
  // Feature: phantom-guard, Property 8: Final-stage user decides container findings
  // Validates: Requirements 8.1, 8.2, 8.5
  it('flags a Dockerfile if and only if the last USER of the FINAL stage is missing or root', () => {
    fc.assert(
      fc.property(dockerfile, ({ stages, text }) => {
        const finalStage = stages[stages.length - 1];
        const lastUser = finalStage?.users[finalStage.users.length - 1];
        const findings = scanText(text).findings.filter((finding) => finding.ruleId === RULE);
        expect(findings.map((finding) => finding.severity)).toEqual(
          isRoot(lastUser) ? ['HIGH'] : [],
        );
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 8: Final-stage user decides container findings
  // Validates: Requirements 8.5
  it('ignores what earlier stages do', () => {
    fc.assert(
      fc.property(dockerfile, fc.constantFrom('root', 'app'), ({ stages }, earlierUser) => {
        const [first, ...rest] = stages;
        if (first === undefined || rest.length === 0) {
          return;
        }
        const changed = [{ ...first, users: [earlierUser] }, ...rest];
        expect(scanText(renderDockerfile(changed)).findings.map((f) => f.severity)).toEqual(
          scanText(renderDockerfile(stages)).findings.map((f) => f.severity),
        );
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 8: Final-stage user decides container findings
  // Validates: Requirements 8.6
  it('reports an unresolved variable user as an info diagnostic, never as a finding', () => {
    fc.assert(
      fc.property(fc.constantFrom('${APP_USER}', '$APP_USER', '${UID:-1000}'), (variable) => {
        const report = scanText(`FROM node:22\nUSER ${variable}\n`);
        expect(report.findings).toEqual([]);
        expect(report.diagnostics.map((d) => [d.code, d.level])).toEqual([
          ['PG-CTR-UNRESOLVED-USER', 'info'],
        ]);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 9: Scan output is deterministic and ordered
  // Validates: Requirements 9.6
  it('is deterministic', () => {
    fc.assert(
      fc.property(dockerfile, ({ text }) => {
        expect(scanText(text)).toEqual(scanText(text));
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 11: Patches fix the finding and nothing else
  // Validates: Requirements 11.2, 11.3
  it('clears the finding and adds none when the patch is applied', () => {
    fc.assert(
      fc.property(dockerfile, ({ text }) => {
        const resource = imageOf(text);
        const before = scan([resource]);
        const finding = before.findings[0];
        if (finding?.patch === undefined) {
          return;
        }
        const after = scan([mustApply(resource, finding.patch)]);
        expect(signature(after.findings)).toEqual(
          without(signature(before.findings), `${finding.ruleId}|${finding.severity}`),
        );
        expect(finding.patch.reviewRequired).toBe(true);
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 12: Patch application is pure and idempotent
  // Validates: Requirements 11.1, 11.4
  it('applies the patch without mutation and idempotently', () => {
    fc.assert(
      fc.property(dockerfile, ({ text }) => {
        const resource = imageOf(text);
        const snapshot = JSON.stringify(resource);
        const finding = scan([resource]).findings[0];
        if (finding?.patch === undefined) {
          return;
        }
        const once = mustApply(resource, finding.patch);
        expect(JSON.stringify(resource)).toBe(snapshot);
        const twice = applyPatch(once, finding.patch);
        expect(twice.ok && twice.resource).toEqual(once);
      }),
      FC_PARAMS,
    );
  });
});

describe('PG-CTR-001 root container: ECS task definition', () => {
  // Feature: phantom-guard, Property 8: Final-stage user decides container findings
  // Validates: Requirements 8.3, 8.4
  it('flags privileged containers CRITICAL and missing or root users HIGH, one finding per container', () => {
    fc.assert(
      fc.property(taskDefinition, ({ containers, resource }) => {
        const findings = scanRule(resource, RULE).findings;
        containers.forEach((item, index) => {
          const matching = findings.filter((f) => f.locationKey === `container:${String(index)}`);
          const expected =
            item.privileged === true ? 'CRITICAL' : isRoot(item.user) ? 'HIGH' : undefined;
          expect(matching.map((f) => f.severity)).toEqual(expected === undefined ? [] : [expected]);
        });
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 11: Patches fix the finding and nothing else
  // Validates: Requirements 11.2, 11.3
  it('clears the finding, adds none, and leaves the other containers untouched', () => {
    fc.assert(
      fc.property(taskDefinition, ({ resource }) => {
        const before = scan([resource]);
        const originals = resource.attributes['containers'] as JsonObject[];
        for (const finding of before.findings) {
          if (finding.patch === undefined) {
            continue;
          }
          const patched = mustApply(resource, finding.patch);
          const after = scan([patched]);
          expect(signature(after.findings)).toEqual(
            without(signature(before.findings), `${finding.ruleId}|${finding.severity}`),
          );
          const index = Number(finding.evidence['containerIndex']);
          const containers = patched.attributes['containers'] as JsonObject[];
          containers.forEach((item, position) => {
            if (position !== index) {
              expect(item).toEqual(originals[position]);
            }
          });
          expect(containers[index]?.['privileged']).not.toBe(true);
          expect(finding.patch.reviewRequired).toBe(true);
        }
      }),
      FC_PARAMS,
    );
  });

  // Feature: phantom-guard, Property 12: Patch application is pure and idempotent
  // Validates: Requirements 11.1, 11.4
  it('applies patches without mutation and idempotently', () => {
    fc.assert(
      fc.property(taskDefinition, ({ resource }) => {
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
});
